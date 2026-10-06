# Handova — Lagos Housing DApp

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| RentFlowEscrow | `0x29993a0e1BF9ef863c10Bfc7171c410DCE9Fe7Ca` |
| RentFlowNFT | `0x78A84547a4372950b4898DE06c008D83F18D445F` |

USDC (Arc Testnet): `0x3600000000000000000000000000000000000000`
Deployed 2026-10-06 with `contracts/script/DeployHandova.s.sol` (NFT already linked). Owner/deployer keystore: `rentflow-deployer` (password in `~/.rentflow-deployer-password`). Verifier (KYC backend key): `0x6380197079a664E358842Bb21d34775B431762cD`.

---

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
