// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev The few Foundry cheatcodes these tests use (no forge-std on this machine).
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function deal(address, uint256) external;
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external view returns (string memory);
    function assume(bool) external pure;
    function label(address, string calldata) external;
}

abstract contract Base {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": ", _u(a), " != ", _u(b)));
    }

    function assertEq(address a, address b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": address mismatch"));
    }

    function assertEq(bytes32 a, bytes32 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": bytes32 mismatch"));
    }

    function assertTrue(bool ok, string memory what) internal pure {
        if (!ok) revert(what);
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v > 0) {
            b = abi.encodePacked(bytes1(uint8(48 + v % 10)), b);
            v /= 10;
        }
        return string(b);
    }
}
