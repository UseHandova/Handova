/**
 * Landlord identity verification (KYC) — NIN + selfie face-match via Dojah, recorded onchain.
 *
 * Flow:
 *   1. GET  /api/verify/challenge?address=0x…  → one-time message for the landlord's wallet to sign
 *   2. POST /api/verify  { address, nonce, signature, nin, selfie }
 *        - proves the caller controls `address` (EOA, ERC-1271 or ERC-6492 smart-account signature)
 *        - one NIN can verify only one RentFlow account (stored as an HMAC, never the raw NIN)
 *        - Dojah checks the NIN with NIMC and face-matches the selfie against the NIN photo
 *        - on a match the verifier key calls RentFlowEscrow.setVerified(address, true)
 *
 * Personal data (NIN, selfie, names) is never logged or written to disk.
 */

import express, { type Express, type Request as Req, type Response as Res } from 'express';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPublicClient, createWalletClient, http, isAddress, isHex, type Address, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';

const ESCROW_VERIFY_ABI = [
  { inputs: [{ name: 'landlord', type: 'address' }, { name: 'verified', type: 'bool' }], name: 'setVerified', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'verifiedAt', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

export interface VerificationConfig {
  rpcUrl: string;
  /** Chain the verifier signs for; defaults to Arc Testnet. */
  chain?: Chain;
  escrowAddress?: Address;
  verifierPrivateKey?: Hex;
  dojahAppId?: string;
  dojahSecretKey?: string;
  dojahBaseUrl: string;
  /** Secret used to HMAC NINs for the one-NIN-one-account check. */
  ninPepper: string;
  dataFile: string;
  /** Minimum face-match confidence (Dojah default is 90). */
  threshold: number;
  /** Dojah sandbox: no NIMC access, only Dojah's test NINs exist. */
  sandbox?: boolean;
}

export function configFromEnv(env = process.env): VerificationConfig {
  const verifierPrivateKey = env.VERIFIER_PRIVATE_KEY as Hex | undefined;
  return {
    rpcUrl: env.ARC_RPC_URL || arcTestnet.rpcUrls.default.http[0],
    escrowAddress: (env.ESCROW_ADDRESS || env.VITE_ESCROW_ADDRESS) as Address | undefined,
    verifierPrivateKey,
    dojahAppId: env.DOJAH_APP_ID || undefined,
    dojahSecretKey: env.DOJAH_SECRET_KEY || undefined,
    dojahBaseUrl: env.DOJAH_BASE_URL || (env.DOJAH_ENV === 'production' ? 'https://api.dojah.io' : 'https://sandbox.dojah.io'),
    ninPepper: env.NIN_PEPPER || createHash('sha256').update(`rentflow-nin:${verifierPrivateKey ?? ''}`).digest('hex'),
    dataFile: env.VERIFICATION_DATA_FILE || 'server/data/verifications.json',
    threshold: Number(env.KYC_MATCH_THRESHOLD || 90),
    sandbox: !env.DOJAH_BASE_URL && env.DOJAH_ENV !== 'production',
  };
}

interface Store { ninHashes: Record<string, Address> }

const CHALLENGE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS_PER_DAY = 5;
const MAX_SELFIE_BYTES = 4 * 1024 * 1024;

const challengeMessage = (address: Address, nonce: string, issuedAt: string) =>
  `RentFlow identity verification\n\nI confirm I own this RentFlow account and consent to my NIN being checked with NIMC.\n\nAccount: ${address}\nNonce: ${nonce}\nIssued: ${issuedAt}`;

export function mountVerification(app: Express, config: VerificationConfig = configFromEnv()) {
  const chain = config.chain ?? arcTestnet;
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const verifier = config.verifierPrivateKey ? privateKeyToAccount(config.verifierPrivateKey) : null;
  const walletClient = verifier ? createWalletClient({ account: verifier, chain, transport: http(config.rpcUrl) }) : null;

  const challenges = new Map<string, { address: Address; message: string; expiresAt: number }>();
  const attempts = new Map<string, { count: number; resetAt: number }>();

  const loadStore = (): Store => {
    try { return JSON.parse(readFileSync(config.dataFile, 'utf8')) as Store; } catch { return { ninHashes: {} }; }
  };
  const saveStore = (store: Store) => {
    if (!existsSync(dirname(config.dataFile))) mkdirSync(dirname(config.dataFile), { recursive: true });
    writeFileSync(config.dataFile, JSON.stringify(store, null, 2), { mode: 0o600 });
  };
  const ninHash = (nin: string) => createHmac('sha256', config.ninPepper).update(nin).digest('hex');

  const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) =>
    res.status(status).json({ ok: false, code, error, ...extra });

  const providerReady = () => !!(config.dojahAppId && config.dojahSecretKey);
  const chainReady = () => !!(walletClient && config.escrowAddress);

  app.get('/api/verify/config', (_req, res) => {
    res.json({ provider: providerReady() ? 'dojah' : null, onchain: chainReady(), sandbox: !!config.sandbox });
  });

  app.get('/api/verify/challenge', (req: Req, res: Res) => {
    const address = String(req.query.address ?? '');
    if (!isAddress(address)) return fail(res, 400, 'bad_address', 'Invalid account address.');
    const nonce = randomBytes(16).toString('hex');
    const message = challengeMessage(address, nonce, new Date().toISOString());
    challenges.set(nonce, { address, message, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    res.json({ nonce, message });
  });

  app.post('/api/verify', express.json({ limit: '6mb' }), async (req: Req, res: Res) => {
    const { address, nonce, signature, nin, selfie } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof address !== 'string' || !isAddress(address)) return fail(res, 400, 'bad_address', 'Invalid account address.');
    if (typeof nin !== 'string' || !/^\d{11}$/.test(nin)) return fail(res, 400, 'bad_nin', 'Your NIN must be exactly 11 digits.');
    if (typeof selfie !== 'string' || !selfie) return fail(res, 400, 'bad_selfie', 'Please take a selfie.');
    const selfieB64 = selfie.replace(/^data:image\/[a-z]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(selfieB64) || selfieB64.length * 0.75 > MAX_SELFIE_BYTES) {
      return fail(res, 400, 'bad_selfie', 'That photo could not be used. Please take a new selfie.');
    }

    // 1. Wallet ownership — single-use challenge signed by the account.
    const challenge = typeof nonce === 'string' ? challenges.get(nonce) : undefined;
    if (typeof nonce === 'string') challenges.delete(nonce);
    if (!challenge || challenge.expiresAt < Date.now() || challenge.address.toLowerCase() !== address.toLowerCase()) {
      return fail(res, 401, 'bad_challenge', 'Your verification session expired. Please try again.');
    }
    if (typeof signature !== 'string' || !isHex(signature)) return fail(res, 401, 'bad_signature', 'Could not confirm you own this account.');
    let signed = false;
    try {
      signed = await publicClient.verifyMessage({ address, message: challenge.message, signature });
    } catch { signed = false; }
    if (!signed) return fail(res, 401, 'bad_signature', 'Could not confirm you own this account.');

    if (!providerReady()) return fail(res, 503, 'not_configured', 'Identity verification is not available yet. Please try again later.');
    if (!chainReady()) return fail(res, 503, 'not_configured', 'Identity verification is not available yet. Please try again later.');

    // 2. Rate limit per account.
    const key = address.toLowerCase();
    const now = Date.now();
    const a = attempts.get(key);
    if (a && a.resetAt > now && a.count >= MAX_ATTEMPTS_PER_DAY) {
      return fail(res, 429, 'too_many_attempts', 'Too many attempts today. Please try again tomorrow.');
    }
    attempts.set(key, !a || a.resetAt < now ? { count: 1, resetAt: now + 86_400_000 } : { ...a, count: a.count + 1 });

    // 3. One NIN ↔ one account.
    const store = loadStore();
    const hash = ninHash(nin);
    const linked = store.ninHashes[hash];
    if (linked && linked.toLowerCase() !== key) {
      return fail(res, 409, 'nin_in_use', 'This NIN is already linked to another RentFlow account.');
    }

    // 4. Dojah: NIN lookup + selfie face match.
    let dojah: Response;
    try {
      dojah = await fetch(`${config.dojahBaseUrl}/api/v1/kyc/nin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', AppId: config.dojahAppId!, Authorization: config.dojahSecretKey! },
        body: JSON.stringify({ nin, selfie_image: selfieB64, threshold: config.threshold }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return fail(res, 502, 'provider_unreachable', 'The verification service did not respond. Please try again.');
    }
    const body = await dojah.json().catch(() => ({})) as {
      entity?: { first_name?: string; selfie_verification?: { match?: boolean; confidence_value?: number } };
      error?: string;
    };
    if (dojah.status === 401 || dojah.status === 402) {
      console.error(`[Verify] Dojah rejected our credentials or balance (HTTP ${dojah.status})`);
      return fail(res, 503, 'not_configured', 'Identity verification is not available right now. Please try again later.');
    }
    if (dojah.status === 429) return fail(res, 429, 'provider_busy', 'The verification service is busy. Please try again in a minute.');
    if (!dojah.ok || !body.entity) {
      if (config.sandbox) {
        return fail(res, 422, 'sandbox_nin', 'RentFlow is in test mode, which can\'t check real NINs yet. Use the test NIN 70123456789 for now — real NIN checks switch on at launch.');
      }
      return fail(res, 422, 'nin_not_found', 'We could not find that NIN. Check the number on your NIN slip and try again.');
    }
    const match = body.entity.selfie_verification;
    if (!match?.match) {
      return fail(res, 422, 'face_mismatch', 'Your selfie did not match the photo on your NIN record. Take a clear, well-lit selfie facing the camera and try again.', {
        confidence: match?.confidence_value ?? null,
      });
    }

    // 5. Record onchain, then remember the NIN hash.
    try {
      const txHash = await walletClient!.writeContract({
        address: config.escrowAddress!, abi: ESCROW_VERIFY_ABI, functionName: 'setVerified', args: [address, true],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error('setVerified reverted');
      store.ninHashes[hash] = address;
      saveStore(store);
      console.log(`[Verify] ${address} verified onchain (${txHash})`);
      res.json({ ok: true, txHash, firstName: body.entity.first_name ?? null });
    } catch (err) {
      console.error('[Verify] Onchain write failed:', err instanceof Error ? err.message : err);
      return fail(res, 502, 'chain_error', 'You passed the check, but we could not save your badge. Please try again.');
    }
  });
}
