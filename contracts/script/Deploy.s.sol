// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OwoDesk, IERC20, IBorrowerOperationsSignatures} from "../src/OwoDesk.sol";

interface VmScript {
    function envAddress(string calldata) external view returns (address);
    function envUint(string calldata) external view returns (uint256);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

/// forge script script/Deploy.s.sol --rpc-url <mezo rpc> --broadcast --legacy
/// env: DEPLOYER_KEY, MUSD, BOS, ADMIN, RELAYER, TREASURY
contract Deploy {
    VmScript constant vm = VmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (OwoDesk desk) {
        vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));
        desk = new OwoDesk(
            IERC20(vm.envAddress("MUSD")),
            IBorrowerOperationsSignatures(vm.envAddress("BOS")),
            vm.envAddress("ADMIN"),
            vm.envAddress("RELAYER"),
            vm.envAddress("TREASURY")
        );
        vm.stopBroadcast();
    }
}
