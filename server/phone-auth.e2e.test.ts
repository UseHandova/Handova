/**
 * End-to-end tests for phone-number sign-in: reverse-OTP over WhatsApp, PIN-locked wallet backup, lockouts.
 * Uses the real client crypto (src/lib/phone-wallet.ts) against the real server routes.
 * Run: bun test server/phone-auth.e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import express from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

process.env.RENTFLOW_DB = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.TWILIO_SANDBOX_JOIN = 'join gun-heart';

const { mountPhoneAuth, handleInboundLogin } = await import('./phone-auth');
const { lockKey, openKey, pinProofFor, weakPin } = await import('../src/lib/phone-wallet');
const { db } = await import('./db');

let server: Server;
let base = '';
const PHONE = '0803 123 4567', E164 = '2348031234567';

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as Record<string, any> };
}
const status = async (id: string) => (await fetch(`${base}/api/phone/status/${id}`)).json() as Promise<Record<string, any>>;
/** Start a login and "send" the WhatsApp message from `from`. */
async function verify(from = E164) {
  const s = (await post('/api/phone/start', { phone: PHONE })).body;
  const reply = handleInboundLogin(`whatsapp:+${from}`, s.text);
  return { s, reply, st: await status(s.challengeId) };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  mountPhoneAuth(app, 'whatsapp:+14155238886');
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => server?.close());

describe('PIN rules and crypto', () => {
  test('weak PINs are refused with a reason', () => {
    expect(weakPin('123456')).toContain('counting');
    expect(weakPin('111111')).toContain('same digit');
    expect(weakPin('121212')).toContain('repeating');
    expect(weakPin('12345')).toContain('6 digits');
    expect(weakPin('739204')).toBeNull();
  });
  test('a locked key opens only with the right PIN and server share', async () => {
    const pk = generatePrivateKey();
    const share = `0x${'ab'.repeat(32)}` as Hex;
    const l = await lockKey('739204', share, pk);
    expect(await openKey('739204', { ...l, serverShare: share })).toBe(pk);
    expect(openKey('739205', { ...l, serverShare: share })).rejects.toThrow('that PIN');
    expect(openKey('739204', { ...l, serverShare: `0x${'cd'.repeat(32)}` })).rejects.toThrow();
    expect(l.blob).not.toContain(pk.slice(2)); // stored backup is not the raw key
  });
});

describe('proving the number on WhatsApp', () => {
  test('bad numbers are refused', async () => {
    expect((await post('/api/phone/start', { phone: '123' })).body.code).toBe('phone');
  });
  test('start returns a pre-typed wa.me link and the sandbox join hint', async () => {
    const r = await post('/api/phone/start', { phone: PHONE });
    expect(r.body.text).toMatch(/^HANDOVA LOGIN \d{6}$/);
    expect(r.body.waLink).toBe(`https://wa.me/14155238886?text=${encodeURIComponent(r.body.text)}`);
    expect(r.body.sandboxJoin).toBe('join gun-heart');
    expect((await status(r.body.challengeId)).status).toBe('pending');
  });
  test('the code sent from a different number does not verify', async () => {
    const { reply, st } = await verify('2347000000000');
    expect(reply).toContain('different number');
    expect(st.status).toBe('wrong_number');
    expect(st.phoneToken).toBeUndefined();
  });
  test('ordinary messages are left for the listing bot', () => {
    expect(handleInboundLogin('whatsapp:+2348031234567', '2 bedroom flat in Yaba 800k')).toBeNull();
  });
  test('unknown or reused codes get a helpful reply', () => {
    expect(handleInboundLogin('whatsapp:+2348031234567', 'HANDOVA LOGIN 000000')).toContain('expired');
  });
});

describe('new account → sign in on another phone', () => {
  const pin = '739204';
  let address = '';
  let privateKey: Hex;

  test('a new number gets a server share, and the device stores only a locked backup', async () => {
    const { reply, st } = await verify();
    expect(reply).toContain('confirmed');
    expect(st).toMatchObject({ status: 'verified', exists: false, phone: E164 });
    privateKey = generatePrivateKey();
    address = privateKeyToAccount(privateKey).address; // stands in for the smart-account address
    const locked = await lockKey(pin, st.serverShare, privateKey);
    const r = await post('/api/phone/account', { phoneToken: st.phoneToken, address, ...locked });
    expect(r.status).toBe(200);
    const row = db().query('SELECT * FROM phone_accounts WHERE phone = ?').get(E164) as Record<string, string>;
    expect(JSON.stringify(row)).not.toContain(pin);               // PIN never reaches the server
    expect(JSON.stringify(row)).not.toContain(privateKey.slice(2)); // nor the key
  });
  test('the same number cannot create a second account', async () => {
    const { st } = await verify();
    expect(st.exists).toBe(true);
    const r = await post('/api/phone/account', { phoneToken: st.phoneToken, address, salt: '0x00', pinProof: '0x00', blob: '0x00', iv: '0x00' });
    expect(r.body.code).toBe('exists');
  });
  test('on a new phone: verify again, enter the PIN, and the same key comes back', async () => {
    const { st } = await verify();
    const r = await post('/api/phone/unlock', { phoneToken: st.phoneToken, pinProof: await pinProofFor(pin, st.salt) });
    expect(r.status).toBe(200);
    expect(r.body.address).toBe(address.toLowerCase());
    expect(await openKey(pin, r.body as never)).toBe(privateKey);
  });
  test('without proving the number there is nothing to unlock', async () => {
    expect((await post('/api/phone/unlock', { phoneToken: `${E164}.9999999999999.forged`, pinProof: '0x00' })).status).toBe(401);
  });
  test('wrong PINs count down, then lock (15 min, then 24 h) — never forever', async () => {
    db().query('DELETE FROM phone_challenges').run(); // earlier tests used up this hour's login codes
    const { st } = await verify();
    const wrong = await pinProofFor('000001', st.salt);
    const msgs: string[] = [];
    for (let i = 0; i < 5; i++) msgs.push((await post('/api/phone/unlock', { phoneToken: st.phoneToken, pinProof: wrong })).body.error);
    expect(msgs[0]).toContain('4 tries left');
    expect(msgs[4]).toContain('15 minutes');
    const locked = await post('/api/phone/unlock', { phoneToken: st.phoneToken, pinProof: await pinProofFor(pin, st.salt) });
    expect(locked.body.code).toBe('locked'); // even the right PIN waits out the lock
    db().query('UPDATE phone_accounts SET locked_until = 0 WHERE phone = ?').run(E164);
    for (let i = 0; i < 5; i++) msgs.push((await post('/api/phone/unlock', { phoneToken: st.phoneToken, pinProof: wrong })).body.error);
    expect(msgs[9]).toContain('24 hours');
    db().query('UPDATE phone_accounts SET locked_until = 0 WHERE phone = ?').run(E164);
    const ok = await post('/api/phone/unlock', { phoneToken: st.phoneToken, pinProof: await pinProofFor(pin, st.salt) });
    expect(ok.status).toBe(200); // after the wait, the right PIN still works
  });
  test('too many login codes for one number are rate-limited', async () => {
    db().query('DELETE FROM phone_challenges').run();
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await post('/api/phone/start', { phone: PHONE })).status;
    expect(last).toBe(429);
  });
});
