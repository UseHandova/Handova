/**
 * My Leases — shows active escrows and minted NFT lease certificates.
 * Tenant can confirm move-in and end tenancy from here.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, CheckCircle2, Loader2, Trophy, ExternalLink, Download, AlertTriangle, Wrench, Clock } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { formatNaira } from '@/lib/naira';
import { EscrowStatus, ESCROW_STATUS_LABEL } from '@/lib/contracts';
import {
  canDispute, formatCountdown, sameAddress, sendEscrowTx, useChainState, useNow, useRefreshChain,
  DEPOSIT_REVIEW_MS, MOVE_IN_WINDOW_MS,
} from '@/lib/chain';
import { toast } from 'sonner';
import { buildTxExplorerUrl } from '@/onchain-facts';
import LeasePdfExport from '@/components/LeasePdfExport';
import DisputeEvidence from '@/components/DisputeEvidence';
import MaintenanceTracker from '@/components/MaintenanceTracker';


interface Props {
  account: SmartAccount;
  address: string;
}

type TenantAction = 'confirmMoveIn' | 'endTenancy' | 'claimDeposit' | 'dispute';

const SUCCESS: Record<TenantAction, string> = {
  confirmMoveIn: 'Move-in confirmed! Rent released to landlord. Your NFT lease certificate has been minted.',
  endTenancy: 'Move-out recorded. Your landlord has 7 days to inspect — if they don\'t dispute, your deposit comes back to you.',
  claimDeposit: 'Deposit credited — tap Withdraw in the header.',
  dispute: 'Dispute opened. Upload your evidence so the RentFlow team can review.',
};

export default function MyLeases({ account, address }: Props) {
  const [acting, setActing] = useState<bigint | null>(null);
  const [pdfEscrow, setPdfEscrow] = useState<bigint | null>(null);
  const [disputeEscrow, setDisputeEscrow] = useState<bigint | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const chain = useChainState();
  const refreshChain = useRefreshChain();
  const now = useNow();

  // This tenant's escrows, newest first.
  const escrows = useMemo(() => (chain.data?.escrows ?? [])
    .filter(e => sameAddress(e.tenant, address))
    .reverse()
    .map(e => ({
      ...e,
      location: e.listing?.meta.location || e.listing?.meta.address || `Listing #${e.listingId}`,
      rentUsdc: e.listing?.rentUsdc ?? 0,
      depositUsdc: e.listing?.depositUsdc ?? 0,
      txHash: '',
    })), [chain.data, address]);

  async function run(escrowId: bigint, action: TenantAction) {
    setActing(escrowId);
    try {
      await sendEscrowTx(account, { functionName: action, args: [escrowId] });
      toast.success(SUCCESS[action]);
      await refreshChain();
      if (action === 'dispute') setDisputeEscrow(escrowId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes('NotAllowedError') ? 'Passkey cancelled.' : 'Transaction failed. Please try again.');
    } finally {
      setActing(null);
    }
  }

  if (chain.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--subtle)' }} />
      </div>
    );
  }

  if (escrows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <FileText className="w-12 h-12 mb-4" style={{ color: 'var(--subtle)' }} />
        <h3 className="display text-lg font-600 mb-2" style={{ color: 'var(--ink)' }}>No Active Leases</h3>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Rent a property in Browse to see your escrow and NFT lease certificate here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-28">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h2 className="display text-xl font-700 mb-1" style={{ color: 'var(--ink)' }}>My Leases</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Your active escrows and NFT lease certificates.</p>
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {pdfEscrow !== null && (() => {
          const esc = escrows.find(e => e.id === pdfEscrow);
          if (!esc) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}
              onClick={() => setPdfEscrow(null)}>
              <div className="w-full sm:max-w-md mb-4" onClick={e => e.stopPropagation()}>
                <LeasePdfExport
                  lease={{ escrowId: String(esc.id), property: esc.location, address: esc.location, rentUsdc: esc.rentUsdc, depositUsdc: esc.depositUsdc, startDate: new Date(esc.createdAt).toLocaleDateString('en-NG'), txHash: esc.txHash || undefined }}
                  onClose={() => setPdfEscrow(null)} />
              </div>
            </div>
          );
        })()}
        {disputeEscrow !== null && (
          <DisputeEvidence key="dispute" escrowId={String(disputeEscrow)} onClose={() => setDisputeEscrow(null)} />
        )}
        {showMaintenance && (
          <MaintenanceTracker key="maint" role="tenant" onClose={() => setShowMaintenance(false)} />
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {escrows.map((escrow, i) => {
          const status = escrow.status;
          const isActive = status === EscrowStatus.Active;
          const isPending = status === EscrowStatus.Pending;
          const isEnding = status === EscrowStatus.Ending;
          const isDisputed = status === EscrowStatus.Disputed;
          const isDone = status === EscrowStatus.Released || status === EscrowStatus.Refunded;
          const reviewDeadline = escrow.endRequestedAt + DEPOSIT_REVIEW_MS;

          return (
            <motion.div
              key={String(escrow.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
            >
              {/* Status strip */}
              <div
                className="h-1.5 w-full"
                style={{
                  background: isDone
                    ? 'var(--success)'
                    : isActive
                    ? 'linear-gradient(90deg, var(--accent) 0%, #5cb88a 100%)'
                    : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                }}
              />

              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-600 mb-0.5" style={{ color: 'var(--muted)' }}>{escrow.location}</p>
                    <p className="display text-lg font-700 tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatNaira(escrow.rentUsdc)}<span className="text-sm font-400" style={{ color: 'var(--muted)' }}> / yr</span>
                    </p>
                  </div>
                  <span
                    className="text-xs font-600 px-2.5 py-1 rounded-full"
                    style={{
                      background: isDone ? '#dcfce7' : isActive ? 'var(--accent-soft)' : '#fef9c3',
                      color: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--warning)',
                    }}
                  >
                    {ESCROW_STATUS_LABEL[status]}
                  </span>
                </div>

                {/* Escrow amounts */}
                <div
                  className="flex gap-3 p-3 rounded-xl mb-3"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <div className="flex-1">
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Rent held</p>
                    <p className="text-sm font-600 tabular-nums" style={{ color: 'var(--ink)' }}>
                      {isPending ? formatNaira(escrow.rentUsdc) : '—'}
                    </p>
                  </div>
                  <div className="w-px" style={{ background: 'var(--border)' }} />
                  <div className="flex-1">
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Deposit held</p>
                    <p className="text-sm font-600 tabular-nums" style={{ color: 'var(--ink)' }}>
                      {isPending || isActive || isEnding || isDisputed ? formatNaira(escrow.depositUsdc) : '—'}
                    </p>
                  </div>
                  <div className="w-px" style={{ background: 'var(--border)' }} />
                  <div className="flex-1">
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Escrow ID</p>
                    <p className="text-sm font-600 mono" style={{ color: 'var(--ink)' }}>#{String(escrow.id)}</p>
                  </div>
                </div>

                {/* NFT badge if active */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 p-3 rounded-xl mb-3"
                    style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}
                  >
                    <Trophy className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                    <div>
                      <p className="text-xs font-600" style={{ color: 'var(--success)' }}>NFT Lease Certificate Minted</p>
                      <p className="text-xs" style={{ color: '#15803d' }}>Your tenancy is recorded onchain as an NFT.</p>
                    </div>
                  </motion.div>
                )}

                {/* Actions */}
                {isPending && escrow.handoverAt > 0 && (
                  <div className="flex items-start gap-2 text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    Your landlord says the keys were handed over. Confirm within {formatCountdown(escrow.handoverAt + MOVE_IN_WINDOW_MS, now)}, or raise a dispute if something is wrong.
                  </div>
                )}
                {isPending && (
                  <button
                    onClick={() => { void run(escrow.id, 'confirmMoveIn'); }}
                    disabled={acting === escrow.id}
                    className="w-full py-3 rounded-xl font-600 text-white text-sm flex items-center justify-center gap-2 transition-opacity active:opacity-80"
                    style={{ background: acting === escrow.id ? 'var(--subtle)' : 'var(--accent)' }}
                  >
                    {acting === escrow.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> I Have Moved In</>
                    )}
                  </button>
                )}

                {isActive && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                      Rent released to landlord. Deposit stays in escrow until you move out and the landlord inspects.
                    </div>
                    <button
                      onClick={() => { void run(escrow.id, 'endTenancy'); }}
                      disabled={acting === escrow.id}
                      className="w-full py-3 rounded-xl font-600 text-sm flex items-center justify-center gap-2 border transition-opacity active:opacity-70"
                      style={{
                        background: 'transparent',
                        color: 'var(--ink)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      {acting === escrow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move Out & Start Deposit Review'}
                    </button>
                  </div>
                )}

                {isEnding && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                      {now < reviewDeadline
                        ? `Your landlord is inspecting. If they don't dispute, you can reclaim your deposit in ${formatCountdown(reviewDeadline, now)}.`
                        : 'Review period is over — your deposit is ready to claim.'}
                    </div>
                    {now >= reviewDeadline && (
                      <button
                        onClick={() => { void run(escrow.id, 'claimDeposit'); }}
                        disabled={acting === escrow.id}
                        className="w-full py-3 rounded-xl font-600 text-white text-sm flex items-center justify-center gap-2"
                        style={{ background: acting === escrow.id ? 'var(--subtle)' : 'var(--accent)' }}
                      >
                        {acting === escrow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Claim My Deposit'}
                      </button>
                    )}
                  </div>
                )}

                {isDisputed && (
                  <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    In dispute. The RentFlow team is reviewing the evidence from both sides.
                  </div>
                )}

                {isDone && (
                  <div className="flex items-center gap-2 py-2">
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                    <span className="text-sm font-500" style={{ color: 'var(--success)' }}>
                      {status === EscrowStatus.Refunded ? 'Deposit returned to your wallet.' : 'Tenancy completed.'}
                    </span>
                    {escrow.txHash && (
                      <a
                        href={buildTxExplorerUrl(5042002, escrow.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto"
                      >
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--subtle)' }} />
                      </a>
                    )}
                  </div>
                )}

                {/* Utility actions */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button onClick={() => setPdfEscrow(escrow.id)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <Download className="w-3.5 h-3.5" /> Lease PDF
                  </button>
                  <button onClick={() => {
                    if (canDispute(escrow)) void run(escrow.id, 'dispute');
                    else setDisputeEscrow(escrow.id);
                  }}
                    disabled={acting === escrow.id}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(245,158,11,0.08)', color: '#b45309', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Dispute
                  </button>
                  <button onClick={() => setShowMaintenance(true)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(10,102,56,0.15)' }}>
                    <Wrench className="w-3.5 h-3.5" /> Fix
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
