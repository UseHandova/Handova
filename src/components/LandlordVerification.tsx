/**
 * LandlordVerification — NIN/BVN identity verification modal.
 * Simulated Prembly-style check. Generates a verified badge on success.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BadgeCheck, X, Loader2, AlertCircle, Shield, ChevronRight } from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { toast } from 'sonner';

type VerifyStatus = 'idle' | 'submitting' | 'pending' | 'approved' | 'rejected';

const STORAGE_KEY = 'rentflow_verification';

function loadStatus(): VerifyStatus {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'approved' || s === 'pending') return s;
  } catch { /* ignore */ }
  return 'idle';
}

interface Props {
  onClose: () => void;
}

export default function LandlordVerification({ onClose }: Props) {
  const { t } = useLang();
  const [status, setStatus] = useState<VerifyStatus>(loadStatus);
  const [nin, setNin] = useState('');
  const [bvn, setBvn] = useState('');
  const [selfie, setSelfie] = useState<string | null>(null);

  const ninValid = /^\d{11}$/.test(nin);
  const bvnValid = /^\d{11}$/.test(bvn);
  const canSubmit = ninValid && bvnValid && selfie;

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('submitting');
    // Simulate async verification (2s)
    await new Promise(r => setTimeout(r, 2000));
    // 90% chance approved, 10% rejected (demo)
    const approved = Math.random() > 0.1;
    const newStatus: VerifyStatus = approved ? 'approved' : 'rejected';
    setStatus(newStatus);
    localStorage.setItem(STORAGE_KEY, newStatus);
    if (approved) {
      toast.success('Identity verified! Your profile now shows a verified badge.');
    } else {
      toast.error('Verification failed. Ensure your NIN/BVN match your ID.');
    }
  }

  function handleSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelfie(reader.result as string);
    reader.readAsDataURL(file);
  }

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
            <BadgeCheck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{t('verify_identity')}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <AnimatePresence mode="wait">

            {/* Approved */}
            {status === 'approved' && (
              <motion.div key="approved" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center py-6 gap-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, var(--success) 0%, #52e09b 100%)', boxShadow: '0 8px 32px rgba(26,128,71,0.3)' }}>
                  <BadgeCheck className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>{t('verification_approved')}</h3>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Your profile now shows a verified badge visible to all tenants.</p>
                </div>
                <button onClick={onClose} className="px-8 py-3 rounded-2xl font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' }}>
                  Done
                </button>
              </motion.div>
            )}

            {/* Pending */}
            {status === 'pending' && (
              <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center py-6 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '2px solid #f59e0b' }}>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>{t('verification_pending')}</h3>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>We are reviewing your documents. This takes 1-2 business days.</p>
                </div>
              </motion.div>
            )}

            {/* Rejected */}
            {status === 'rejected' && (
              <motion.div key="rejected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }}>
                  <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--danger)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>{t('verification_rejected')}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Ensure your NIN and BVN are correct and your selfie is clear.</p>
                  </div>
                </div>
                <button onClick={() => setStatus('idle')} className="w-full py-3 rounded-2xl font-semibold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' }}>
                  Try Again
                </button>
              </motion.div>
            )}

            {/* Idle / submitting form */}
            {(status === 'idle' || status === 'submitting') && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--accent-soft)' }}>
                  <Shield className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
                    {t('verify_identity_sub')} Your NIN and BVN are encrypted and never stored in plain text.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>NIN</label>
                    <input value={nin} onChange={e => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder={t('nin_placeholder')} inputMode="numeric"
                      className="w-full px-4 py-3 rounded-2xl border text-sm outline-none"
                      style={{ background: 'var(--surface-strong)', borderColor: ninValid ? 'var(--accent)' : 'var(--border)', color: 'var(--ink)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>BVN</label>
                    <input value={bvn} onChange={e => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder={t('bvn_placeholder')} inputMode="numeric"
                      className="w-full px-4 py-3 rounded-2xl border text-sm outline-none"
                      style={{ background: 'var(--surface-strong)', borderColor: bvnValid ? 'var(--accent)' : 'var(--border)', color: 'var(--ink)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Selfie / ID Photo</label>
                    <label className="flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-colors"
                      style={{
                        background: selfie ? 'var(--accent-soft)' : 'var(--surface-strong)',
                        borderColor: selfie ? 'var(--accent)' : 'var(--border)',
                      }}>
                      <input type="file" accept="image/*" className="sr-only" onChange={handleSelfie} />
                      {selfie
                        ? <><BadgeCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} /><span className="text-sm" style={{ color: 'var(--accent)' }}>Photo ready</span></>
                        : <><ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} /><span className="text-sm" style={{ color: 'var(--muted)' }}>Tap to add photo</span></>
                      }
                    </label>
                  </div>
                </div>

                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { void handleSubmit(); }}
                  disabled={!canSubmit || status === 'submitting'}
                  className="w-full py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                  style={{
                    background: canSubmit && status !== 'submitting' ? 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' : 'var(--subtle)',
                    boxShadow: canSubmit && status !== 'submitting' ? '0 4px 16px var(--accent-glow)' : 'none',
                  }}>
                  {status === 'submitting'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                    : <><BadgeCheck className="w-4 h-4" /> {t('submit_nin')}</>}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
