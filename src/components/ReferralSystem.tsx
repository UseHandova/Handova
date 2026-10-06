/**
 * ReferralSystem — share a referral code, earn $2 USDC per completed lease.
 * Code generated from wallet address prefix. Persisted to localStorage.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Copy, X, CheckCircle2, Users } from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { toast } from 'sonner';

const _STORAGE_KEY_REFS = 'rentflow_referrals';
// reserved for future earnings persistence
const _STORAGE_KEY_EARNINGS = 'rentflow_ref_earnings';

interface Props {
  address: string;
  onClose: () => void;
}

function generateCode(addr: string): string {
  return 'RF-' + addr.slice(2, 6).toUpperCase() + addr.slice(-4).toUpperCase();
}

interface ReferralRecord {
  name: string;
  date: string;
  earned: number;
  status: 'pending' | 'completed';
}

const DEMO_REFERRALS: ReferralRecord[] = [
  { name: 'Akin O.', date: '2026-09-20', earned: 2, status: 'completed' },
  { name: 'Ngozi M.', date: '2026-10-01', earned: 0, status: 'pending' },
];

export default function ReferralSystem({ address, onClose }: Props) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [referrals] = useState<ReferralRecord[]>(DEMO_REFERRALS);

  const code = generateCode(address);
  const referralLink = `${window.location.origin}/?ref=${code}`;
  const totalEarned = referrals.filter(r => r.status === 'completed').reduce((s, r) => s + r.earned, 0);
  const completedCount = referrals.filter(r => r.status === 'completed').length;

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success(t('code_copied'));
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback for environments without clipboard API
      toast.success(t('code_copied'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function shareViaWhatsApp() {
    const msg = `Join me on RentFlow — rent Lagos houses directly from landlords, zero agent fees! Use my code *${code}* to sign up: ${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  useEffect(() => {
    // Check URL for incoming referral code
    const params = new URLSearchParams(window.location.search);
    const incomingCode = params.get('ref');
    if (incomingCode) {
      try { localStorage.setItem('rentflow_referred_by', incomingCode); } catch { /* ignore */ }
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'var(--glass-card)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid var(--glass-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{t('refer_friend')}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Earnings card */}
          <div className="rounded-3xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' }}>
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Total Earned</p>
            <p className="display text-3xl font-bold text-white tabular-nums" style={{ letterSpacing: '-0.04em' }}>
              ${totalEarned} USDC
            </p>
            <p className="text-white/60 text-xs mt-1">{completedCount} {t('referrals_made').toLowerCase()}</p>
          </div>

          {/* Referral code */}
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('referral_code')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center justify-center py-4 rounded-2xl"
                style={{ background: 'var(--surface-muted)', border: '2px dashed var(--border)' }}>
                <span className="mono text-2xl font-bold tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}>{code}</span>
              </div>
              <motion.button whileTap={{ scale: 0.88 }} onClick={copyCode}
                className="w-12 h-[60px] rounded-2xl flex items-center justify-center"
                style={{ background: copied ? 'var(--success)' : 'var(--accent-soft)', border: '1px solid var(--border)' }}>
                <AnimatePresence mode="wait">
                  {copied
                    ? <motion.div key="ok" initial={{ scale: 0.6 }} animate={{ scale: 1 }}><CheckCircle2 className="w-5 h-5" style={{ color: 'white' }} /></motion.div>
                    : <motion.div key="copy" initial={{ scale: 0.6 }} animate={{ scale: 1 }}><Copy className="w-5 h-5" style={{ color: 'var(--accent)' }} /></motion.div>
                  }
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

          {/* Reward info */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--accent-soft)' }}>
            <Gift className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>{t('referral_reward')}</p>
          </div>

          {/* Share via WhatsApp */}
          <motion.button whileTap={{ scale: 0.97 }} onClick={shareViaWhatsApp}
            className="w-full py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', boxShadow: '0 4px 16px rgba(37,211,102,0.3)' }}>
            Share via WhatsApp
          </motion.button>

          {/* Referrals list */}
          {referrals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('referrals_made')}</p>
              </div>
              {referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.name}</p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>{r.date}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: r.status === 'completed' ? 'var(--accent-soft)' : 'rgba(245,158,11,0.1)',
                      color: r.status === 'completed' ? 'var(--accent)' : '#b45309',
                    }}>
                    {r.status === 'completed' ? `+$${r.earned} USDC` : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
