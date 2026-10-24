// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev ERC-20 with EIP-2612 permit, same name as Mezo's MUSD ("Mezo USD").
contract MockMUSD {
    string public constant name = "Mezo USD";
    string public constant symbol = "MUSD";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;
    bool public failTransfers;

    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function setFailTransfers(bool f) external {
        failTransfers = f;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        require(block.timestamp <= deadline, "permit expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == owner, "bad permit");
        allowance[owner][spender] = value;
    }
}

/// @dev Stands in for BorrowerOperationsSignatures: mints the borrowed MUSD to the recipient.
/// The real signature check is covered by the fork test.
contract MockBorrowerOps {
    MockMUSD public immutable musd;
    uint256 public mintBps = 10_000;
    address public lastBorrower;

    constructor(MockMUSD _musd) {
        musd = _musd;
    }

    function setMintBps(uint256 bps) external {
        mintBps = bps;
    }

    function withdrawMUSDWithSignature(
        uint256 amount,
        address,
        address,
        address borrower,
        address recipient,
        bytes memory signature,
        uint256 deadline
    ) external {
        require(signature.length == 65, "sig");
        require(block.timestamp <= deadline, "Signature expired");
        lastBorrower = borrower;
        musd.mint(recipient, amount * mintBps / 10_000);
    }
}
