// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RentFlowEscrow} from "../RentFlowEscrow.sol";
import {RentFlowNFT} from "../RentFlowNFT.sol";

/// @notice Upgrades the escrow and/or NFT proxy to the code currently in contracts/. Run as the owner.
///         Addresses, listings, escrows and balances stay as they are.
///
/// Env vars (set at least one):
///   ESCROW_PROXY  - the RentFlowEscrow proxy address the app uses
///   NFT_PROXY     - the RentFlowNFT proxy address
///
/// Usage:
///   ESCROW_PROXY=0x... forge script contracts/script/UpgradeRentFlow.s.sol \
///     --rpc-url https://rpc.testnet.arc.io --account <owner-keystore> --broadcast
contract UpgradeRentFlow is Script {
    function run() external {
        address escrowProxy = vm.envOr("ESCROW_PROXY", address(0));
        address nftProxy = vm.envOr("NFT_PROXY", address(0));
        require(escrowProxy != address(0) || nftProxy != address(0), "Set ESCROW_PROXY and/or NFT_PROXY");

        vm.startBroadcast();
        if (escrowProxy != address(0)) {
            address impl = address(new RentFlowEscrow());
            RentFlowEscrow(escrowProxy).upgradeToAndCall(impl, "");
            console.log("Escrow upgraded to", impl, "version", RentFlowEscrow(escrowProxy).version());
        }
        if (nftProxy != address(0)) {
            address impl = address(new RentFlowNFT());
            RentFlowNFT(nftProxy).upgradeToAndCall(impl, "");
            console.log("NFT upgraded to", impl, "version", RentFlowNFT(nftProxy).version());
        }
        vm.stopBroadcast();
    }
}
