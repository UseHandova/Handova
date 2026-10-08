// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RentFlowEscrow} from "../RentFlowEscrow.sol";
import {RentFlowNFT} from "../RentFlowNFT.sol";

/// @notice Deploys RentFlowEscrow + RentFlowNFT and links them in one run.
///
/// Env vars:
///   USDC_ADDRESS  - optional, defaults to Arc Testnet USDC
///   ARBITER       - optional dispute arbiter, defaults to the deployer
///   VERIFIER      - optional KYC verifier (backend key), defaults to the deployer
///
/// Usage:
///   forge script contracts/script/DeployRentFlow.s.sol \
///     --rpc-url https://rpc.testnet.arc.io --account <keystore-name> --broadcast
contract DeployRentFlow is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (RentFlowEscrow escrow, RentFlowNFT nft) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_TESTNET_USDC);
        address arbiter = vm.envOr("ARBITER", address(0));
        address verifier = vm.envOr("VERIFIER", address(0));

        vm.startBroadcast();
        escrow = new RentFlowEscrow(usdc);
        nft = new RentFlowNFT(address(escrow));
        escrow.setNftContract(address(nft));
        if (arbiter != address(0)) escrow.setArbiter(arbiter);
        if (verifier != address(0)) escrow.setVerifier(verifier);
        vm.stopBroadcast();

        console.log("RentFlowEscrow:", address(escrow));
        console.log("RentFlowNFT:   ", address(nft));
        console.log("Arbiter:       ", escrow.arbiter());
        console.log("Verifier:      ", escrow.verifier());
    }
}
