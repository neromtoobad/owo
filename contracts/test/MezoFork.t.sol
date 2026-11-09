// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.sol";
import {OwoDesk, IERC20, IBorrowerOperationsSignatures} from "../src/OwoDesk.sol";

interface IBorrowerOperations {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;
}

interface ITroveManager {
    function getTroveDebt(address) external view returns (uint256);
}

interface IOracle {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

interface IForkVm {
    function mockCall(address, bytes calldata, bytes calldata) external;
}

/// Runs against Mezo testnet (chain 31611) with the real MUSD, BorrowerOperations and
/// BorrowerOperationsSignatures. Only the price oracle is mocked: it is a Mezo
/// precompile, which a local fork cannot execute.
///
///   forge test --match-contract MezoFork --fork-url https://rpc.test.mezo.org
contract MezoForkTest is Base {
    // Mezo testnet (31611) by default; mainnet (31612) addresses are picked in setUp.
    IERC20 MUSD = IERC20(0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503);
    IBorrowerOperations BO = IBorrowerOperations(0xCdF7028ceAB81fA0C6971208e83fa7872994beE5);
    address BOS = 0xD757e3646AF370b15f32EB557F0F8380Df7D639e;
    ITroveManager TM = ITroveManager(0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0);
    address constant ORACLE = 0x7b7c000000000000000000000000000000000015;

    function _onMezo() internal view returns (bool) {
        return block.chainid == 31611 || block.chainid == 31612;
    }

    bytes32 constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    OwoDesk desk;
    uint256 userKey = 0xC0FFEE;
    address user;
    address relayer = address(0xBEEF);
    address treasury = address(0x7EA5);

    function setUp() public {
        if (!_onMezo()) return; // only meaningful on a Mezo fork
        if (block.chainid == 31612) {
            MUSD = IERC20(0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186);
            BO = IBorrowerOperations(0x44b1bac67dDA612a41a58AAf779143B181dEe031);
            BOS = 0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a;
            TM = ITroveManager(0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193);
        }
        user = vm.addr(userKey);
        // The oracle precompile can't run on a fork: pin the live BTC price and a fresh timestamp.
        IForkVm(address(vm)).mockCall(ORACLE, abi.encodeWithSelector(IOracle.decimals.selector), abi.encode(uint8(18)));
        IForkVm(address(vm)).mockCall(
            ORACLE,
            abi.encodeWithSelector(IOracle.latestRoundData.selector),
            abi.encode(uint80(1), int256(79_500e18), block.timestamp, block.timestamp, uint80(1))
        );
        desk = new OwoDesk(MUSD, IBorrowerOperationsSignatures(BOS), address(this), relayer, treasury);
        vm.deal(user, 1 ether); // 1 BTC
        vm.prank(user);
        BO.openTrove{value: 0.1 ether}(2_000e18, address(0), address(0)); // ~397% ICR at 79.5k
    }

    function _domain() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BorrowerOperationsSignatures"),
                keccak256("1"),
                block.chainid,
                BOS
            )
        );
    }

    function _borrowSig(uint256 amount, uint256 nonce, uint256 deadline) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, amount, user, address(desk), nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domain(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_fork_borrowAndCashOut_realTrove() public {
        if (!_onMezo()) return;
        uint256 debtBefore = TM.getTroveDebt(user);
        uint256 walletBefore = MUSD.balanceOf(user);
        uint256 amount = 150e18;
        uint256 dl = block.timestamp + 1 hours;

        OwoDesk.Intent memory it = OwoDesk.Intent({
            owner: user,
            amount: amount,
            minNaira: 200_000_00,
            recipientHash: keccak256("salt|GTBINGLA|0123456789"),
            deadline: dl
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, desk.intentDigest(it));

        // The relayer submits; the user spends no BTC on gas.
        vm.prank(relayer);
        uint256 id = desk.borrowAndCashOut(it, abi.encodePacked(r, s, v), address(0), address(0), _borrowSig(amount, 0, dl), dl);

        assertEq(MUSD.balanceOf(address(desk)), amount, "MUSD minted into the desk");
        assertEq(MUSD.balanceOf(user), walletBefore, "wallet untouched");
        assertTrue(TM.getTroveDebt(user) >= debtBefore + amount, "trove debt grew");

        vm.prank(relayer);
        desk.take(id);
        vm.prank(relayer);
        desk.settle(id, 205_800_00, bytes32("paycrest-order"));
        assertEq(MUSD.balanceOf(treasury), amount, "treasury paid");
    }

    /// Wave 1 review: someone copies the borrow signature out of a pending relay and
    /// submits it to Mezo's real BorrowerOperationsSignatures first. The relay must still
    /// open the order against the MUSD that landed in the desk.
    function test_fork_borrowFrontRun_realMezo() public {
        if (!_onMezo()) return;
        uint256 amount = 120e18;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory bsig = _borrowSig(amount, 0, dl);
        OwoDesk.Intent memory it = OwoDesk.Intent({
            owner: user,
            amount: amount,
            minNaira: 1,
            recipientHash: keccak256("salt|GTBINGLA|0123456789"),
            deadline: dl
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, desk.intentDigest(it));

        vm.prank(address(0xBAD)); // front-runner
        IBorrowerOperationsSignatures(BOS).withdrawMUSDWithSignature(
            amount, address(0), address(0), user, address(desk), bsig, dl
        );
        assertEq(desk.unassigned(), amount, "MUSD stranded in the desk");

        vm.prank(relayer);
        uint256 id = desk.borrowAndCashOut(it, abi.encodePacked(r, s, v), address(0), address(0), bsig, dl);
        assertEq(desk.getOrder(id).owner, user, "order opened for the owner");
        assertEq(desk.unassigned(), 0, "assigned");

        vm.prank(user);
        desk.cancel(id);
        assertEq(MUSD.balanceOf(user), 2_000e18 + amount, "owner gets the borrowed MUSD");
    }

    function test_fork_borrowSigForOtherRecipientFails() public {
        if (!_onMezo()) return;
        uint256 dl = block.timestamp + 1 hours;
        OwoDesk.Intent memory it = OwoDesk.Intent({
            owner: user,
            amount: 100e18,
            minNaira: 1,
            recipientHash: keccak256("bank"),
            deadline: dl
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, desk.intentDigest(it));
        // Signature names a different recipient, so Mezo rejects it.
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, uint256(100e18), user, relayer, uint256(0), dl));
        (uint8 bv, bytes32 br, bytes32 bs) =
            vm.sign(userKey, keccak256(abi.encodePacked("\x19\x01", _domain(), structHash)));
        vm.expectRevert(bytes("BorrowerOperationsSignatures: Invalid signature"));
        desk.borrowAndCashOut(it, abi.encodePacked(r, s, v), address(0), address(0), abi.encodePacked(br, bs, bv), dl);
    }

    function test_fork_walletCashOut_realMUSD() public {
        if (!_onMezo()) return;
        vm.startPrank(user);
        (bool ok,) = address(MUSD).call(abi.encodeWithSignature("approve(address,uint256)", address(desk), 300e18));
        assertTrue(ok, "approve");
        uint256 id = desk.cashOut(300e18, 400_000_00, keccak256("bank"));
        desk.cancel(id);
        vm.stopPrank();
        assertEq(MUSD.balanceOf(user), 2_000e18, "full refund of the borrowed MUSD");
    }
}
