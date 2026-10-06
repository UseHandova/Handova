/**
 * AdminDashboard — internal admin panel for RentFlow operators.
 * Shows platform stats, pending verifications, flagged accounts, and dispute resolution.
 * Accessible only to the escrow's onchain arbiter. Disputes and stats are read from the chain;
 * verifications and flags are still local demo data until there is a backend.
 */

import { useMemo, useState } from 'react';
import type { SmartAccount } from 'viem/account-abstraction';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Building2, ShieldCheck, AlertTriangle,
  CheckCircle2, X, Eye, BarChart3, TrendingUp, Flag,
} from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import { formatNaira } from '@/lib/naira';
import { toast } from 'sonner';
import { EscrowStatus } from '@/lib/contracts';
import { formatCountdown, sendEscrowTx, useChainState, useIsAdmin, useNow, useRefreshChain, DISPUTE_TIMEOUT_MS } from '@/lib/chain';

interface VerificationRequest {
  id: string;
  name: string;
  nin: string;
  bvn: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface FlaggedUser {
  id: string;
  address: string;
  reason: string;
  flaggedAt: string;
}


const DEMO_VERIFICATIONS: VerificationRequest[] = [
  { id: 'v1', name: 'Emeka Okonkwo', nin: '12345678901', bvn: '22345678901', submittedAt: '2026-10-05', status: 'pending' },
  { id: 'v2', name: 'Fatima Bello', nin: '23456789012', bvn: '33456789012', submittedAt: '2026-10-04', status: 'pending' },
  { id: 'v3', name: 'Chukwuemeka A.', nin: '34567890123', bvn: '44567890123', submittedAt: '2026-10-02', status: 'approved' },
];

const DEMO_FLAGS: FlaggedUser[] = [
  { id: 'f1', address: '0xabc...def1', reason: 'Suspicious listing — duplicate address', flaggedAt: '2026-10-03' },
];



type AdminTab = 'overview' | 'verifications' | 'flags' | 'disputes';

interface Props {
  address: string;
  account: SmartAccount;
  onClose: () => void;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function AdminDashboard({ address, account, onClose }: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [verifications, setVerifications] = useState(DEMO_VERIFICATIONS);
  const [flags, setFlags] = useState(DEMO_FLAGS);

  const isAdmin = useIsAdmin(address);
  const chain = useChainState();
  const refreshChain = useRefreshChain();
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
      { label: 'Pending Verifs', value: String(verifications.filter(v => v.status === 'pending').length), icon: Eye, color: '#f59e0b' },
      { label: 'Open Disputes', value: String(disputes.length), icon: AlertTriangle, color: '#ef4444' },
    ];
  }, [chain.data, disputes, verifications]);

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

  function approveVerification(id: string) {
    setVerifications(prev => prev.map(v => v.id === id ? { ...v, status: 'approved' } : v));
    toast.success('Verification approved. User will receive verified badge.');
  }

  function rejectVerification(id: string) {
    setVerifications(prev => prev.map(v => v.id === id ? { ...v, status: 'rejected' } : v));
    toast.error('Verification rejected. User will be notified.');
  }

  function removeFlag(id: string) {
    setFlags(prev => prev.filter(f => f.id !== id));
    toast.success('Flag removed.');
  }

  const TABS = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: BarChart3 },
    { id: 'verifications' as AdminTab, label: 'Verifications', icon: Shield },
    { id: 'flags' as AdminTab, label: 'Flagged', icon: Flag },
    { id: 'disputes' as AdminTab, label: 'Disputes', icon: AlertTriangle },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--bg-gradient)' }}
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
                    ? { background: 'var(--accent)', color: 'white', boxShadow: '0 2px 10px var(--accent-glow)' }
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
              {tab === 'verifications' && (
                <motion.div key="verif" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-3">
                  {verifications.map(v => (
                    <div key={v.id} className="rounded-2xl p-4"
                      style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{v.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>NIN: {v.nin.slice(0, 5)}••••• · BVN: {v.bvn.slice(0, 5)}•••••</p>
                          <p className="text-xs" style={{ color: 'var(--subtle)' }}>{v.submittedAt}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                          style={{
                            background: v.status === 'approved' ? '#dcfce7' : v.status === 'rejected' ? 'rgba(186,43,76,0.1)' : 'rgba(245,158,11,0.12)',
                            color: v.status === 'approved' ? 'var(--success)' : v.status === 'rejected' ? 'var(--danger)' : '#b45309',
                          }}>
                          {v.status.toUpperCase()}
                        </span>
                      </div>
                      {v.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => approveVerification(v.id)}
                            className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(10,102,56,0.15)' }}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('approve')}
                          </button>
                          <button onClick={() => rejectVerification(v.id)}
                            className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                            style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.15)' }}>
                            <X className="w-3.5 h-3.5" /> {t('reject')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Flags */}
              {tab === 'flags' && (
                <motion.div key="flags" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-3">
                  {flags.length === 0 ? (
                    <p className="text-center text-sm py-10" style={{ color: 'var(--muted)' }}>No flagged accounts.</p>
                  ) : flags.map(f => (
                    <div key={f.id} className="rounded-2xl p-4"
                      style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', border: '1px solid rgba(239,68,68,0.2)', boxShadow: 'var(--shadow-card)' }}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-xs font-semibold mono" style={{ color: 'var(--ink)' }}>{f.address}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{f.reason}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{f.flaggedAt}</p>
                        </div>
                        <Flag className="w-4 h-4 shrink-0" style={{ color: '#ef4444' }} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => removeFlag(f.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(10,102,56,0.15)' }}>
                          Clear Flag
                        </button>
                        <button className="flex-1 py-2 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.15)' }}>
                          Ban Account
                        </button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Disputes */}
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
