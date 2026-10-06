# RentFlow 🏠

**Rent a home in Lagos without paying an agent 20–40% on top.**

RentFlow connects landlords and tenants directly. The tenant's rent sits in an onchain escrow until they move in. The deposit is protected until they move out. Every lease becomes a verifiable certificate the tenant owns. Landlords can list a property by sending a WhatsApp voice note, with no forms and no wallet setup.

Built on **[Arc](https://arc.network)** (Circle's stablecoin-native L1) with USDC.

---

## Why

In Lagos, agents routinely add "agency" and "legal" fees of 20–40% to a year's rent. They also pad the "total package" and sometimes list houses they don't control. Tenants pay 1–2 years upfront with no protection. Many landlords aren't comfortable with apps, but they all use WhatsApp, TikTok and Facebook.

RentFlow replaces the agent's role as trusted middleman with a smart contract. It keeps the experience as simple as sending a message.

## How it works

```
Landlord                         RentFlowEscrow (Arc)                     Tenant
   │  list (app or WhatsApp voice note) │                                    │
   ├──────────── createListing ────────►│                                    │
   │                                    │◄──────── depositRent (rent+dep) ───┤
   │── markHandover (keys given) ──────►│                                    │
   │                                    │◄──────── confirmMoveIn ────────────┤
   │◄─── rent released ─────────────────│── Lease NFT minted ───────────────►│
   │                                    │                                    │
   │                                    │◄──────── endTenancy (move out) ────┤
   │── approveDepositReturn / dispute ─►│   7-day landlord review            │
   │                                    │── deposit refunded ───────────────►│
```

**Escrow rules**

| Situation | What happens |
|---|---|
| Tenant pays | Rent + deposit locked in escrow (`Pending`) |
| Tenant confirms move-in | Rent released to landlord, lease NFT minted to tenant (`Active`) |
| Landlord hands over keys, tenant goes silent | After 3 days the landlord can `claimMoveIn` |
| Nobody acts within 7 days, no handover | Either party can `cancelExpired`, and the tenant is fully refunded |
| Tenant moves out | Deposit enters a 7-day review (`Ending`). Landlord approves or disputes. If they stay silent, the tenant claims it back |
| Dispute | Both parties can agree a split (`proposeSettlement`), or the RentFlow arbiter decides (`resolveDispute`). If nobody acts in 7 days, it splits 50/50 |

Funds are pull-based: everyone calls `withdraw()` to collect what they're owed.

## Features

- **Passkey login.** Circle Modular Wallets smart accounts with gasless transactions via paymaster. No seed phrases.
- **WhatsApp listing bot.** A landlord sends a text or voice note, AI turns it into a listing (via Groq's free tier or OpenAI), and an admin approves it onchain.
- **Prices in Naira.** Everything is shown in ₦, and USDC runs underneath.
- **Five languages:** English, Yorùbá, Naija Pidgin, Igbo, Hausa.
- **Lease certificate NFT**, minted on move-in.
- **Verified landlords.** NIN + selfie face-match through [Dojah](https://dojah.io); a pass is recorded onchain (`verifiedAt`) so every tenant sees the badge. The NIN and selfie are never stored — only a salted hash of the NIN, to stop one identity verifying many accounts.
- Map search, saved searches, inspections, dispute evidence upload, maintenance tracker, lease PDF export, landlord verification.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind, Framer Motion |
| Web3 | viem v2, wagmi v2, Circle Modular Wallets (passkeys + bundler + paymaster) |
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin 5 |
| Bot server | Express, Twilio WhatsApp, Groq or OpenAI (gpt-oss / GPT listing parsing + Whisper voice transcription) |
| Chain | Arc Testnet (chain id `5042002`), USDC `0x3600000000000000000000000000000000000000` |

## Deployed contracts (Arc Testnet)

| Contract | Address |
|---|---|
| RentFlowEscrow | `0x29993a0e1BF9ef863c10Bfc7171c410DCE9Fe7Ca` |
| RentFlowNFT | `0x78A84547a4372950b4898DE06c008D83F18D445F` |


## Getting started

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.3, [Foundry](https://getfoundry.sh)

```bash
bun install
cp .env.example .env      # then fill in the values below
```

Run the frontend and the WhatsApp bot in two terminals:

```bash
bun run dev       # frontend  → http://localhost:5173
bun run server    # bot API   → http://localhost:3001 (proxied at /api)
```

Contracts:

```bash
bun run contracts:build
bun run contracts:test
```

Verification end-to-end test (local Anvil chain + real escrow + stubbed Dojah):

```bash
bun run test:verify
```

### Environment variables

| Variable | Where it's used | Get it from |
|---|---|---|
| `VITE_CLIENT_KEY` | Passkey wallets | [Circle Console](https://console.circle.com) → Modular Wallets → Client Key |
| `VITE_CLIENT_URL` | Circle bundler RPC | Circle Console |
| `VITE_ESCROW_ADDRESS` / `VITE_NFT_ADDRESS` | Contract calls | Table above |
| `BOT_SECRET` / `VITE_BOT_SECRET` | Admin approval of WhatsApp listings | Any random string (the two must match) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` | WhatsApp bot | [Twilio Console](https://console.twilio.com) |
| `GROQ_API_KEY` | Parsing listings & voice notes (free tier) | [Groq Console](https://console.groq.com/keys) |
| `OPENAI_API_KEY` | Fallback when `GROQ_API_KEY` is empty | [OpenAI Platform](https://platform.openai.com) |
| `DOJAH_APP_ID` / `DOJAH_SECRET_KEY` / `DOJAH_ENV` | Landlord NIN + selfie verification | [Dojah dashboard](https://dojah.io) → Developers → Configuration |
| `VERIFIER_PRIVATE_KEY` | Server key holding the escrow's verifier role | `cast wallet new`, then `setVerifier` from the owner |

For WhatsApp, point your Twilio sandbox webhook at `https://<your-host>/api/whatsapp/incoming` (use ngrok in development).

### Deploying the contracts

One command deploys the escrow, deploys the NFT pointing at it, and links them:

```bash
cast wallet import rentflow-deployer --interactive   # paste your testnet private key once; stored encrypted
forge script contracts/script/DeployRentFlow.s.sol \
  --rpc-url https://rpc.testnet.arc.network --account rentflow-deployer --broadcast
```

Set `ARBITER` to your **RentFlow app wallet address** (the passkey account shown in the app header) so you can resolve disputes from the Admin dashboard. Prefix the command with `ARBITER=0xYourAppAddress`.

The deployer needs about 0.25 testnet USDC for gas ([faucet.circle.com](https://faucet.circle.com)). Copy the two printed addresses into `VITE_ESCROW_ADDRESS` / `VITE_NFT_ADDRESS`.

### Manual setup (only if you deploy without the script)

The owner must link the NFT contract once, otherwise move-in will revert:

```bash
cast send <ESCROW> "setNftContract(address)" <NFT> --rpc-url <ARC_RPC> --account <deployer>
```

Optionally set a dedicated dispute arbiter (defaults to the deployer):

```bash
cast send <ESCROW> "setArbiter(address)" <ARBITER> --rpc-url <ARC_RPC> --account <deployer>
```

## Project structure

```
contracts/
  RentFlowEscrow.sol        escrow: listings, deposits, move-in, disputes
  RentFlowNFT.sol           lease certificate ERC-721
  test/                     Foundry tests
server/
  whatsapp-bot.ts           Twilio webhook + AI listing parser
src/
  App.tsx                   app shell & tabs
  components/               UI (BrowseListings, LandlordDashboard, MyLeases, …)
  lib/contracts.ts          ABIs, addresses, status enum
  lib/wallet.ts             Circle passkey smart account + bundler
  lib/i18n.ts               translations
```

## Roadmap

- [ ] **Naira on/off-ramp.** Tenants pay by bank transfer and landlords are paid out to a Nigerian bank account, through a licensed partner.
- [ ] **Phone-number / WhatsApp OTP login**, with Google/Facebook as secondary options (passkeys are lost with the phone).
- [ ] **Shared backend storage** for reviews, verification and referrals, which currently live in browser `localStorage`.
- [ ] **Property ownership verification** with onchain attestations (C of O, utility bill, field visit).
- [ ] **Non-transferable lease NFTs** to give tenants a portable rental history.
- [ ] **Rent savings vault** and monthly rent payments into escrow.
- [ ] Live USDC/NGN rate (currently fixed at ₦1,600).

## License

MIT
