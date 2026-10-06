/**
 * AuthGate — passkey login/register screen.
 * Cinematic hero, animated background orbs, full i18n.
 */

import { useState, useEffect } from 'react';
import type { SmartAccount } from 'viem/account-abstraction';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Shield, Fingerprint, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { registerPasskey, loginPasskey, restoreSession } from '@/lib/wallet';
import ThemeToggle from '@/components/ThemeToggle';
import LangSelector from '@/components/LangSelector';
import { useLang } from '@/lib/LangContext';

interface Props { onAuth: (account: SmartAccount, address: string) => void; }

const springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 32 } as const,
  gentle: { type: 'spring', stiffness: 280, damping: 26 } as const,
};

export default function AuthGate({ onAuth }: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<'choose' | 'register' | 'login'>('choose');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    void restoreSession().then((account) => {
      if (account) onAuth(account, account.address);
      else setRestoring(false);
    });
  }, [onAuth]);

  const clientKeyMissing = !import.meta.env.VITE_CLIENT_KEY;
  const sanitized = username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  const usernameValid = sanitized.length >= 5;

  async function handleRegister() {
    if (clientKeyMissing) { setError('Circle Client Key not set. See setup banner above.'); return; }
    if (!usernameValid) { setError('Name must be at least 5 letters.'); return; }
    setLoading(true); setError('');
    try {
      const { account } = await registerPasskey(sanitized);
      onAuth(account, account.address);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[RentFlow] registerPasskey error:', e);
      if (msg.includes('InvalidStateError') || msg.includes('already registered'))
        setError('Account exists on this device. Use Sign In instead.');
      else if (msg.includes('NotAllowedError'))
        setError('Passkey cancelled — tap again to retry.');
      else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('clientKey'))
        setError('Client Key invalid or Allowed Domain not set. Check Console setup.');
      else if (msg.includes('SecurityError'))
        setError('Passkey domain mismatch — verify Console Passkey Domain matches this page\'s hostname.');
      else
        setError(`Could not create account: ${msg.slice(0, 120)}`);
    } finally { setLoading(false); }
  }

  async function handleLogin() {
    if (clientKeyMissing) { setError('Circle Client Key not set. See setup banner above.'); return; }
    setLoading(true); setError('');
    try {
      const { account } = await loginPasskey();
      onAuth(account, account.address);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[RentFlow] loginPasskey error:', e);
      if (msg.includes('NotAllowedError'))
        setError('Passkey cancelled — tap again to retry.');
      else if (msg.includes('401') || msg.includes('Unauthorized'))
        setError('Client Key invalid or Allowed Domain not set. Check Console setup.');
      else if (msg.includes('SecurityError'))
        setError('Passkey domain mismatch — verify Console Passkey Domain.');
      else
        setError(`Could not sign in: ${msg.slice(0, 120)}`);
    } finally { setLoading(false); }
  }

  if (restoring) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
          <Loader2 className="w-8 h-8" style={{ color: 'var(--accent)' }} />
        </motion.div>
      </div>
    );
  }

  const TRUST_BADGES = [
    { icon: Shield,       label: 'USDC Escrow',   sub: t('escrow_note').slice(0, 40) + '…' },
    { icon: Fingerprint,  label: t('sign_in'),     sub: t('passkey_sub').slice(0, 40) + '…' },
    { icon: CheckCircle2, label: t('no_agent'),    sub: t('zero_fees').slice(0, 40) + '…' },
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div className="orb-green"
          style={{ width: 380, height: 380, top: '2%', left: '-8%' }}
          animate={{ x: [0, 20, 0], y: [0, -18, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="orb-gold"
          style={{ width: 320, height: 320, bottom: '4%', right: '-6%' }}
          animate={{ x: [0, -16, 0], y: [0, 14, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="orb-green"
          style={{ width: 200, height: 200, bottom: '30%', left: '60%', opacity: 0.5 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <LangSelector compact showMic={false} />
        <ThemeToggle />
      </div>

      {/* Console setup banner */}
      <AnimatePresence>
        {clientKeyMissing && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} className="relative z-10 mx-4 mt-4">
            <div className="rounded-2xl p-4 text-sm" style={{ background: '#fff3cd', border: '1px solid #e6c100', color: '#7a4f00' }}>
              <div className="font-semibold mb-1">Console setup required</div>
              <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: '#5a3a00' }}>
                <li>Go to <strong>console.circle.com</strong> → Keys → Client Keys → Create</li>
                <li>Set <strong>Allowed Domain</strong> to: <code className="mono text-[10px] bg-black/10 px-1 rounded">{window.location.hostname}</code></li>
                <li>Paste key into <strong>VITE_CLIENT_KEY</strong> in <code className="mono text-[10px]">.env</code></li>
                <li>Wallets → Modular Wallets → Configurator → Passkeys → <strong>Domain Name</strong> = same hostname</li>
                <li>Restart the dev server</li>
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-dvh px-5 py-16">
        {/* Logo */}
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ ...springs.gentle, delay: 0.05 }} className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 16px 48px var(--accent-glow), 0 4px 16px rgba(0,0,0,0.12)' }}>
            <Home className="w-10 h-10 text-white" />
          </div>
          <div className="spectral-strip mt-3 mx-auto w-16 opacity-70" />
        </motion.div>

        {/* Headline */}
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }} className="display text-4xl font-bold text-center mb-2"
          style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
          RentFlow
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }} className="text-center text-sm max-w-xs mb-1"
          style={{ color: 'var(--muted)' }}>
          {t('tagline')}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.24 }}
          className="text-center text-xs font-semibold mb-10" style={{ color: 'var(--accent)' }}>
          {t('zero_fees')}
        </motion.p>

        {/* Trust badges */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }} className="flex gap-3 flex-wrap justify-center mb-10">
          {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass-pill flex items-center gap-2 px-3 py-2 rounded-2xl">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--accent-soft)' }}>
                <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-xs font-semibold leading-none mb-0.5" style={{ color: 'var(--ink)' }}>{label}</p>
                <p className="text-[10px] leading-none" style={{ color: 'var(--muted)' }}>{sub}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Auth card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }} className="w-full max-w-sm">
          <div className="glass-card rounded-3xl p-6">
            <div className="spectral-strip mb-6 -mx-6 rounded-t-3xl"
              style={{ marginTop: '-24px', borderRadius: '12px 12px 0 0' }} />

            <AnimatePresence mode="wait">
              {/* Choose */}
              {mode === 'choose' && (
                <motion.div key="choose" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }} transition={springs.snappy}>
                  <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>{t('welcome')}</h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>{t('welcome_sub')}</p>

                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('register')}
                    className="w-full py-4 rounded-2xl font-semibold text-white text-base mb-3 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 4px 20px var(--accent-glow)' }}>
                    <Fingerprint className="w-5 h-5" />
                    {t('create_account')}
                  </motion.button>

                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => { void handleLogin(); }}
                    disabled={loading}
                    className="w-full py-4 rounded-2xl font-semibold text-base border flex items-center justify-center gap-2"
                    style={{ background: 'var(--surface-strong)', color: 'var(--ink)', borderColor: 'var(--border)' }}>
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Fingerprint className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
                    {t('sign_in')}
                  </motion.button>
                  {error && <ErrorMessage msg={error} />}
                </motion.div>
              )}

              {/* Register */}
              {mode === 'register' && (
                <motion.div key="register" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }} transition={springs.snappy}>
                  <button onClick={() => { setMode('choose'); setError(''); }}
                    className="flex items-center gap-1 text-sm mb-4 -ml-0.5 transition-opacity hover:opacity-60"
                    style={{ color: 'var(--muted)' }}>
                    <ArrowLeft className="w-4 h-4" /> {t('back')}
                  </button>

                  <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>{t('create_account')}</h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>{t('create_account_sub')}</p>

                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                    style={{ color: 'var(--muted)' }}>
                    {t('your_name')}
                  </label>
                  <input
                    type="text" value={username}
                    onChange={e => { setUsername(e.target.value); setError(''); }}
                    placeholder={t('name_placeholder')}
                    className="w-full px-4 py-3.5 rounded-xl border text-base mb-2 outline-none"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                    onKeyDown={e => { if (e.key === 'Enter') void handleRegister(); }}
                    autoFocus
                  />
                  {username.length > 0 && (
                    <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                      {t('account_id')}:{' '}
                      <span className="mono" style={{ color: sanitized.length >= 5 ? 'var(--success)' : 'var(--danger)' }}>
                        {sanitized || '—'}
                      </span>
                      {sanitized.length < 5 && sanitized.length > 0 && (
                        <span> · {5 - sanitized.length} {t('need_more_letters')}</span>
                      )}
                    </p>
                  )}
                  {!username.length && <div className="mb-4" />}

                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => { void handleRegister(); }}
                    disabled={loading || !usernameValid}
                    className="w-full py-4 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2"
                    style={{
                      background: usernameValid && !loading ? 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' : 'var(--subtle)',
                      boxShadow: usernameValid && !loading ? '0 4px 20px var(--accent-glow)' : 'none',
                    }}>
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('setting_up')}</>
                      : <><Fingerprint className="w-5 h-5" /> {t('create_with_biometric')}</>}
                  </motion.button>
                  {error && <ErrorMessage msg={error} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-center text-xs mt-6" style={{ color: 'var(--subtle)' }}>
          {t('powered_by')}
        </motion.p>
      </div>
    </div>
  );
}

function ErrorMessage({ msg }: { msg: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-1.5 mt-3 p-3 rounded-xl text-xs"
      style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.18)', color: 'var(--danger)' }}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </motion.div>
  );
}
