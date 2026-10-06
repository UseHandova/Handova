/**
 * Phone-number login — for people without (or who lose) a passkey.
 *
 * 1. Prove the number with a "reverse OTP": the app opens WhatsApp with "HANDOVA LOGIN 482913" pre-typed and
 *    the person sends it to our bot. A message *from* their number proves they own it — free, no SMS costs,
 *    and user-started WhatsApp chats need no message templates.
 * 2. The wallet key is made on the person's device and locked with their 6-digit PIN. We keep a locked backup
 *    so a new phone can sign in. Unlocking needs all three: the phone number (step 1), the PIN (every 5 wrong
 *    tries → a lock: 15 minutes the first time, then 24 hours), and a per-account server share. The server alone
 *    can't open it. Locks never become permanent, so a forgetful person never loses their money for good.
 *
 *    pinSecret = PBKDF2(PIN, salt)                 (device only)
 *    pinProof  = HMAC(pinSecret, "pin-proof")      → server stores HMAC(server secret, pinProof)
 *    wrapKey   = HKDF(pinSecret ‖ serverShare)     → AES-GCM(wallet key) = the backup we store
 */

import type { Express, Request, Response } from 'express';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isAddress, isHex } from 'viem';
import { db } from './db';
import { serverHmac } from './auth';
import { normalisePhone } from './inspections';

export const CODE_TTL_MS = 10 * 60_000;
const TOKEN_TTL_MS = 15 * 60_000;
const TRIES_PER_LOCK = 5, FIRST_LOCK_MS = 15 * 60_000, LONG_LOCK_MS = 24 * 3600_000;
const START_LIMIT = 5; // login codes per phone per hour

interface Challenge { id: string; phone: string; code: string; status: 'pending' | 'verified' | 'wrong_number'; from_phone: string; created_at: number; expires_at: number }
interface PhoneAccount {
  phone: string; address: string; salt: string; verifier: string; server_share: string; blob: string; iv: string;
  failed: number; locked_until: number; created_at: number;
}

export function ensurePhoneTables() {
  db().exec(`CREATE TABLE IF NOT EXISTS phone_challenges (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    from_phone TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS phone_challenges_phone ON phone_challenges (phone, created_at);
  CREATE TABLE IF NOT EXISTS phone_accounts (
    phone TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    salt TEXT NOT NULL,
    verifier TEXT NOT NULL,
    server_share TEXT NOT NULL,
    blob TEXT NOT NULL,
    iv TEXT NOT NULL,
    failed INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS phone_pending_shares (
    phone TEXT PRIMARY KEY,
    server_share TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`);
}

/** Signed, short-lived proof that this browser verified `phone`. */
function issuePhoneToken(phone: string, now = Date.now()) {
  const payload = `${phone}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${serverHmac(`phone:${payload}`)}`;
}
function verifyPhoneToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const [phone, exp, mac] = token.split('.');
  if (!phone || !exp || !mac || Number(exp) < Date.now()) return null;
  const expected = serverHmac(`phone:${phone}.${exp}`);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return phone;
}
const pinVerifier = (pinProof: string) => serverHmac(`pin:${pinProof}`);
const mask = (p: string) => `+${p.slice(0, 3)} ••• ••• ${p.slice(-4)}`;

/**
 * Called by the WhatsApp webhook for every inbound message. Returns a reply if the message was a login code,
 * otherwise null (so the listing bot handles it).
 */
