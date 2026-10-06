/**
 * MaintenanceTracker — tenants file maintenance requests, landlords resolve them.
 * Keeps both parties in the app between rent cycles.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, X, Plus, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { toast } from 'sonner';

interface Request {
  id: string;
  title: string;
  desc: string;
  status: 'open' | 'resolved';
  date: string;
  priority: 'low' | 'medium' | 'high';
}

const CATEGORIES = ['Plumbing', 'Electrical', 'Roof / Ceiling', 'Doors / Windows', 'Painting', 'Pest Control', 'Other'];
const PRIORITY_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
const DEMO_REQUESTS: Request[] = [
  { id: 'mq1', title: 'Leaking tap in bathroom', desc: 'The bathroom tap has been dripping for 3 days. Needs urgent fix.', status: 'open', date: '2026-10-01', priority: 'high' },
  { id: 'mq2', title: 'Broken front door lock', desc: 'Front door lock is stiff and sometimes does not turn.', status: 'resolved', date: '2026-09-15', priority: 'medium' },
];

interface Props {
  onClose: () => void;
  role?: 'tenant' | 'landlord';
}

export default function MaintenanceTracker({ onClose, role = 'tenant' }: Props) {
  const { t } = useLang();
  const [requests, setRequests] = useState<Request[]>(DEMO_REQUESTS);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Plumbing');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) { toast.error('Enter a title for the request.'); return; }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));
    const nr: Request = {
      id: `mq${Date.now()}`,
      title: `${category}: ${title}`,
      desc,
      status: 'open',
      date: new Date().toISOString().slice(0, 10),
      priority,
    };
    setRequests(prev => [nr, ...prev]);
    setSubmitting(false);
    setShowForm(false);
    setTitle(''); setDesc('');
    toast.success('Maintenance request submitted. Landlord has been notified.');
  }

  function markResolved(id: string) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r));
    toast.success('Request marked as resolved.');
  }

  const open = requests.filter(r => r.status === 'open');
  const resolved = requests.filter(r => r.status === 'resolved');

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
            <Wrench className="w-4.5 h-4.5" style={{ color: 'var(--accent)' }} />
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{t('maintenance')}</span>
          </div>
          <div className="flex items-center gap-2">
            {role === 'tenant' && (
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => setShowForm(f => !f)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: showForm ? 'var(--accent)' : 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                <Plus className="w-4 h-4" style={{ color: showForm ? 'white' : 'var(--ink)' }} />
              </motion.button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
              <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* New request form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Category</label>
                  <div className="flex gap-2 flex-wrap">
                    {CATEGORIES.map(c => (
                      <button key={c} onClick={() => setCategory(c)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={category === c ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Leaking kitchen tap"
                    className="w-full px-4 py-3 rounded-2xl border text-sm outline-none"
                    style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Description</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)}
                    placeholder={t('request_desc')} rows={3}
                    className="w-full px-4 py-3 rounded-2xl border text-sm outline-none resize-none"
                    style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Priority</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button key={p} onClick={() => setPriority(p)}
                        className="flex-1 py-2.5 rounded-2xl text-xs font-semibold capitalize border"
                        style={priority === p
                          ? { background: PRIORITY_COLORS[p], color: 'white', borderColor: PRIORITY_COLORS[p] }
                          : { background: 'var(--surface-strong)', color: 'var(--muted)', borderColor: 'var(--border)' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { void handleSubmit(); }} disabled={submitting}
                  className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                  style={{ background: submitting ? 'var(--subtle)' : 'var(--accent)' }}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Plus className="w-4 h-4" /> {t('submit_request')}</>}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {requests.length === 0 ? (
            <p className="text-center text-sm py-10" style={{ color: 'var(--muted)' }}>{t('no_requests')}</p>
          ) : (
            <>
              {open.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Open ({open.length})</p>
                  {open.map(r => (
                    <div key={r.id} className="rounded-2xl p-4 space-y-2"
                      style={{ background: 'var(--surface-muted)', border: `1px solid ${PRIORITY_COLORS[r.priority]}40` }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[r.priority] }} />
                            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.title}</p>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{r.desc}</p>
                          <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>{r.date}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>
                          <Clock className="w-2.5 h-2.5" /> Open
                        </span>
                      </div>
                      {role === 'landlord' && (
                        <button onClick={() => markResolved(r.id)}
                          className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(10,102,56,0.15)' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> {t('mark_resolved')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {resolved.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Resolved ({resolved.length})</p>
                  {resolved.map(r => (
                    <div key={r.id} className="rounded-2xl p-4 flex items-center gap-3"
                      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', opacity: 0.7 }}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                        <p className="text-xs" style={{ color: 'var(--subtle)' }}>{r.date}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                        style={{ background: '#dcfce7', color: 'var(--success)' }}>
                        {t('request_resolved')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
