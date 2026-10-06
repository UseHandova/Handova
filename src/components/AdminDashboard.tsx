/**
 * AdminDashboard — internal admin panel for Handova operators.
 * Platform stats, listing moderation and dispute resolution — all real (chain + server).
 * Accessible only to the escrow's onchain arbiter.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, publicApi } from '@/lib/api';
import type { SmartAccount } from 'viem/account-abstraction';
import { Loader2, FileCheck2 } from 'lucide-react';
import { OwnershipReview } from '@/components/OwnershipProof';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Building2, ShieldCheck, AlertTriangle,
  X, Eye, BarChart3, TrendingUp, Flag,
} from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { formatNaira } from '@/lib/naira';
import { toast } from 'sonner';
import { EscrowStatus } from '@/lib/contracts';
import { formatCountdown, sendEscrowTx, useChainState, useIsAdmin, useNow, useRefreshChain, DISPUTE_TIMEOUT_MS } from '@/lib/chain';

type AdminTab = 'overview' | 'moderation' | 'ownership' | 'disputes';

interface Props {
  address: string;
  account: SmartAccount;
  onClose: () => void;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function AdminDashboard({ address, account, onClose }: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<AdminTab>('overview');
  const hidden = useQuery({
    queryKey: ['rentflow-hidden-admin'],
    queryFn: () => publicApi<{ items: { listingId: string; reason: string; hiddenAt: number }[] }>('/api/moderation/hidden'),
  });
  const [moderating, setModerating] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const isAdmin = useIsAdmin(address);
  const chain = useChainState();
  const refreshChain = useRefreshChain();
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<string | null>(null);
  const now = useNow();

  const disputes = useMemo(() => (chain.data?.escrows ?? []).filter(e => e.status === EscrowStatus.Disputed), [chain.data]);

  const STATS = useMemo(() => {
    const listings = chain.data?.listings ?? [];
    const escrows = chain.data?.escrows ?? [];
    const users = new Set([...listings.map(l => l.landlord.toLowerCase()), ...escrows.map(e => e.tenant.toLowerCase())]);
    const volume = escrows.reduce((sum, e) => sum + (e.listing ? e.listing.rentUsdc + e.listing.depositUsdc : 0), 0);
    return [
      { label: 'Onchain Users', value: String(users.size), icon: Users, color: 'var(--accent)' },
      { label: 'Active Listings', value: String(listings.filter(l => l.active && l.escrowId === 0n).length), icon: Building2, color: '#7c3aed' },
      { label: 'Total Escrows', value: String(escrows.length), icon: ShieldCheck, color: '#0e7490' },
      { label: 'Platform Volume', value: formatNaira(volume), icon: TrendingUp, color: '#b45309' },
      { label: 'Verified Landlords', value: String(new Set(listings.filter(l => l.landlordVerifiedAt > 0).map(l => l.landlord.toLowerCase())).size), icon: Eye, color: '#f59e0b' },
      { label: 'Open Disputes', value: String(disputes.length), icon: AlertTriangle, color: '#ef4444' },
    ];
  }, [chain.data, disputes]);

  async function resolve(escrowId: bigint, landlordShare: number) {
    const key = `${escrowId}-${landlordShare}`;
    setResolving(key);
    try {
      await sendEscrowTx(account, { functionName: 'resolveDispute', args: [escrowId, landlordShare] });
      toast.success(`Dispute #${escrowId} resolved — ${landlordShare}% to landlord, ${100 - landlordShare}% to tenant.`);
      await refreshChain();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes('NotAllowedError') ? 'Passkey cancelled.' : 'Could not resolve dispute.');
    } finally {
      setResolving(null);
    }
  }

  async function moderate(listingId: string, action: 'hide' | 'unhide') {
    setModerating(listingId);
    try {
      await api(account, `/api/moderation/${action}`, { body: { listingId, reason: reasons[listingId] || undefined } });
      await Promise.all([hidden.refetch(), qc.invalidateQueries({ queryKey: ['rentflow-hidden'] })]);
      toast.success(action === 'hide' ? `Listing #${listingId} hidden from tenants.` : `Listing #${listingId} is visible again.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/NotAllowedError|cancel/i.test(msg) ? 'Sign-in was cancelled.' : msg);
    } finally {
      setModerating(null);
    }
  }

  const TABS = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: BarChart3 },
    { id: 'moderation' as AdminTab, label: 'Moderation', icon: Flag },
    { id: 'ownership' as AdminTab, label: 'Ownership', icon: FileCheck2 },
    { id: 'disputes' as AdminTab, label: 'Disputes', icon: AlertTriangle },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--backdrop)' /* opaque: a full-screen overlay must hide the page under it */ }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="display text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>{t('admin_dashboard')}</h1>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('admin_only')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {/* Access check */}
        {!isAdmin ? (
          <div className="flex flex-col items-center py-16 gap-4 text-center">
            <Shield className="w-12 h-12" style={{ color: 'var(--danger)' }} />
            <h2 className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Access Restricted</h2>
            <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>
              This dashboard is only accessible to the escrow's dispute arbiter.<br />
              {chain.data?.arbiter && <span className="mono text-xs">{short(chain.data.arbiter)}</span>}
            </p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {TABS.map(t2 => (
                <button key={t2.id} onClick={() => setTab(t2.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold shrink-0 transition-all"
                  style={tab === t2.id
                    ? { background: 'var(--accent)', color: 'white', boxShadow: 'none' }
                    : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <t2.icon className="w-3.5 h-3.5" />{t2.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* Overview */}
              {tab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {STATS.map(s => (
                      <motion.div key={s.label} whileHover={{ y: -2 }}
                        className="rounded-2xl p-4"
                        style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}>
                        <s.icon className="w-5 h-5 mb-2" style={{ color: s.color }} />
                        <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>{s.value}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Verifications */}
              {tab === 'moderation' && (
                <motion.div key="moderation" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-3">
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Hide scam, spam or test listings from tenants. Owners can still see and remove their own listings; hiding is reversible.
                  </p>
                  {(() => {
                    const hiddenIds = new Set((hidden.data?.items ?? []).map(h => h.listingId));
                    const rows = (chain.data?.listings ?? []).filter(l => l.active || hiddenIds.has(String(l.id))).slice().reverse();
                    if (rows.length === 0) return <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>No listings yet.</p>;
                    return rows.map(l => {
                      const id = String(l.id);
                      const isHidden = hiddenIds.has(id);
                      const reason = hidden.data?.items.find(h => h.listingId === id)?.reason;
                      return (
                        <div key={id} className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)', border: `1px solid ${isHidden ? 'rgba(239,113,134,0.4)' : 'var(--border)'}` }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>#{id} · {l.meta.location || 'Untitled'} · {formatNaira(l.rentUsdc)}/yr</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                Landlord <span className="mono">{short(l.landlord)}</span>{l.landlordVerifiedAt > 0 ? ' · verified' : ' · not verified'}{l.escrowId !== 0n ? ' · has tenant' : ''}
                              </p>
                              {isHidden && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Hidden — {reason}</p>}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            {!isHidden && (
                              <input value={reasons[id] ?? ''} onChange={e => setReasons(r => ({ ...r, [id]: e.target.value.slice(0, 300) }))}
                                placeholder="Reason (e.g. duplicate of #3, fake photos)" className="flex-1 min-w-0 h-9 px-3 rounded-lg text-xs outline-none"
                                style={{ background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                            )}
                            <button onClick={() => { void moderate(id, isHidden ? 'unhide' : 'hide'); }} disabled={moderating === id}
                              className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                              style={isHidden ? { background: 'var(--popover)', color: 'var(--ink)', border: '1px solid var(--border)' } : { background: 'rgba(239,113,134,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,113,134,0.3)' }}>
                              {moderating === id && <Loader2 className="w-3 h-3 animate-spin" />}{isHidden ? 'Show again' : 'Hide listing'}
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </motion.div>
              )}

              {/* Disputes */}
              {tab === 'ownership' && <OwnershipReview account={account} />}

              {tab === 'disputes' && (
                <motion.div key="disputes" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-3">
                  {disputes.length === 0 && (
                    <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>No open disputes onchain.</p>
                  )}
                  {disputes.map(d => {
                    const btn = (share: number, label: string, style: React.CSSProperties) => (
                      <button key={share} onClick={() => { void resolve(d.id, share); }} disabled={resolving !== null}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-60" style={style}>
                        {resolving === `${d.id}-${share}` && <Loader2 className="w-3 h-3 animate-spin" />}{label}
                      </button>
                    );
                    return (
                      <div key={String(d.id)} className="rounded-2xl p-4"
                        style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', border: '1px solid rgba(245,158,11,0.25)', boxShadow: 'var(--shadow-card)' }}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{d.listing?.meta.location || `Listing #${d.listingId}`}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Escrow #{String(d.id)} · {formatNaira(d.heldUsdc)} held</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                              Opened {new Date(d.disputedAt).toLocaleDateString('en-NG')} · auto-splits 50/50 in {formatCountdown(d.disputedAt + DISPUTE_TIMEOUT_MS, now)}
                            </p>
                          </div>
                          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#f59e0b' }} />
                        </div>
                        <div className="text-xs space-y-1 mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
                          <div className="flex justify-between"><span style={{ color: 'var(--subtle)' }}>Tenant</span><span className="mono" style={{ color: 'var(--ink)' }}>{short(d.tenant)}</span></div>
                          <div className="flex justify-between"><span style={{ color: 'var(--subtle)' }}>Landlord</span><span className="mono" style={{ color: 'var(--ink)' }}>{d.listing ? short(d.listing.landlord) : '—'}</span></div>
                        </div>
                        <div className="flex gap-2">
                          {btn(100, 'Landlord', { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(10,102,56,0.15)' })}
                          {btn(50, 'Split 50/50', { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' })}
                          {btn(0, 'Tenant', { background: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.15)' })}
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
}
