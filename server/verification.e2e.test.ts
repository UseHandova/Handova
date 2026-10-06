/**
 * End-to-end test for landlord verification.
 * Real pieces: the verification server, the compiled RentFlowEscrow on a local Anvil chain,
 * wallet signatures and onchain writes. Stubbed: Dojah (a local HTTP server mimicking its API).
 *
 * Run: forge build && bun test server/verification.e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { mountVerification, type VerificationConfig } from './verification';

const ANVIL_PORT = 8547;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
// Anvil's well-known dev keys
const OWNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const VERIFIER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const TEST_NIN = '70123456789'; // Dojah's documented sandbox NIN
const GOOD_SELFIE = Buffer.from('FACE_OK jpeg bytes').toString('base64');
const BAD_SELFIE = Buffer.from('someone else').toString('base64');

const ESCROW_ABI = [
  { inputs: [{ name: 'verifier_', type: 'address' }], name: 'setVerifier', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'verifiedAt', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

let anvil: ChildProcess;
let dojahStub: ReturnType<typeof Bun.serve>;
let appServer: Server;
let unconfiguredServer: Server;
let base = '';
let unconfiguredBase = '';
let escrow: Address;
let dataFile = '';
const dojahRequests: { headers: Record<string, string | null>; body: { nin: string; selfie_image: string } }[] = [];

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });

async function waitFor(fn: () => Promise<unknown>, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    try { await fn(); return; } catch (e) { if (Date.now() > end) throw e; await Bun.sleep(200); }
  }
}

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` });
    });
  });
}

/** Run the full client flow: fetch challenge, sign it, submit. */
async function verify(account: PrivateKeyAccount, opts: { nin?: string; selfie?: string; signer?: PrivateKeyAccount; reuseNonce?: string; url?: string } = {}) {
  const url = opts.url ?? base;
  const ch = await (await fetch(`${url}/api/verify/challenge?address=${account.address}`)).json() as { nonce: string; message: string };
  const signature = await (opts.signer ?? account).signMessage({ message: ch.message });
  const res = await fetch(`${url}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: account.address,
      nonce: opts.reuseNonce ?? ch.nonce,
      signature,
      nin: opts.nin ?? TEST_NIN,
      selfie: `data:image/jpeg;base64,${opts.selfie ?? GOOD_SELFIE}`,
    }),
  });
  return { status: res.status, body: await res.json() as { ok: boolean; code?: string; error?: string; txHash?: string }, nonce: ch.nonce };
}

const verifiedAt = (a: Address) => publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'verifiedAt', args: [a] });

beforeAll(async () => {
  // 1. Local chain
  anvil = spawn('anvil', ['--port', String(ANVIL_PORT), '--silent'], { stdio: 'ignore' });
  await waitFor(() => publicClient.getBlockNumber());

  // 2. Deploy the real compiled escrow and hand the verifier role to the backend key
  const artifact = JSON.parse(readFileSync('contracts/out/RentFlowEscrow.sol/RentFlowEscrow.json', 'utf8')) as { abi: unknown[]; bytecode: { object: Hex } };
  const owner = createWalletClient({ account: privateKeyToAccount(OWNER_KEY), chain: foundry, transport: http(RPC) });
  const deployHash = await owner.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: ['0x0000000000000000000000000000000000000001'] });
  escrow = (await publicClient.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
  const setHash = await owner.writeContract({ address: escrow, abi: ESCROW_ABI, functionName: 'setVerifier', args: [privateKeyToAccount(VERIFIER_KEY).address] });
  await publicClient.waitForTransactionReceipt({ hash: setHash });

  // 3. Dojah stub — same route, headers and response shape as the real API
  dojahStub = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/api/v1/kyc/nin/verify' || req.method !== 'POST') return new Response('not found', { status: 404 });
      const body = await req.json() as { nin: string; selfie_image: string };
      dojahRequests.push({ headers: { appId: req.headers.get('AppId'), auth: req.headers.get('Authorization') }, body });
      if (req.headers.get('Authorization') !== 'test-secret') return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (body.nin !== TEST_NIN) return Response.json({ error: 'NIN not found' }, { status: 404 });
      const match = Buffer.from(body.selfie_image, 'base64').toString().startsWith('FACE_OK');
      return Response.json({ entity: { first_name: 'JOHN', last_name: 'MUSA', selfie_verification: { confidence_value: match ? 99.9 : 12.5, match } } });
    },
  });

  // 4. Verification server under test
  dataFile = join(mkdtempSync(join(tmpdir(), 'rf-verify-')), 'verifications.json');
  const config: VerificationConfig = {
    rpcUrl: RPC, chain: foundry, escrowAddress: escrow, verifierPrivateKey: VERIFIER_KEY,
    dojahAppId: 'test-app', dojahSecretKey: 'test-secret', dojahBaseUrl: `http://127.0.0.1:${dojahStub.port}`,
    ninPepper: 'test-pepper', dataFile, threshold: 90,
  };
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  mountVerification(app, config);
  ({ server: appServer, url: base } = await listen(app));

  const bare = express();
  bare.use(express.json({ limit: '6mb' }));
  mountVerification(bare, { ...config, dojahAppId: undefined, dojahSecretKey: undefined, dataFile: `${dataFile}.bare` });
  ({ server: unconfiguredServer, url: unconfiguredBase } = await listen(bare));
}, 60_000);

