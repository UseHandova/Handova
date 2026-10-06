/**
 * My Leases — the tenant's tenancies, each with a progress tracker, the one thing to do next,
 * and quiet secondary actions (lease PDF, repairs, report a problem).
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Loader2, ShieldCheck, Star, Wrench } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { formatNaira } from '@/lib/naira';
import { EscrowStatus, ESCROW_STATUS_LABEL } from '@/lib/contracts';
import {
  canDispute, formatCountdown, sameAddress, sendEscrowTx, useChainState, useNow, useRefreshChain,
  DEPOSIT_REVIEW_MS, MOVE_IN_WINDOW_MS,
} from '@/lib/chain';
import { toast } from 'sonner';
import LeasePdfExport from '@/components/LeasePdfExport';
import DisputeEvidence from '@/components/DisputeEvidence';
import TenantReviews from '@/components/TenantReviews';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
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

const STEPS = ['Paid', 'Keys', 'Moved in', 'Moved out', 'Settled'];

/** Index of the current step in STEPS. */
function progressStep(e: { status: EscrowStatus; handoverAt: number }): number {
  switch (e.status) {
    case EscrowStatus.Pending: return e.handoverAt ? 1 : 0;
    case EscrowStatus.Active: return 2;
    case EscrowStatus.Ending:
    case EscrowStatus.Disputed: return 3;
    default: return 5;
  }
}

