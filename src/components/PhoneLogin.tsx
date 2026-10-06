/**
 * PhoneLogin — sign in with a phone number (no passkey needed).
 * 1. Number → 2. send the pre-typed code on WhatsApp (proves the number) → 3. create or enter a 6-digit PIN.
 * See server/phone-auth.ts and src/lib/phone-wallet.ts for how the wallet key stays safe.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, MessageCircle, Phone } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import type { Hex } from 'viem';
import { createPhoneWallet, pinProofFor, saveDeviceKey, unlockPhoneWallet, weakPin } from '@/lib/phone-wallet';

interface Props { onAuth: (account: SmartAccount, address: string) => void; onBack: () => void }

interface Start { challengeId: string; text: string; waLink: string; botNumber: string; sandboxJoin: string; phone: string; expiresAt: number }
interface Verified { phoneToken: string; phone: string; exists: boolean; salt?: Hex; address?: string; serverShare?: Hex }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? 'Something went wrong. Please try again.');
  return out;
}
const pretty = (p: string) => (/^234\d{10}$/.test(p) ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : `+${p}`);

const input = 'w-full px-4 py-3.5 rounded-xl border text-base outline-none';
const inputStyle = { background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' };
const primary = 'w-full py-4 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2 disabled:opacity-60';

function PinInput({ value, onChange, label, autoFocus, onEnter }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean; onEnter?: () => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</span>
      <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={value} autoFocus={autoFocus} aria-label={label}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }}
        className={`${input} text-center text-2xl tracking-[0.6em] mono`} style={inputStyle} placeholder="••••••" />
    </label>
  );
}

export default function PhoneLogin({ onAuth, onBack }: Props) {
  const [step, setStep] = useState<'number' | 'confirm' | 'create' | 'unlock'>('number');
  const [phone, setPhone] = useState('');
  const [start, setStart] = useState<Start | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [status, setStatus] = useState<'pending' | 'wrong_number' | 'expired'>('pending');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for the WhatsApp message to arrive.
  useEffect(() => {
    if (step !== 'confirm' || !start) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/phone/status/${start.challengeId}`).then(x => x.json() as Promise<{ status: string; error?: string } & Partial<Verified>>).catch(() => null);
      if (stop || !r) return;
      if (r.status === 'verified') { setVerified(r as Verified); setError(null); setStep(r.exists ? 'unlock' : 'create'); }
      else if (r.status === 'wrong_number' || r.status === 'expired') setStatus(r.status);
    };
    const timer = setInterval(() => { void tick(); }, 2000);
    return () => { stop = true; clearInterval(timer); };
  }, [step, start]);

  async function begin() {
    setBusy(true); setError(null);
    try {
      const s = await post<Start>('/api/phone/start', { phone });
      setStart(s); setStatus('pending'); setStep('confirm');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function create() {
    const weak = weakPin(pin);
    if (weak) { setError(weak); return; }
    if (pin !== pin2) { setError('The two PINs don\'t match. Type the same 6 digits twice.'); return; }
    if (!verified?.serverShare) { setError('Your phone check expired. Start again.'); return; }
    setBusy(true); setError(null);
    try {
      const w = await createPhoneWallet(pin, verified.serverShare);
      await post('/api/phone/account', { phoneToken: verified.phoneToken, ...w.backup });
      await saveDeviceKey(w.privateKey, verified.phone).catch(() => undefined); // still signed in for this visit if storage is blocked
      onAuth(w.account, w.account.address);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function unlock() {
    if (!/^\d{6}$/.test(pin)) { setError('Enter your 6-digit PIN.'); return; }
    if (!verified?.salt) { setError('Your phone check expired. Start again.'); return; }
    setBusy(true); setError(null);
    try {
      const b = await post<{ address: string; serverShare: Hex; blob: Hex; iv: Hex; salt: Hex }>('/api/phone/unlock', { phoneToken: verified.phoneToken, pinProof: await pinProofFor(pin, verified.salt) });
      const w = await unlockPhoneWallet(pin, b);
      await saveDeviceKey(w.privateKey, verified.phone).catch(() => undefined);
      onAuth(w.account, w.account.address);
    } catch (e) { setError((e as Error).message); setPin(''); } finally { setBusy(false); }
  }

  const back = () => {
    setError(null); setPin(''); setPin2('');
    if (step === 'number') onBack(); else setStep('number');
  };

  return (
    <div>
      <button onClick={back} className="flex items-center gap-1 text-sm mb-4 -ml-0.5 hover:opacity-60" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> {step === 'number' ? 'Back' : 'Use a different number'}
      </button>

      {step === 'number' && (<>
        <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Continue with your phone number</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>We'll confirm it's yours on WhatsApp. No SMS, no charges.</p>
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Phone number</label>
        <input value={phone} onChange={e => { setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 18)); setError(null); }}
          inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" autoFocus aria-label="Phone number"
          onKeyDown={e => { if (e.key === 'Enter') void begin(); }} className={`${input} mb-4`} style={inputStyle} />
        <button onClick={() => { void begin(); }} disabled={busy || phone.replace(/\D/g, '').length < 10} className={primary} style={{ background: 'var(--accent)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-5 h-5" />} Continue
        </button>
      </>)}

      {step === 'confirm' && start && (<>
        <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Confirm on WhatsApp</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Tap the button, then press <strong>Send</strong> in WhatsApp. The message is already typed for you.</p>
        <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Send this from <strong>{pretty(start.phone)}</strong> to {start.botNumber}</p>
          <p className="mono text-lg font-bold mt-1" style={{ color: 'var(--ink)' }}>{start.text}</p>
        </div>
        <a href={start.waLink} target="_blank" rel="noreferrer" className={primary} style={{ background: '#1fa855' }}>
          <MessageCircle className="w-5 h-5" /> Open WhatsApp
        </a>
        {status === 'pending' && (
          <p className="text-sm text-center mt-4 flex items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Waiting for your message…
          </p>
        )}
        {status === 'wrong_number' && <p className="text-sm text-center mt-4" style={{ color: 'var(--danger)' }}>That message came from a different number. Send it from {pretty(start.phone)}, or go back and change the number.</p>}
        {status === 'expired' && (
          <div className="text-center mt-4">
            <p className="text-sm" style={{ color: 'var(--danger)' }}>This code expired.</p>
            <button onClick={() => { void begin(); }} className="text-sm font-semibold mt-1 underline" style={{ color: 'var(--accent)' }}>Get a new code</button>
          </div>
        )}
        {start.sandboxJoin && (
          <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--subtle)' }}>
            First time? WhatsApp needs you to send <span className="mono">{start.sandboxJoin}</span> to {start.botNumber} once before the code works (test mode).
          </p>
        )}
      </>)}

      {step === 'create' && verified && (<>
        <p className="text-sm flex items-center gap-1.5 mb-3" style={{ color: 'var(--accent)' }}><CheckCircle2 className="w-4 h-4" /> {pretty(verified.phone)} confirmed</p>
        <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Create a 6-digit PIN</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>You'll use it to sign in on a new phone. It protects your wallet — only you know it.</p>
        <div className="space-y-3 mb-3">
          <PinInput label="New PIN" value={pin} onChange={v => { setPin(v); setError(null); }} autoFocus />
          <PinInput label="Type it again" value={pin2} onChange={v => { setPin2(v); setError(null); }} onEnter={() => { void create(); }} />
        </div>
        <p className="text-xs mb-4 px-3 py-2 rounded-xl" style={{ background: 'rgba(212,160,23,0.12)', color: 'var(--ink)' }}>
          Write your PIN down somewhere safe. Handova can't see it or reset it.
        </p>
        <button onClick={() => { void create(); }} disabled={busy || pin.length < 6 || pin2.length < 6} className={primary} style={{ background: 'var(--accent)' }}>
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating your wallet…</> : <><LockKeyhole className="w-5 h-5" /> Create my account</>}
        </button>
      </>)}

      {step === 'unlock' && verified && (<>
        <p className="text-sm flex items-center gap-1.5 mb-3" style={{ color: 'var(--accent)' }}><CheckCircle2 className="w-4 h-4" /> {pretty(verified.phone)} confirmed</p>
        <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Welcome back</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Enter the 6-digit PIN you created for this number.</p>
        <div className="mb-4"><PinInput label="Your PIN" value={pin} onChange={v => { setPin(v); setError(null); }} autoFocus onEnter={() => { void unlock(); }} /></div>
        <button onClick={() => { void unlock(); }} disabled={busy || pin.length < 6} className={primary} style={{ background: 'var(--accent)' }}>
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</> : <><LockKeyhole className="w-5 h-5" /> Sign in</>}
        </button>
      </>)}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
    </div>
  );
}