export function handleInboundLogin(fromRaw: string, body: string): string | null {
  const m = String(body ?? '').trim().match(/^handova\s+login\s+(\d{6})$/i);
  if (!m) return null;
  ensurePhoneTables();
  const from = normalisePhone(fromRaw.replace(/^whatsapp:/, ''));
  const c = db().query('SELECT * FROM phone_challenges WHERE code = ?').get(m[1]) as Challenge | null;
  if (!c || c.expires_at < Date.now()) return 'That login code has expired. Go back to Handova and tap "Continue with phone number" again.';
  if (c.status === 'verified') return '✅ You\'re already verified. Go back to Handova to finish signing in.';
  if (from !== c.phone) {
    db().query("UPDATE phone_challenges SET status = 'wrong_number', from_phone = ? WHERE id = ?").run(from, c.id);
    return `This code was requested for ${mask(c.phone)}, but you sent it from a different number. Send it from the number you typed in Handova.`;
  }
  db().query("UPDATE phone_challenges SET status = 'verified', from_phone = ? WHERE id = ?").run(from, c.id);
  return '✅ Number confirmed! Go back to Handova to finish signing in.';
}

export function mountPhoneAuth(app: Express, botNumber = process.env.TWILIO_WHATSAPP_NUMBER || '') {
  ensurePhoneTables();
  const bad = (res: Response, status: number, error: string, code = 'bad_request') => res.status(status).json({ ok: false, code, error });
  const botDigits = botNumber.replace(/\D/g, '');
  const sandboxJoin = process.env.TWILIO_SANDBOX_JOIN || ''; // e.g. "join gun-heart" while on the Twilio sandbox

  /** Start: returns the code to send and a wa.me link with it pre-typed. */
  app.post('/api/phone/start', (req: Request, res: Response) => {
    const phone = normalisePhone(req.body?.phone);
    if (!phone) return bad(res, 400, 'Enter your phone number, e.g. 0803 123 4567.', 'phone');
    if (!botDigits) return bad(res, 503, 'Phone sign-in isn\'t set up on this server yet. Use a passkey for now.', 'unavailable');
    const now = Date.now();
    const recent = (db().query('SELECT COUNT(*) AS n FROM phone_challenges WHERE phone = ? AND created_at > ?').get(phone, now - 3600_000) as { n: number }).n;
    if (recent >= START_LIMIT) return bad(res, 429, 'Too many attempts for this number. Please wait an hour and try again.', 'rate_limited');
    db().query('DELETE FROM phone_challenges WHERE expires_at < ?').run(now - 86_400_000);
    let code = '';
    for (let i = 0; i < 5 && !code; i++) {
      const c = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!db().query('SELECT 1 FROM phone_challenges WHERE code = ?').get(c)) code = c;
    }
    const id = randomBytes(16).toString('hex');
    db().query("INSERT INTO phone_challenges (id, phone, code, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)").run(id, phone, code, now, now + CODE_TTL_MS);
    const text = `HANDOVA LOGIN ${code}`;
    res.json({ ok: true, challengeId: id, code, text, phone, waLink: `https://wa.me/${botDigits}?text=${encodeURIComponent(text)}`, botNumber: `+${botDigits}`, sandboxJoin, expiresAt: now + CODE_TTL_MS });
  });

  /** Poll until the WhatsApp message arrives. On success: a phone token, and whether an account exists. */
  app.get('/api/phone/status/:id', (req: Request, res: Response) => {
    const c = db().query('SELECT * FROM phone_challenges WHERE id = ?').get(String(req.params.id)) as Challenge | null;
    if (!c) return bad(res, 404, 'Sign-in request not found. Start again.', 'not_found');
    if (c.status === 'wrong_number') return res.json({ ok: true, status: 'wrong_number', error: 'That message came from a different number. Send it from the number you entered.' });
    if (c.expires_at < Date.now()) return res.json({ ok: true, status: 'expired' });
    if (c.status !== 'verified') return res.json({ ok: true, status: 'pending' });
    const acct = db().query('SELECT address, salt FROM phone_accounts WHERE phone = ?').get(c.phone) as Pick<PhoneAccount, 'address' | 'salt'> | null;
    let serverShare: string | undefined;
    if (!acct) {
      // New account: hand out the server share now (the number is proven) so the device can lock its key with it.
      const pending = db().query('SELECT server_share FROM phone_pending_shares WHERE phone = ?').get(c.phone) as { server_share: string } | null;
      serverShare = pending?.server_share ?? `0x${randomBytes(32).toString('hex')}`;
      db().query('INSERT OR REPLACE INTO phone_pending_shares (phone, server_share, created_at) VALUES (?, ?, ?)').run(c.phone, serverShare, Date.now());
    }
    res.json({ ok: true, status: 'verified', phoneToken: issuePhoneToken(c.phone), phone: c.phone, exists: !!acct, ...(acct ? { salt: acct.salt, address: acct.address } : { serverShare }) });
  });

  /** New account: store the locked backup (the server never sees the key or the PIN). */
  app.post('/api/phone/account', (req: Request, res: Response) => {
    const phone = verifyPhoneToken(req.body?.phoneToken);
    if (!phone) return bad(res, 401, 'Your phone check expired. Start again.', 'expired');
    const { address, salt, pinProof, blob, iv } = (req.body ?? {}) as Record<string, string>;
    if (!isAddress(address) || ![salt, pinProof, blob, iv].every(v => typeof v === 'string' && isHex(v))) return bad(res, 400, 'Invalid account data.');
    if (db().query('SELECT 1 FROM phone_accounts WHERE phone = ?').get(phone)) return bad(res, 409, 'This number already has an account. Sign in with your PIN instead.', 'exists');
    const pending = db().query('SELECT server_share FROM phone_pending_shares WHERE phone = ?').get(phone) as { server_share: string } | null;
    if (!pending) return bad(res, 409, 'Your phone check expired. Start again.', 'expired');
    db().query('INSERT INTO phone_accounts (phone, address, salt, verifier, server_share, blob, iv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(phone, address.toLowerCase(), salt, pinVerifier(pinProof), pending.server_share, blob, iv, Date.now());
    db().query('DELETE FROM phone_pending_shares WHERE phone = ?').run(phone);
    res.json({ ok: true });
  });

  /** Existing account: check the PIN (rate-limited) and return what the device needs to unlock its key. */
  app.post('/api/phone/unlock', (req: Request, res: Response) => {
    const phone = verifyPhoneToken(req.body?.phoneToken);
    if (!phone) return bad(res, 401, 'Your phone check expired. Start again.', 'expired');
    const a = db().query('SELECT * FROM phone_accounts WHERE phone = ?').get(phone) as PhoneAccount | null;
    if (!a) return bad(res, 404, 'No account for this number yet.', 'no_account');
    const now = Date.now();
    const wait = (ms: number) => (ms >= 3600_000 ? `${Math.ceil(ms / 3600_000)} hours` : `${Math.ceil(ms / 60_000)} minutes`);
    if (a.locked_until > now) return bad(res, 423, `Too many wrong PINs. Try again in ${wait(a.locked_until - now)}.`, 'locked');
    const proof = typeof req.body?.pinProof === 'string' ? req.body.pinProof : '';
    const ok = proof && pinVerifier(proof) === a.verifier;
    if (!ok) {
      const failed = a.failed + 1;
      const lockMs = failed % TRIES_PER_LOCK === 0 ? (failed === TRIES_PER_LOCK ? FIRST_LOCK_MS : LONG_LOCK_MS) : 0;
      db().query('UPDATE phone_accounts SET failed = ?, locked_until = ? WHERE phone = ?').run(failed, lockMs ? now + lockMs : 0, phone);
      const left = TRIES_PER_LOCK - (failed % TRIES_PER_LOCK);
      return bad(res, 401, lockMs ? `Wrong PIN. Too many tries — wait ${wait(lockMs)} and try again.`
        : `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${failed < TRIES_PER_LOCK ? '15-minute' : '24-hour'} lock.`, 'wrong_pin');
    }
    db().query('UPDATE phone_accounts SET failed = 0, locked_until = 0 WHERE phone = ?').run(phone);
    res.json({ ok: true, address: a.address, serverShare: a.server_share, blob: a.blob, iv: a.iv, salt: a.salt });
  });
}