export default function MyLeases({ account, address }: Props) {
  const [acting, setActing] = useState<bigint | null>(null);
  const [pdfEscrow, setPdfEscrow] = useState<bigint | null>(null);
  const [disputeEscrow, setDisputeEscrow] = useState<bigint | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [rateEscrow, setRateEscrow] = useState<{ id: bigint; location: string } | null>(null);
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

  // Tenancies this tenant can still review (moved in, not yet reviewed) — checked by the server.
  const movedInIds = escrows.filter(e => e.status !== EscrowStatus.Pending).map(e => String(e.id)).join(',');
  const eligible = useQuery({
    queryKey: ['review-eligible', address, movedInIds],
    enabled: !!movedInIds && typeof account.signMessage === 'function',
    retry: false,
    staleTime: 60_000,
    queryFn: async () => new Set((await api<{ escrowIds: string[] }>(account, `/api/reviews/eligible?escrowIds=${movedInIds}`)).escrowIds),
  });

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

  const pdf = pdfEscrow !== null ? escrows.find(e => e.id === pdfEscrow) : undefined;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-28">
      <h1 className="text-2xl sm:text-[28px] font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Your leases</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: 'var(--muted)' }}>
        Your money stays in escrow until each step is done. Nothing goes to the landlord before you move in.
      </p>

      {escrows.length === 0 ? (
        <div className="rounded-2xl p-10 flex flex-col items-center text-center" style={{ border: '1px dashed var(--border-strong)' }}>
          <FileText className="w-8 h-8 mb-3" style={{ color: 'var(--subtle)' }} />
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>No leases yet</p>
          <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--muted)' }}>
            When you rent a home on RentFlow, your payment, move-in and caution fee are tracked here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {escrows.map(escrow => {
            const status = escrow.status;
            const step = progressStep(escrow);
            const cover = escrow.listing?.meta.media?.find(m => m.type === 'image')?.url;
            const reviewDeadline = escrow.endRequestedAt + DEPOSIT_REVIEW_MS;
            const busy = acting === escrow.id;

            let next: { text: string; action?: { label: string; run: TenantAction; primary?: boolean } };
            switch (status) {
              case EscrowStatus.Pending:
                next = escrow.handoverAt
                  ? { text: `Your landlord says you have the keys. Confirm within ${formatCountdown(escrow.handoverAt + MOVE_IN_WINDOW_MS, now)} — or report a problem if something is wrong.`, action: { label: 'I have moved in', run: 'confirmMoveIn', primary: true } }
                  : { text: 'Your rent and caution fee are safe in escrow. Confirm once you have the keys and have moved in.', action: { label: 'I have moved in', run: 'confirmMoveIn', primary: true } };
                break;
              case EscrowStatus.Active:
                next = { text: 'You live here. Your caution fee stays in escrow until you move out and the landlord inspects.', action: { label: 'I am moving out', run: 'endTenancy' } };
                break;
              case EscrowStatus.Ending:
                next = now >= reviewDeadline
                  ? { text: 'The inspection period is over. Your caution fee is ready.', action: { label: 'Claim my caution fee', run: 'claimDeposit', primary: true } }
                  : { text: `Your landlord is inspecting. If they don't raise an issue, you can claim your caution fee in ${formatCountdown(reviewDeadline, now)}.` };
                break;
              case EscrowStatus.Disputed:
                next = { text: 'In dispute. The RentFlow team is reviewing evidence from both sides.' };
                break;
              default:
                next = { text: status === EscrowStatus.Refunded ? 'Settled. Money owed to you is ready to withdraw from the top bar.' : 'This tenancy is complete.' };
            }

            return (
              <motion.article key={String(escrow.id)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl overflow-hidden flex flex-col sm:flex-row"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
                <div className="relative sm:w-56 shrink-0 aspect-[16/9] sm:aspect-auto" style={{ background: 'var(--surface-muted)' }}>
                  {cover
                    ? <img src={cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center"><FileText className="w-8 h-8" style={{ color: 'var(--subtle)' }} /></div>}
                </div>

                <div className="flex-1 min-w-0 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] truncate" style={{ color: 'var(--ink)' }}>{escrow.location}</p>
                      <p className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                        {formatNaira(escrow.rentUsdc)}/yr · {formatNaira(escrow.depositUsdc)} caution
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={status === EscrowStatus.Disputed
                        ? { background: 'rgba(242,180,90,0.14)', color: 'var(--warning)' }
                        : { background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                      {ESCROW_STATUS_LABEL[status]}
                    </span>
                  </div>

                  {/* Progress */}
                  <ol className="flex items-center gap-1 my-4" aria-label="Tenancy progress">
                    {STEPS.map((label, i) => {
                      const done = i < step;
                      const current = i === step;
                      return (
                        <li key={label} className="flex-1 min-w-0">
                          <div className="h-1.5 rounded-full" style={{ background: done || current ? 'var(--accent)' : 'var(--surface-muted)', opacity: current ? 0.55 : 1 }} />
                          <p className="text-[11px] mt-1.5 truncate" style={{ color: done || current ? 'var(--ink-2)' : 'var(--subtle)', fontWeight: current ? 600 : 400 }}>{label}</p>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
                    <span>{next.text}</span>
                  </div>

                  {status === EscrowStatus.Active && (
                    <p className="flex items-center gap-1.5 text-xs mt-2" style={{ color: 'var(--success)' }}>
                      <ShieldCheck className="w-3.5 h-3.5" /> Lease certificate (NFT) is in your wallet
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {next.action && (
                      <button onClick={() => { void run(escrow.id, next.action!.run); }} disabled={busy}
                        className="h-10 px-5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                        style={next.action.primary
                          ? { background: 'var(--accent)', color: 'white' }
                          : { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : next.action.primary && <CheckCircle2 className="w-4 h-4" />}
                        {next.action.label}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-1 ml-auto">
                      {[
                        { label: 'Lease PDF', icon: Download, onClick: () => setPdfEscrow(escrow.id) },
                        { label: 'Request repair', icon: Wrench, onClick: () => setShowMaintenance(true) },
                        ...(eligible.data?.has(String(escrow.id)) ? [{ label: 'Rate landlord', icon: Star, onClick: () => setRateEscrow({ id: escrow.id, location: escrow.location }) }] : []),
                        {
                          label: canDispute(escrow) ? 'Report a problem' : 'Evidence',
                          icon: AlertTriangle,
                          onClick: () => { if (canDispute(escrow)) void run(escrow.id, 'dispute'); else setDisputeEscrow(escrow.id); },
                        },
                      ].map(({ label, icon: Icon, onClick }) => (
                        <button key={label} onClick={onClick} disabled={busy}
                          className="h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--surface-muted)]"
                          style={{ color: 'var(--muted)' }}>
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {pdf && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setPdfEscrow(null)}>
            <div className="w-full sm:max-w-md mb-4" onClick={e => e.stopPropagation()}>
              <LeasePdfExport
                lease={{ escrowId: String(pdf.id), property: pdf.location, address: pdf.listing?.meta.address ?? pdf.location, rentUsdc: pdf.rentUsdc, depositUsdc: pdf.depositUsdc, startDate: new Date(pdf.createdAt).toLocaleDateString('en-NG') }}
                onClose={() => setPdfEscrow(null)} />
            </div>
          </div>
        )}
        {disputeEscrow !== null && (
          <DisputeEvidence key="dispute" escrowId={String(disputeEscrow)} onClose={() => setDisputeEscrow(null)} />
        )}
        {showMaintenance && (
          <MaintenanceTracker key="maint" role="tenant" account={account}
            homes={escrows.filter(e => e.status === EscrowStatus.Active || e.status === EscrowStatus.Ending).map(e => ({ escrowId: String(e.id), label: e.location }))}
            labels={Object.fromEntries(escrows.map(e => [String(e.id), e.location]))}
            onClose={() => setShowMaintenance(false)} />
        )}
        {rateEscrow && (
          <TenantReviews key="rate" mode="rate" account={account} escrowId={String(rateEscrow.id)} title={rateEscrow.location}
            onClose={() => setRateEscrow(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