afterAll(() => {
  appServer?.close();
  unconfiguredServer?.close();
  dojahStub?.stop(true);
  anvil?.kill();
});

describe('landlord verification e2e', () => {
  const landlord = privateKeyToAccount(generatePrivateKey());

  test('reports provider and onchain readiness', async () => {
    expect(await (await fetch(`${base}/api/verify/config`)).json()).toEqual({ provider: 'dojah', onchain: true, sandbox: false });
    expect(await (await fetch(`${unconfiguredBase}/api/verify/config`)).json()).toEqual({ provider: null, onchain: true, sandbox: false });
  });

  test('matching NIN + selfie verifies the landlord onchain', async () => {
    expect(await verifiedAt(landlord.address)).toBe(0n);
    const r = await verify(landlord);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await verifiedAt(landlord.address)).toBeGreaterThan(0n);
  });

  test('sends Dojah the right credentials and a bare base64 selfie', () => {
    const last = dojahRequests.at(-1)!;
    expect(last.headers).toEqual({ appId: 'test-app', auth: 'test-secret' });
    expect(last.body.nin).toBe(TEST_NIN);
    expect(last.body.selfie_image.startsWith('data:')).toBe(false);
  });

  test('never stores the raw NIN', () => {
    expect(existsSync(dataFile)).toBe(true);
    const stored = readFileSync(dataFile, 'utf8');
    expect(stored).not.toContain(TEST_NIN);
    expect(stored.toLowerCase()).toContain(landlord.address.toLowerCase());
  });

  test('a challenge cannot be replayed', async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const first = await verify(other, { selfie: BAD_SELFIE });
    const replay = await verify(other, { reuseNonce: first.nonce });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('bad_challenge');
  });

  test('a signature from a different wallet is rejected', async () => {
    const victim = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const r = await verify(victim, { signer: attacker });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('bad_signature');
    expect(await verifiedAt(victim.address)).toBe(0n);
  });

  test('someone else\'s NIN is refused before any face match is attempted', async () => {
    const before = dojahRequests.length;
    const a = privateKeyToAccount(generatePrivateKey());
    const r = await verify(a, { nin: TEST_NIN, selfie: BAD_SELFIE });
    expect(r.status).toBe(409);
    expect(dojahRequests.length).toBe(before);
    expect(await verifiedAt(a.address)).toBe(0n);
  });

  test('the same NIN cannot verify a second account', async () => {
    const second = privateKeyToAccount(generatePrivateKey());
    const r = await verify(second);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('nin_in_use');
    expect(await verifiedAt(second.address)).toBe(0n);
  });

  test('an unknown NIN is rejected', async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const r = await verify(a, { nin: '11111111111' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('nin_not_found');
  });

  test('a malformed NIN is rejected before calling Dojah', async () => {
    const before = dojahRequests.length;
    const a = privateKeyToAccount(generatePrivateKey());
    const r = await verify(a, { nin: '1234' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('bad_nin');
    expect(dojahRequests.length).toBe(before);
  });

  test('a selfie that does not match the NIN photo is rejected', async () => {
    const r = await verify(landlord, { selfie: BAD_SELFIE });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('face_mismatch');
    expect(await verifiedAt(landlord.address)).toBeGreaterThan(0n); // earlier verification is untouched
  });

  test('too many attempts are throttled', async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await verify(a, { nin: '11111111111' })).status);
    expect(codes.slice(0, 5)).toEqual([422, 422, 422, 422, 422]);
    expect(codes[5]).toBe(429);
  });

  test('without Dojah keys it refuses instead of faking a result', async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const r = await verify(a, { url: unconfiguredBase });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('not_configured');
    expect(await verifiedAt(a.address)).toBe(0n);
  });
});
