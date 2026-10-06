# RentFlow — Lagos Housing DApp

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| RentFlowEscrow | `0xb590c4f6339c454e05668da8f27ce656c463aadc` |
| RentFlowNFT | `0x38b0daf9ce27205bceedb7dc90b90bad9b44dc5a` |

USDC (Arc Testnet): `0x3600000000000000000000000000000000000000`
Owner must call `setNftContract(0x38b0daf9ce27205bceedb7dc90b90bad9b44dc5a)` on the escrow to activate NFT minting on move-in.

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
