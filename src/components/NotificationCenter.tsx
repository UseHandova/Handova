/**
 * NotificationCenter — in-app notification bell with alerts panel.
 * Push/email alerts for: rent due, new listing match, inspection confirmed, escrow funded.
 * Persisted to localStorage. Bell badge shows unread count.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, Home, Calendar, ShieldCheck, Zap } from 'lucide-react';
import { useLang } from '@/lib/LangContext';

export interface Notification {
  id: string;
  type: 'rent_due' | 'new_listing' | 'inspection' | 'escrow';
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'rentflow_notifications';

const TYPE_ICONS: Record<Notification['type'], React.ElementType> = {
  rent_due: Calendar,
  new_listing: Home,
  inspection: CheckCircle2,
  escrow: ShieldCheck,
};

const TYPE_COLORS: Record<Notification['type'], string> = {
  rent_due: '#f59e0b',
  new_listing: 'var(--accent)',
  inspection: 'var(--success)',
  escrow: '#7c3aed',
};

function seedDemoNotifications(): Notification[] {
  return [
    {
      id: 'n1', type: 'rent_due',
      title: 'Rent Due Soon',
      body: 'Your lease at Lekki Phase 1 is due in 7 days. Ensure your wallet has enough USDC.',
      read: false, createdAt: Date.now() - 3600000,
    },
    {
      id: 'n2', type: 'new_listing',
      title: 'New Match in Yaba',
      body: 'A new 2-bedroom flat in Yaba matches your saved search. ₦128,000/mo.',
      read: false, createdAt: Date.now() - 7200000,
    },
    {
      id: 'n3', type: 'inspection',
      title: 'Inspection Confirmed',
      body: 'Your inspection at Victoria Island has been confirmed for tomorrow.',
      read: true, createdAt: Date.now() - 86400000,
    },
    {
      id: 'n4', type: 'escrow',
      title: 'Escrow Funded',
      body: 'Your escrow for Ikeja GRA property is now active. Confirm move-in to release rent.',
      read: true, createdAt: Date.now() - 172800000,
    },
  ];
}

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Notification[];
  } catch { /* ignore */ }
  return seedDemoNotifications();
}

function saveNotifications(notifs: Notification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs)); } catch { /* ignore */ }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCenter() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>(() => loadNotifications());

  const unread = notifs.filter(n => !n.read).length;

  useEffect(() => { saveNotifications(notifs); }, [notifs]);

  function markRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  function dismiss(id: string) {
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  return (
    <>
      {/* Bell button */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(o => !o)}
        className="relative w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: open ? 'var(--accent-soft)' : 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        <Bell className="w-4.5 h-4.5" style={{ color: open ? 'var(--accent)' : 'var(--ink)' }} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ background: '#ef4444' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="absolute right-0 top-12 w-80 max-h-[480px] overflow-y-auto rounded-3xl z-50"
              style={{
                background: 'var(--glass-card)',
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--glass-border)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{t('notifications')}</span>
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                      {t('mark_all_read')}
                    </button>
                  )}
                </div>
              </div>

              {notifs.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <Zap className="w-8 h-8" style={{ color: 'var(--subtle)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('no_notifications')}</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {notifs.map(n => {
                    const Icon = TYPE_ICONS[n.type];
                    return (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={() => markRead(n.id)}
                        className="px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors hover:bg-[var(--accent-soft)]"
                        style={{ background: n.read ? 'transparent' : 'rgba(10,102,56,0.04)' }}
                      >
                        <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
                          style={{ background: `${TYPE_COLORS[n.type]}20` }}>
                          <Icon className="w-4 h-4" style={{ color: TYPE_COLORS[n.type] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{n.title}</p>
                            <span className="text-[10px] shrink-0" style={{ color: 'var(--subtle)' }}>{timeAgo(n.createdAt)}</span>
                          </div>
                          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>{n.body}</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                          style={{ background: 'var(--surface-strong)' }}>
                          <X className="w-3 h-3" style={{ color: 'var(--subtle)' }} />
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
