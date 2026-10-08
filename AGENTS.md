# Handova — Lagos Housing DApp

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| RentFlowEscrow | `0x29993a0e1BF9ef863c10Bfc7171c410DCE9Fe7Ca` |
| RentFlowNFT | `0x78A84547a4372950b4898DE06c008D83F18D445F` |
| RentSavingsVault | `0x319c6Da874F81379E2ADa1FE3c539816813B8dCA` (deployed 2026-10-08, `contracts/script/DeploySavingsVault.s.sol`) |

USDC (Arc Testnet): `0x3600000000000000000000000000000000000000`

API server (Railway, project `handova`, service `api`, volume at `/app/server/data`): https://api-production-f477.up.railway.app — health at `/api/health`. Deploy with `railway up` from the repo root.
Deployed 2026-10-06 with `contracts/script/DeployHandova.s.sol` (NFT already linked). Owner/deployer keystore: `rentflow-deployer` (password in `~/.rentflow-deployer-password`). Verifier (KYC backend key): `0x6380197079a664E358842Bb21d34775B431762cD`.

---

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Handova lets people in Lagos rent homes directly from landlords, with no agent fees. Tenants find a home, chat with the landlord, and book an inspection that the landlord approves. After both sides confirm the visit, the tenant pays rent and the caution fee in USDC into an escrow contract on Arc. The landlord is paid when the tenant confirms move-in, and the caution fee comes back at move-out unless disputed.

Sign-in uses passkeys (Circle Modular Wallets), or a phone number proven over WhatsApp with a PIN-locked wallet. Landlords can list from the app or by WhatsApp voice note, verify their identity (Didit), and prove property ownership (reviewed by the admin). Prices are shown in Naira.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic, routing, dev preview (`?preview=app&as=0x…`)
- `src/components/` - UI components
- `src/lib/` - chain state (`chain.ts`), API sessions (`api.ts`), inspections, chat, ownership, phone wallets
- `src/config.ts` - wagmi config (chains, connectors, transports)
- `server/whatsapp-bot.ts` - API server entry: WhatsApp bot + mounts every module below
- `server/` - `auth.ts` (signed sessions), `inspections.ts`, `chat.ts`, `phone-auth.ts`, `ownership.ts`, `cash.ts` (cash payments + receipts), `savings.ts` (savings plans + reminders), `admin.ts`, `backup.ts`, `features.ts` (reviews, repairs, boosts, referrals, moderation), `verification.ts` (Didit/Dojah), `media.ts`, `db.ts` (SQLite)

## Tests

- `bun run test:unit` — pure helpers (`tests/`)
- `bun run test:server` — end-to-end API tests on Anvil, one file per process (`server/*.e2e.test.ts`)
- `bun run contracts:test` — Foundry
- `bun run typecheck`, `bun run typecheck:server`, `bunx oxlint --type-aware src scripts`

## To Run

```bash
bun install
bun run dev
```
