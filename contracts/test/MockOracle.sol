// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Etched over Mezo's oracle precompile on a local anvil fork (the precompile can't run there).
contract MockOracle {
    function decimals() external pure returns (uint8) {
        return 18;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, 79_500e18, block.timestamp, block.timestamp, 1);
    }
}
