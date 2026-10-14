// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {RentFlowEscrow} from "../RentFlowEscrow.sol";
import {RentFlowNFT} from "../RentFlowNFT.sol";

/// @notice Deploys RentFlowEscrow + RentFlowNFT behind upgradeable (UUPS / ERC1967) proxies and links them.
///         The app talks to the PROXY addresses printed at the end; those never change across upgrades.
///
/// Env vars:
///   USDC_ADDRESS  - optional, defaults to Arc USDC (same address on testnet and mainnet)
///   ARBITER       - optional dispute arbiter, defaults to the deployer
///   VERIFIER      - optional KYC verifier (backend key), defaults to the deployer
///
/// Usage:
///   forge script contracts/script/DeployRentFlow.s.sol \
///     --rpc-url https://rpc.testnet.arc.io --account <keystore-name> --broadcast
contract DeployRentFlow is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (RentFlowEscrow escrow, RentFlowNFT nft) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        address arbiter = vm.envOr("ARBITER", address(0));
        address verifier = vm.envOr("VERIFIER", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address escrowImpl = address(new RentFlowEscrow());
        escrow = RentFlowEscrow(address(new ERC1967Proxy(escrowImpl, abi.encodeCall(RentFlowEscrow.initialize, (usdc, deployer)))));
        address nftImpl = address(new RentFlowNFT());
        nft = RentFlowNFT(address(new ERC1967Proxy(nftImpl, abi.encodeCall(RentFlowNFT.initialize, (address(escrow), deployer)))));
        escrow.setNftContract(address(nft));
        if (arbiter != address(0)) escrow.setArbiter(arbiter);
        if (verifier != address(0)) escrow.setVerifier(verifier);
        vm.stopBroadcast();

        console.log("RentFlowEscrow (proxy):", address(escrow));
        console.log("  implementation:      ", escrowImpl);
        console.log("RentFlowNFT (proxy):   ", address(nft));
        console.log("  implementation:      ", nftImpl);
        console.log("Owner:                 ", escrow.owner());
        console.log("Arbiter:               ", escrow.arbiter());
        console.log("Verifier:              ", escrow.verifier());
    }
}
