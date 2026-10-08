// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RentSavingsVault} from "../RentSavingsVault.sol";

/// @notice Deploys RentSavingsVault (no owner, no admin).
/// Usage:
///   forge script contracts/script/DeploySavingsVault.s.sol \
///     --rpc-url https://rpc.testnet.arc.network --account <keystore-name> --broadcast
contract DeploySavingsVault is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (RentSavingsVault vault) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_TESTNET_USDC);
        vm.startBroadcast();
        vault = new RentSavingsVault(usdc);
        vm.stopBroadcast();
        console.log("RentSavingsVault:", address(vault));
    }
}
