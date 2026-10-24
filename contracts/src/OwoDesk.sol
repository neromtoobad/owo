// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

/// @dev Mezo's signature entry point to MUSD troves (mezo-org/musd BorrowerOperationsSignatures).
interface IBorrowerOperationsSignatures {
    function withdrawMUSDWithSignature(
        uint256 amount,
        address upperHint,
        address lowerHint,
        address borrower,
        address recipient,
        bytes memory signature,
        uint256 deadline
    ) external;
}

/// @title OwoDesk
/// @notice Cash MUSD out to a Nigerian bank account. A user locks MUSD here with a
/// minimum naira amount and a hash of the bank details; the relayer pays the naira
/// out (Paycrest) and only then takes the MUSD. If the relayer never pays, the user
/// takes the MUSD back: cancel before it is taken, reclaim after the settle window.
///
/// Orders can be opened three ways:
///   - cashOut: the wallet holds MUSD and sends the transaction itself.
///   - cashOutWithPermit: gasless. The user signs an ERC-2612 permit and a CashOut
///     intent; anyone (our relayer) submits them.
///   - borrowAndCashOut: gasless borrowing. The user signs Mezo's WithdrawMUSD (with
///     this desk as recipient) and a CashOut intent; the trove mints MUSD straight
///     into the order. No BTC for gas, no MUSD in the wallet first.
///
/// The CashOut intent binds the bank-details hash and the naira floor to the owner,
/// so a relayed signature cannot be replayed into someone else's bank account.
contract OwoDesk {
    enum Status {
        None,
        Open,
        Taken,
        Paid,
        Refunded
    }

    struct Order {
        address owner;
        Status status;
        uint64 openedAt;
        uint64 takenAt;
        uint128 amount; // MUSD, 18 decimals
        uint128 minNaira; // kobo
        uint128 paidNaira; // kobo, set on settle
        bytes32 recipientHash; // keccak256 of the salted bank details held by the relayer
        bytes32 payoutRef; // Paycrest order id (or other payout reference)
    }

    /// @notice A signed request to cash out. Signed with EIP-712 by `owner`.
    struct Intent {
        address owner;
        uint256 amount;
        uint256 minNaira;
        bytes32 recipientHash;
        uint256 deadline;
    }

    bytes32 public constant CASH_OUT_TYPEHASH = keccak256(
        "CashOut(address owner,uint256 amount,uint256 minNaira,bytes32 recipientHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Owo");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IERC20 public immutable musd;
    IBorrowerOperationsSignatures public immutable borrowerOps;

    address public admin;
    address public pendingAdmin;
    address public relayer;
    address public treasury;
    bool public paused;

    uint256 public minOrder;
    uint256 public maxOrder;
    uint256 public dayCap;
    uint256 public settleWindow;

    uint256 public orderCount;
    mapping(uint256 => Order) public orders;
    mapping(address => uint256) public nonces;
    mapping(uint256 => uint256) public volumeByDay;

    uint256 private locked = 1;

    event Opened(
        uint256 indexed id, address indexed owner, uint256 amount, uint256 minNaira, bytes32 recipientHash, uint8 route
    );
    event Taken(uint256 indexed id);
    event Paid(uint256 indexed id, uint256 paidNaira, bytes32 payoutRef);
    event Refunded(uint256 indexed id, uint8 reason);
    event RelayerSet(address relayer);
    event TreasurySet(address treasury);
    event LimitsSet(uint256 minOrder, uint256 maxOrder, uint256 dayCap, uint256 settleWindow);
    event PausedSet(bool paused);
    event AdminProposed(address pendingAdmin);
    event AdminAccepted(address admin);

    // Routes recorded on Opened.
    uint8 public constant ROUTE_WALLET = 0;
    uint8 public constant ROUTE_PERMIT = 1;
    uint8 public constant ROUTE_BORROW = 2;

    // Reasons recorded on Refunded.
    uint8 public constant REFUND_CANCELLED = 0;
    uint8 public constant REFUND_REJECTED = 1;
    uint8 public constant REFUND_EXPIRED = 2;

    error Paused();
    error NotAdmin();
    error NotRelayer();
    error NotOwner();
    error BadStatus();
    error BadAmount();
    error BadRecipient();
    error OverDayCap();
    error Expired();
    error BadSignature();
    error TooEarly();
    error NairaBelowFloor();
    error MintMismatch();
    error ZeroAddress();
    error BadLimits();
    error TransferFailed();
    error Reentrancy();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        IERC20 _musd,
        IBorrowerOperationsSignatures _borrowerOps,
        address _admin,
        address _relayer,
        address _treasury
    ) {
        if (address(_musd) == address(0) || _admin == address(0) || _relayer == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        musd = _musd;
        borrowerOps = _borrowerOps;
        admin = _admin;
        relayer = _relayer;
        treasury = _treasury;
        minOrder = 1e18;
        maxOrder = 2_000e18;
        dayCap = 10_000e18;
        settleWindow = 6 hours;
    }

    /// @dev Mezo's withdrawMUSD always "sends" the recipient its collateral change with a
    /// native call, which is 0 BTC when only MUSD is drawn. Accept that, refuse real BTC.
    receive() external payable {
        if (msg.value != 0) revert BadAmount();
    }

    // ---------------------------------------------------------------- open

    /// @notice Lock MUSD from the caller's wallet.
    function cashOut(uint256 amount, uint256 minNaira, bytes32 recipientHash)
        external
        nonReentrant
        returns (uint256 id)
    {
        id = _open(msg.sender, amount, minNaira, recipientHash, ROUTE_WALLET);
        _pull(msg.sender, amount);
    }

    /// @notice Gasless: lock MUSD with a permit plus a signed CashOut intent.
    /// @dev The permit is tried, not required, so a front-run permit can't block the order.
    function cashOutWithPermit(
        Intent calldata intent,
        bytes calldata intentSig,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 id) {
        _checkIntent(intent, intentSig);
        try IERC20Permit(address(musd)).permit(intent.owner, address(this), intent.amount, permitDeadline, v, r, s) {}
            catch {}
        id = _open(intent.owner, intent.amount, intent.minNaira, intent.recipientHash, ROUTE_PERMIT);
        _pull(intent.owner, intent.amount);
    }

    /// @notice Gasless borrowing: draw MUSD from the owner's Mezo trove straight into an order.
    /// @param borrowSig the owner's WithdrawMUSD signature for BorrowerOperationsSignatures,
    /// with this contract as recipient.
    function borrowAndCashOut(
        Intent calldata intent,
        bytes calldata intentSig,
        address upperHint,
        address lowerHint,
        bytes calldata borrowSig,
        uint256 borrowDeadline
    ) external nonReentrant returns (uint256 id) {
        _checkIntent(intent, intentSig);
        id = _open(intent.owner, intent.amount, intent.minNaira, intent.recipientHash, ROUTE_BORROW);
        uint256 before = musd.balanceOf(address(this));
        borrowerOps.withdrawMUSDWithSignature(
            intent.amount, upperHint, lowerHint, intent.owner, address(this), borrowSig, borrowDeadline
        );
        if (musd.balanceOf(address(this)) - before != intent.amount) revert MintMismatch();
    }

    // ---------------------------------------------------------------- relayer

    /// @notice Relayer commits to paying this order. From here the owner can only
    /// reclaim after the settle window.
    function take(uint256 id) external onlyRelayer {
        Order storage o = orders[id];
        if (o.status != Status.Open) revert BadStatus();
        o.status = Status.Taken;
        o.takenAt = uint64(block.timestamp);
        emit Taken(id);
    }

    /// @notice Naira has landed: release the MUSD to the treasury.
    function settle(uint256 id, uint256 paidNaira, bytes32 payoutRef) external onlyRelayer nonReentrant {
        Order storage o = orders[id];
        if (o.status != Status.Taken) revert BadStatus();
        if (paidNaira < o.minNaira) revert NairaBelowFloor();
        o.status = Status.Paid;
        o.paidNaira = uint128(paidNaira);
        o.payoutRef = payoutRef;
        _push(treasury, o.amount);
        emit Paid(id, paidNaira, payoutRef);
    }

    /// @notice The payout can't happen (rate moved below the floor, bank rejected, ...): refund.
    function reject(uint256 id) external onlyRelayer nonReentrant {
        Order storage o = orders[id];
        if (o.status != Status.Open && o.status != Status.Taken) revert BadStatus();
        _refund(id, o, REFUND_REJECTED);
    }

    // ---------------------------------------------------------------- owner of an order

    /// @notice Take the MUSD back before the relayer has picked the order up.
    function cancel(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        if (msg.sender != o.owner) revert NotOwner();
        if (o.status != Status.Open) revert BadStatus();
        _refund(id, o, REFUND_CANCELLED);
    }

    /// @notice The relayer took the order but never settled it: take the MUSD back.
    function reclaim(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        if (msg.sender != o.owner) revert NotOwner();
        if (o.status != Status.Taken) revert BadStatus();
        if (block.timestamp <= o.takenAt + settleWindow) revert TooEarly();
        _refund(id, o, REFUND_EXPIRED);
    }

    // ---------------------------------------------------------------- admin

    function setRelayer(address _relayer) external onlyAdmin {
        if (_relayer == address(0)) revert ZeroAddress();
        relayer = _relayer;
        emit RelayerSet(_relayer);
    }

    function setTreasury(address _treasury) external onlyAdmin {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setLimits(uint256 _minOrder, uint256 _maxOrder, uint256 _dayCap, uint256 _settleWindow)
        external
        onlyAdmin
    {
        if (_minOrder == 0 || _minOrder > _maxOrder || _maxOrder > _dayCap) revert BadLimits();
        if (_settleWindow < 10 minutes || _settleWindow > 7 days) revert BadLimits();
        minOrder = _minOrder;
        maxOrder = _maxOrder;
        dayCap = _dayCap;
        settleWindow = _settleWindow;
        emit LimitsSet(_minOrder, _maxOrder, _dayCap, _settleWindow);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function proposeAdmin(address _admin) external onlyAdmin {
        pendingAdmin = _admin;
        emit AdminProposed(_admin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminAccepted(msg.sender);
    }

    // ---------------------------------------------------------------- views

    function getOrder(uint256 id) external view returns (Order memory) {
        return orders[id];
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice The EIP-712 digest a CashOut intent signs, at the owner's current nonce.
    function intentDigest(Intent calldata intent) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CASH_OUT_TYPEHASH,
                intent.owner,
                intent.amount,
                intent.minNaira,
                intent.recipientHash,
                nonces[intent.owner],
                intent.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function today() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function dayRoom() external view returns (uint256) {
        uint256 used = volumeByDay[today()];
        return used >= dayCap ? 0 : dayCap - used;
    }

    // ---------------------------------------------------------------- internal

    function _open(address owner, uint256 amount, uint256 minNaira, bytes32 recipientHash, uint8 route)
        internal
        returns (uint256 id)
    {
        if (paused) revert Paused();
        if (amount < minOrder || amount > maxOrder) revert BadAmount();
        if (recipientHash == bytes32(0) || minNaira == 0) revert BadRecipient();
        uint256 day = today();
        uint256 used = volumeByDay[day] + amount;
        if (used > dayCap) revert OverDayCap();
        volumeByDay[day] = used;

        id = ++orderCount;
        orders[id] = Order({
            owner: owner,
            status: Status.Open,
            openedAt: uint64(block.timestamp),
            takenAt: 0,
            amount: uint128(amount),
            minNaira: uint128(minNaira),
            paidNaira: 0,
            recipientHash: recipientHash,
            payoutRef: bytes32(0)
        });
        emit Opened(id, owner, amount, minNaira, recipientHash, route);
    }

    function _refund(uint256 id, Order storage o, uint8 reason) internal {
        o.status = Status.Refunded;
        // A refund on the day it opened frees that day's room again.
        uint256 day = o.openedAt / 1 days;
        if (day == today()) volumeByDay[day] -= o.amount;
        _push(o.owner, o.amount);
        emit Refunded(id, reason);
    }

    function _checkIntent(Intent calldata intent, bytes calldata sig) internal {
        if (block.timestamp > intent.deadline) revert Expired();
        bytes32 digest = intentDigest(intent);
        if (_recover(digest, sig) != intent.owner) revert BadSignature();
        nonces[intent.owner]++;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (uint256(s) > SECP256K1_HALF_N || (v != 27 && v != 28)) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }

    function _pull(address from, uint256 amount) internal {
        if (!musd.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (!musd.transfer(to, amount)) revert TransferFailed();
    }
}
