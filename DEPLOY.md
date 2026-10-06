# Deploying Handova

Handova has three parts:

| Part | What | Where |
|---|---|---|
| **Frontend** | React app (`src/`) | Vercel (static) |
| **API server** | `server/` — WhatsApp bot, identity verification, media, reviews, repairs, boosts, referrals, moderation | Railway / Render / Fly (Docker) |
| **Contracts** | `RentFlowEscrow` + `RentFlowNFT` on Arc | already deployed — see README |

The frontend calls `/api/*`; in production Vercel forwards those requests to the API server, so no code changes are needed.

---

## 1. API server (Railway example)

1. **New project → Deploy from GitHub repo** → pick this repo. Railway detects the `Dockerfile`.
2. **Add a volume** mounted at **`/app/server/data`** — this holds the SQLite database (drafts, reviews, repairs, boosts, referrals, moderation, verification links, inspections, chat, phone-login backups) and local uploads, including private ownership documents (`server/data/ownership`). Without it, data is lost on every deploy.
3. **Variables** (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `VITE_ESCROW_ADDRESS` | `0x29993a0e1BF9ef863c10Bfc7171c410DCE9Fe7Ca` |
   | `TREASURY_ADDRESS` | wallet that receives boost payments |
   | `VERIFIER_PRIVATE_KEY` | the escrow's verifier key (records verified badges) |
   | `SESSION_SECRET` | long random string (`openssl rand -hex 32`) |
   | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | identity verification (free tier) |
   | `APP_ORIGINS` | your frontend URL, e.g. `https://rentflow.ng` |
   | `APP_URL` | same URL — WhatsApp replies include a tap-to-publish link |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | WhatsApp bot |
   | `GROQ_API_KEY` | free AI for parsing listings + voice notes |
   | `BOT_SECRET` | random string (admin endpoints) |
   | `PUBLIC_WEBHOOK_URL` | only if Twilio's signature check fails behind your proxy |

4. Deploy, then open `https://<your-api>/api/health` — it should return `{"status":"ok", …}`.
5. **Twilio** → Messaging → Try it out → Send a WhatsApp message → **Sandbox settings** → *When a message comes in*:
   `https://<your-api>/api/whatsapp/incoming` (POST). For production, register a WhatsApp sender instead of the sandbox.

### Media storage (recommended)

Local disk works on a volume, but for scale use an S3-compatible bucket. Cloudflare R2 has a free tier and no egress fees:

| Variable | Example |
|---|---|
| `MEDIA_S3_BUCKET` | `rentflow-media` |
| `MEDIA_S3_ACCESS_KEY_ID` / `MEDIA_S3_SECRET_ACCESS_KEY` | R2 API token (Object Read & Write) |
| `MEDIA_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `MEDIA_PUBLIC_BASE_URL` | the bucket's public URL, e.g. `https://media.rentflow.ng` |

When these are set, uploads go to the bucket and listings store the public URL. Existing `/api/media/…` files keep working from the volume.

---

## 2. Frontend (Vercel)

1. **Import** the repo in Vercel. Framework: **Vite**. Build command: `bunx vite build`. Output: `dist`.
2. **Environment variables** (Production):

   | Variable | Value |
   |---|---|
   | `VITE_CLIENT_KEY` | Circle client key whose **Allowed Domain** is your production domain |
   | `VITE_CLIENT_URL` | `https://modular-sdk.circle.com/v1/rpc/w3s/buidl` |
   | `VITE_ESCROW_ADDRESS` / `VITE_NFT_ADDRESS` | contract addresses |
   | `VITE_WHATSAPP_BOT_NUMBER` / `VITE_WHATSAPP_JOIN_CODE` | WhatsApp number (+ sandbox join code if still on the sandbox) |

3. **Forward `/api` to the API server** — edit `vercel.json` so the first rewrite points at your API URL:

   ```json
   {
     "rewrites": [
       { "source": "/api/(.*)", "destination": "https://<your-api>/api/$1" },
       { "source": "/((?!api/|assets/).*)", "destination": "/index.html" }
     ]
   }
   ```

4. **Passkeys:** in the Circle Console set the **Passkey domain** to your production domain (one domain per Circle account — keep a separate account/key for `localhost` development).

---

## 3. After deploying

- Make your app account the dispute **arbiter** (done on testnet: `0xcb03…1c35`).
- Run the test suites before each release: `bun run contracts:test` and `bun run test:server`.
- Back up the volume (`server/data`) — it is the only copy of off-chain data.
