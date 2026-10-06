/**
 * TenantReviews — star ratings + written reviews for landlords.
 * Tenants can rate after a lease ends. Landlord public profile shows avg rating.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, User, X, CheckCircle2, Loader2, BadgeCheck } from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { toast } from 'sonner';

export interface Review {
  id: string;
  tenantName: string;
  rating: number;
  body: string;
  date: string;
  verified: boolean;
}

const DEMO_REVIEWS: Review[] = [
  { id: 'r1', tenantName: 'Chisom A.', rating: 5, body: 'Very responsive landlord. Property was exactly as listed. Zero agent stress — I paid directly and got the keys the same day.', date: '2026-09-12', verified: true },
  { id: 'r2', tenantName: 'Tunde B.', rating: 4, body: 'Great experience overall. Inspection was fast, property is clean. Would have given 5 stars but water supply could be better.', date: '2026-08-03', verified: true },
  { id: 'r3', tenantName: 'Ngozi E.', rating: 5, body: 'Best Lagos rental experience ever. No agent, no hidden charges. Escrow was smooth.', date: '2026-07-21', verified: false },
];

interface Props {
  landlordName?: string;
  onClose: () => void;
  mode: 'view' | 'rate';
}

function StarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <motion.button key={n} whileTap={{ scale: 0.85 }}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className="p-0.5"
          disabled={!onChange}
        >
          <Star
            className="w-6 h-6 transition-colors"
            style={{
              color: n <= (hover || value) ? '#f59e0b' : 'var(--border)',
              fill: n <= (hover || value) ? '#f59e0b' : 'none',
            }}
          />
        </motion.button>
      ))}
    </div>
  );
}

const RATING_LABELS = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent'];

export default function TenantReviews({ landlordName = 'Landlord', onClose, mode }: Props) {
  const { t } = useLang();
  const [activeMode, setActiveMode] = useState<'view' | 'rate'>(mode);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviews, setReviews] = useState<Review[]>(DEMO_REVIEWS);

  const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  async function handleSubmit() {
    if (rating === 0) { toast.error('Please select a star rating.'); return; }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    const newReview: Review = {
      id: `r${Date.now()}`,
      tenantName: 'You',
      rating,
      body,
      date: new Date().toISOString().slice(0, 10),
      verified: true,
    };
    setReviews(prev => [newReview, ...prev]);
    setSubmitted(true);
    setSubmitting(false);
    toast.success('Review submitted!');
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
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'var(--glass-card)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid var(--glass-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="font-bold" style={{ color: 'var(--ink)' }}>
            {activeMode === 'view' ? `${t('reviews')} — ${landlordName}` : t('rate_landlord')}
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Toggle */}
          <div className="flex rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['view', 'rate'] as const).map(m => (
              <button key={m} onClick={() => setActiveMode(m)}
                className="flex-1 py-2 text-xs font-semibold transition-all"
                style={activeMode === m
                  ? { background: 'var(--accent)', color: 'white' }
                  : { background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                {m === 'view' ? t('reviews') : t('rate_landlord')}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* View reviews */}
            {activeMode === 'view' && (
              <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* Avg rating */}
                <div className="flex items-center gap-4 px-4 py-3 rounded-2xl" style={{ background: 'var(--accent-soft)' }}>
                  <div className="text-center">
                    <p className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--accent)', letterSpacing: '-0.04em' }}>{avgRating.toFixed(1)}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{t('avg_rating')}</p>
                  </div>
                  <div className="flex-1">
                    <StarRow value={Math.round(avgRating)} />
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{reviews.length} {t('reviews')}</p>
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>{t('no_reviews')}</p>
                ) : (
                  reviews.map(r => (
                    <div key={r.id} className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                            {r.tenantName[0]}
                          </div>
                          <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{r.tenantName}</span>
                          {r.verified && <BadgeCheck className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />}
                        </div>
                        <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{r.date}</span>
                      </div>
                      <StarRow value={r.rating} />
                      {r.body && <p className="text-xs leading-relaxed" style={{ color: 'var(--ink)' }}>{r.body}</p>}
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {/* Rate */}
            {activeMode === 'rate' && (
              <motion.div key="rate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {submitted ? (
                  <div className="flex flex-col items-center py-8 gap-3 text-center">
                    <CheckCircle2 className="w-12 h-12" style={{ color: 'var(--success)' }} />
                    <p className="font-bold" style={{ color: 'var(--ink)' }}>Review submitted!</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>Thank you. Your review helps other tenants make informed decisions.</p>
                    <button onClick={() => setActiveMode('view')} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      See all reviews
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-3 py-3">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                        <User className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{landlordName}</p>
                      <StarRow value={rating} onChange={setRating} />
                      {rating > 0 && <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{RATING_LABELS[rating]}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('your_review')}</label>
                      <textarea value={body} onChange={e => setBody(e.target.value)}
                        placeholder={t('review_placeholder')} rows={4}
                        className="w-full px-4 py-3 rounded-2xl border text-sm outline-none resize-none"
                        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { void handleSubmit(); }} disabled={submitting || rating === 0}
                      className="w-full py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                      style={{ background: rating > 0 && !submitting ? 'var(--accent)' : 'var(--subtle)' }}>
                      {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Star className="w-4 h-4" /> {t('submit_review')}</>}
                    </motion.button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
