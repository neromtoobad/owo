// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.sol";
import {MockMUSD, MockBorrowerOps} from "./Mocks.sol";
import {OwoDesk, IERC20, IBorrowerOperationsSignatures} from "../src/OwoDesk.sol";

contract OwoDeskTest is Base {
    MockMUSD musd;
    MockBorrowerOps bops;
    OwoDesk desk;

    address admin = address(0xA11CE);
    address relayer = address(0xBEEF);
    address treasury = address(0x7EA5);
    uint256 userKey = 0xA1;
    address user;
    uint256 otherKey = 0xB2;
    address other;

    bytes32 constant BANK = keccak256("salt|GTBINGLA|0123456789");
    bytes32 constant OTHER_BANK = keccak256("salt|ABNGNGLA|9999999999");
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function setUp() public {
        vm.warp(1_800_000_000);
        user = vm.addr(userKey);
        other = vm.addr(otherKey);
        musd = new MockMUSD();
        bops = new MockBorrowerOps(musd);
        desk = new OwoDesk(
            IERC20(address(musd)), IBorrowerOperationsSignatures(address(bops)), admin, relayer, treasury
        );
        musd.mint(user, 5_000e18);
        musd.mint(other, 5_000e18);
    }

    // ------------------------------------------------------------ helpers

    function _intent(address owner, uint256 amount, uint256 minNaira, bytes32 bank)
        internal
        view
        returns (OwoDesk.Intent memory)
    {
        return OwoDesk.Intent({
            owner: owner,
            amount: amount,
            minNaira: minNaira,
            recipientHash: bank,
            deadline: block.timestamp + 1 hours
        });
    }

    function _signIntent(uint256 key, OwoDesk.Intent memory intent) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, desk.intentDigest(intent));
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint256 key, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                musd.DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, address(desk), value, musd.nonces(owner), deadline))
            )
        );
        return vm.sign(key, digest);
    }

    function _walletOrder(uint256 amount, uint256 minNaira) internal returns (uint256 id) {
        vm.startPrank(user);
        musd.approve(address(desk), amount);
        id = desk.cashOut(amount, minNaira, BANK);
        vm.stopPrank();
    }

    function _status(uint256 id) internal view returns (uint256) {
        return uint256(desk.getOrder(id).status);
    }

    // ------------------------------------------------------------ happy paths

    function test_walletCashOut_takeSettle() public {
        uint256 id = _walletOrder(100e18, 135_000_00);
        assertEq(musd.balanceOf(address(desk)), 100e18, "locked");
        assertEq(_status(id), uint256(OwoDesk.Status.Open), "open");

        vm.prank(relayer);
        desk.take(id);
        assertEq(_status(id), uint256(OwoDesk.Status.Taken), "taken");

        vm.prank(relayer);
        desk.settle(id, 136_250_00, bytes32("pc-1"));
        OwoDesk.Order memory o = desk.getOrder(id);
        assertEq(uint256(o.status), uint256(OwoDesk.Status.Paid), "paid");
        assertEq(o.paidNaira, 136_250_00, "paidNaira");
        assertEq(o.payoutRef, bytes32("pc-1"), "ref");
        assertEq(musd.balanceOf(treasury), 100e18, "treasury");
        assertEq(musd.balanceOf(address(desk)), 0, "desk empty");
    }

    function test_permitCashOut_isGaslessForUser() public {
        OwoDesk.Intent memory it = _intent(user, 250e18, 300_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        (uint8 v, bytes32 r, bytes32 s) = _permit(userKey, user, 250e18, block.timestamp + 1 hours);

        vm.prank(relayer); // anyone may submit
        uint256 id = desk.cashOutWithPermit(it, sig, block.timestamp + 1 hours, v, r, s);

        OwoDesk.Order memory o = desk.getOrder(id);
        assertEq(o.owner, user, "owner");
        assertEq(o.amount, 250e18, "amount");
        assertEq(o.recipientHash, BANK, "bank");
        assertEq(musd.balanceOf(user), 4_750e18, "user debited");
        assertEq(desk.nonces(user), 1, "nonce");
    }

    function test_permitFrontRun_stillOpens() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        uint256 dl = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(userKey, user, 50e18, dl);
        musd.permit(user, address(desk), 50e18, dl, v, r, s); // griefer uses the permit first
        uint256 id = desk.cashOutWithPermit(it, sig, dl, v, r, s);
        assertEq(desk.getOrder(id).amount, 50e18, "opened anyway");
    }

    function test_borrowAndCashOut_mintsIntoOrder() public {
        OwoDesk.Intent memory it = _intent(user, 400e18, 500_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        uint256 userBefore = musd.balanceOf(user);

        vm.prank(relayer);
        uint256 id = desk.borrowAndCashOut(it, sig, address(0), address(0), new bytes(65), block.timestamp + 1 hours);

        assertEq(bops.lastBorrower(), user, "borrower");
        assertEq(musd.balanceOf(address(desk)), 400e18, "minted into desk");
        assertEq(musd.balanceOf(user), userBefore, "wallet untouched");
        assertEq(desk.getOrder(id).owner, user, "owner");
    }

    // ------------------------------------------------------------ signatures

    function test_intent_replayFails() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        vm.prank(user);
        musd.approve(address(desk), type(uint256).max);
        desk.cashOutWithPermit(it, sig, 0, 0, 0, 0);
        vm.expectRevert(OwoDesk.BadSignature.selector);
        desk.cashOutWithPermit(it, sig, 0, 0, 0, 0);
    }

    function test_intent_cannotSwapBank() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        vm.prank(user);
        musd.approve(address(desk), type(uint256).max);
        it.recipientHash = OTHER_BANK; // attacker redirects the payout
        vm.expectRevert(OwoDesk.BadSignature.selector);
        desk.cashOutWithPermit(it, sig, 0, 0, 0, 0);
    }

    function test_intent_cannotLowerFloor() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        it.minNaira = 1;
        vm.expectRevert(OwoDesk.BadSignature.selector);
        desk.borrowAndCashOut(it, sig, address(0), address(0), new bytes(65), block.timestamp + 1 hours);
    }

    function test_intent_wrongSigner() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(otherKey, it);
        vm.expectRevert(OwoDesk.BadSignature.selector);
        desk.borrowAndCashOut(it, sig, address(0), address(0), new bytes(65), block.timestamp + 1 hours);
    }

    function test_intent_expired() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        vm.warp(it.deadline + 1);
        vm.expectRevert(OwoDesk.Expired.selector);
        desk.borrowAndCashOut(it, sig, address(0), address(0), new bytes(65), block.timestamp + 1 hours);
    }

    function test_intent_highSRejected() public {
        OwoDesk.Intent memory it = _intent(user, 50e18, 60_000_00, BANK);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, desk.intentDigest(it));
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        bytes memory malleable = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(OwoDesk.BadSignature.selector);
        desk.borrowAndCashOut(it, malleable, address(0), address(0), new bytes(65), block.timestamp + 1 hours);
    }

    function test_borrow_mintMismatchReverts() public {
        bops.setMintBps(9_990);
        OwoDesk.Intent memory it = _intent(user, 100e18, 60_000_00, BANK);
        bytes memory sig = _signIntent(userKey, it);
        vm.expectRevert(OwoDesk.MintMismatch.selector);
        desk.borrowAndCashOut(it, sig, address(0), address(0), new bytes(65), block.timestamp + 1 hours);
    }

    // ------------------------------------------------------------ refunds

    function test_cancel_onlyOwner_onlyOpen() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(other);
        vm.expectRevert(OwoDesk.NotOwner.selector);
        desk.cancel(id);

        vm.prank(user);
        desk.cancel(id);
        assertEq(_status(id), uint256(OwoDesk.Status.Refunded), "refunded");
        assertEq(musd.balanceOf(user), 5_000e18, "back in wallet");

        vm.prank(user);
        vm.expectRevert(OwoDesk.BadStatus.selector);
        desk.cancel(id);
    }

    function test_cancel_afterTakeFails() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(relayer);
        desk.take(id);
        vm.prank(user);
        vm.expectRevert(OwoDesk.BadStatus.selector);
        desk.cancel(id);
    }

    function test_reclaim_afterWindow() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(relayer);
        desk.take(id);

        vm.warp(block.timestamp + 6 hours);
        vm.prank(user);
        vm.expectRevert(OwoDesk.TooEarly.selector);
        desk.reclaim(id);

        vm.warp(block.timestamp + 1);
        vm.prank(user);
        desk.reclaim(id);
        assertEq(musd.balanceOf(user), 5_000e18, "reclaimed");

        vm.prank(relayer);
        vm.expectRevert(OwoDesk.BadStatus.selector);
        desk.settle(id, 1, bytes32(0));
    }

    function test_reject_refunds() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(relayer);
        desk.reject(id);
        assertEq(musd.balanceOf(user), 5_000e18, "refunded");
        assertEq(_status(id), uint256(OwoDesk.Status.Refunded), "status");
    }

    function test_settle_belowFloorReverts() public {
        uint256 id = _walletOrder(100e18, 135_000_00);
        vm.prank(relayer);
        desk.take(id);
        vm.prank(relayer);
        vm.expectRevert(OwoDesk.NairaBelowFloor.selector);
        desk.settle(id, 134_999_99, bytes32(0));
    }

    function test_settle_requiresTake() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(relayer);
        vm.expectRevert(OwoDesk.BadStatus.selector);
        desk.settle(id, 1, bytes32(0));
    }

    // ------------------------------------------------------------ access + limits

    function test_onlyRelayer() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.startPrank(user);
        vm.expectRevert(OwoDesk.NotRelayer.selector);
        desk.take(id);
        vm.expectRevert(OwoDesk.NotRelayer.selector);
        desk.settle(id, 1, bytes32(0));
        vm.expectRevert(OwoDesk.NotRelayer.selector);
        desk.reject(id);
        vm.stopPrank();
    }

    function test_limits() public {
        vm.startPrank(user);
        musd.approve(address(desk), type(uint256).max);
        vm.expectRevert(OwoDesk.BadAmount.selector);
        desk.cashOut(0.5e18, 1, BANK);
        vm.expectRevert(OwoDesk.BadAmount.selector);
        desk.cashOut(2_001e18, 1, BANK);
        vm.expectRevert(OwoDesk.BadRecipient.selector);
        desk.cashOut(10e18, 1, bytes32(0));
        vm.expectRevert(OwoDesk.BadRecipient.selector);
        desk.cashOut(10e18, 0, BANK);
        vm.stopPrank();
    }

    function test_dayCap_andRefundFreesRoom() public {
        vm.prank(admin);
        desk.setLimits(1e18, 2_000e18, 3_000e18, 6 hours);
        uint256 a = _walletOrder(2_000e18, 1);
        vm.startPrank(user);
        musd.approve(address(desk), type(uint256).max);
        vm.expectRevert(OwoDesk.OverDayCap.selector);
        desk.cashOut(1_500e18, 1, BANK);
        desk.cancel(a);
        desk.cashOut(1_500e18, 1, BANK); // room is back after the refund
        vm.stopPrank();
        assertEq(desk.dayRoom(), 1_500e18, "room");

        vm.warp(block.timestamp + 1 days);
        assertEq(desk.dayRoom(), 3_000e18, "new day");
    }

    function test_paused() public {
        vm.prank(admin);
        desk.setPaused(true);
        vm.startPrank(user);
        musd.approve(address(desk), 10e18);
        vm.expectRevert(OwoDesk.Paused.selector);
        desk.cashOut(10e18, 1, BANK);
        vm.stopPrank();
    }

    function test_pausedStillLetsUsersExit() public {
        uint256 id = _walletOrder(100e18, 1);
        vm.prank(admin);
        desk.setPaused(true);
        vm.prank(user);
        desk.cancel(id);
        assertEq(musd.balanceOf(user), 5_000e18, "exit while paused");
    }

    function test_admin() public {
        vm.prank(user);
        vm.expectRevert(OwoDesk.NotAdmin.selector);
        desk.setRelayer(user);

        vm.startPrank(admin);
        vm.expectRevert(OwoDesk.BadLimits.selector);
        desk.setLimits(10e18, 5e18, 100e18, 6 hours);
        vm.expectRevert(OwoDesk.BadLimits.selector);
        desk.setLimits(1e18, 5e18, 100e18, 1 minutes);
        vm.expectRevert(OwoDesk.ZeroAddress.selector);
        desk.setTreasury(address(0));
        desk.proposeAdmin(other);
        vm.stopPrank();

        vm.prank(user);
        vm.expectRevert(OwoDesk.NotAdmin.selector);
        desk.acceptAdmin();
        vm.prank(other);
        desk.acceptAdmin();
        assertEq(desk.admin(), other, "new admin");
    }

    function test_failedTransferReverts() public {
        vm.prank(user);
        musd.approve(address(desk), 10e18);
        musd.setFailTransfers(true);
        vm.prank(user);
        vm.expectRevert(OwoDesk.TransferFailed.selector);
        desk.cashOut(10e18, 1, BANK);
    }

    // ------------------------------------------------------------ fuzz

    /// The desk always holds exactly the MUSD of open and taken orders, and every
    /// order ends with its MUSD either back with the owner or at the treasury.
    function testFuzz_accounting(uint256 seed) public {
        vm.prank(user);
        musd.approve(address(desk), type(uint256).max);
        vm.prank(other);
        musd.approve(address(desk), type(uint256).max);

        uint256 paidOut;
        for (uint256 step = 0; step < 24; step++) {
            uint256 r = uint256(keccak256(abi.encode(seed, step)));
            uint256 op = r % 6;
            uint256 n = desk.orderCount();
            uint256 id = n == 0 ? 0 : 1 + (r >> 8) % n;
            uint256 st = id == 0 ? 0 : _status(id);

            if (op == 0 || n == 0) {
                address who = (r >> 16) % 2 == 0 ? user : other;
                uint256 amt = 1e18 + (r >> 24) % 300e18;
                if (amt <= desk.dayRoom() && musd.balanceOf(who) >= amt) {
                    vm.prank(who);
                    desk.cashOut(amt, 1 + (r >> 40) % 1e9, BANK);
                }
            } else if (op == 1 && st == 1) {
                vm.prank(relayer);
                desk.take(id);
            } else if (op == 2 && st == 2) {
                OwoDesk.Order memory o = desk.getOrder(id);
                vm.prank(relayer);
                desk.settle(id, o.minNaira, bytes32(r));
                paidOut += o.amount;
            } else if (op == 3 && (st == 1 || st == 2)) {
                vm.prank(relayer);
                desk.reject(id);
            } else if (op == 4 && st == 1) {
                vm.prank(desk.getOrder(id).owner);
                desk.cancel(id);
            } else if (op == 5) {
                vm.warp(block.timestamp + 3 hours);
                if (st == 2) {
                    OwoDesk.Order memory o = desk.getOrder(id);
                    if (block.timestamp > o.takenAt + desk.settleWindow()) {
                        vm.prank(o.owner);
                        desk.reclaim(id);
                    }
                }
            }

            uint256 live;
            for (uint256 i = 1; i <= desk.orderCount(); i++) {
                OwoDesk.Order memory o = desk.getOrder(i);
                if (o.status == OwoDesk.Status.Open || o.status == OwoDesk.Status.Taken) live += o.amount;
            }
            assertEq(musd.balanceOf(address(desk)), live, "desk == live orders");
            assertEq(musd.balanceOf(treasury), paidOut, "treasury == paid");
            assertEq(musd.balanceOf(user) + musd.balanceOf(other) + live + paidOut, 10_000e18, "conservation");
        }
    }
}
