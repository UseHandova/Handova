/**
 * InspectionFlow — step-by-step component enforcing inspection before payment.
 *
 * Step 1: "Book Inspection" — tenant taps, records their interest locally,
 *          landlord's WhatsApp number gets a deeplink with property details.
 * Step 2: "Confirm You Visited" — tenant confirms they saw the property.
 * Step 3: "Pay Rent" — USDC escrow flow unlocks only here.
 *
 * This is the ONLY path to payment — the Pay Rent button never appears on the
 * listing card directly.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarCheck, Eye, ShieldCheck, Loader2,
  CheckCircle2, ArrowRight, Phone, X,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNaira, formatUsdc } from "@/lib/naira";
import { parseAmount } from '@/onchain-money';
import { ERC20_APPROVE_ABI, ESCROW_ABI, ESCROW_ADDRESS } from '@/lib/contracts';
import { useRefreshChain } from '@/lib/chain';
import { bundlerClient } from '@/lib/wallet';
import { getUsdc } from '@/onchain-facts';
import { encodeFunctionData, type Hex } from 'viem';
import type { SmartAccount } from 'viem/account-abstraction';
import type { Listing } from '@/components/BrowseListings';

type Step = 'idle' | 'booked' | 'visited' | 'paying' | 'paid';

interface Props {
  listing: Listing;
  account: SmartAccount;
  onClose: () => void;
}

const usdcFact = getUsdc(5042002);
const USDC_ADDR = (usdcFact?.address ?? '0x3600000000000000000000000000000000000000') as Hex;

const springs = { snappy: { type: 'spring', stiffness: 420, damping: 32 } as const };

export default function InspectionFlow({ listing, account, onClose }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [paying, setPaying] = useState(false);
  const refreshChain = useRefreshChain();


  function bookInspection() {
    // Open WhatsApp deep-link to landlord contact (demo number)
    const text = encodeURIComponent(
      `Hello, I am interested in the property at ${listing.address || listing.location}. I would like to book an inspection. (via RentFlow)`
    );
    window.open(`https://wa.me/2348000000000?text=${text}`, '_blank');
    setStep('booked');
    toast.success('Inspection request sent via WhatsApp!');
  }

  function confirmVisit() {
    setStep('visited');
  }

  async function handlePay() {
    if (listing.sample) {
      toast.info('This is a sample listing. Real listings appear here once landlords list onchain.');
      return;
    }
    if (!ESCROW_ADDRESS) {
      toast.error('Contract not deployed — set VITE_ESCROW_ADDRESS first.');
      return;
    }
    setPaying(true);
    try {
      const total = parseAmount(5042002, (listing.rentUsdc + listing.depositUsdc).toString());
      const approveCalldata = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, total.raw],
      });
      const depositCalldata = encodeFunctionData({ abi: ESCROW_ABI, functionName: 'depositRent', args: [listing.id] });

      const hash = await bundlerClient.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDR, data: approveCalldata, value: 0n },
          { to: ESCROW_ADDRESS, data: depositCalldata, value: 0n },
        ],
        paymaster: true,
      });
      toast.promise(bundlerClient.waitForUserOperationReceipt({ hash }), {
        loading: 'Depositing rent to escrow…',
        success: 'Rent in escrow! Confirm move-in once you get the keys.',
        error: 'Transaction failed.',
      });
      await bundlerClient.waitForUserOperationReceipt({ hash });
      void refreshChain();
      setStep('paid');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes('NotAllowedError') ? 'Passkey cancelled.' : 'Could not deposit. Check USDC balance.');
    } finally {
      setPaying(false);
    }
  }

  const STEPS = [
    { id: 'booked', label: 'Book Inspection', icon: CalendarCheck },
    { id: 'visited', label: 'Confirm Visit', icon: Eye },
    { id: 'paid', label: 'Pay Rent', icon: ShieldCheck },
  ];

  const currentIdx = step === 'idle' ? -1 : step === 'booked' ? 0 : step === 'visited' || step === 'paying' ? 1 : 2;

  return (
    <motion.div
      key="inspection-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'var(--glass-card)',
          backdropFilter: 'blur(32px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-bold" style={{ color: 'var(--ink)' }}>
              {listing.title ?? listing.location}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{listing.address || listing.location}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface-strong)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* Step progress bar */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx + 1;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: done ? 'var(--accent)' : active ? 'var(--accent-soft)' : 'var(--surface-strong)',
                      border: active ? '2px solid var(--accent)' : 'none',
                    }}
                  >
                    {done
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : <s.icon className="w-3.5 h-3.5" style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }} />
                    }
                  </div>
                  <span className="text-[10px] font-semibold hidden sm:inline" style={{ color: done ? 'var(--accent)' : 'var(--muted)' }}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-px mx-1" style={{ background: done ? 'var(--accent)' : 'var(--border)' }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Price summary */}
          <div
            className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Annual Rent</p>
              <p className="display font-bold tabular-nums" style={{ color: 'var(--ink)', fontSize: '1.15rem' }}>
                {formatNaira(listing.rentUsdc)}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>{formatUsdc(listing.rentUsdc)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Security Deposit</p>
              <p className="display font-bold tabular-nums" style={{ color: 'var(--ink)', fontSize: '1.15rem' }}>
                {formatNaira(listing.depositUsdc)}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>{formatUsdc(listing.depositUsdc)}</p>
            </div>
          </div>

          {/* ── Step content ── */}
          <AnimatePresence mode="wait">

            {/* STEP 0: Book inspection */}
            {step === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={springs.snappy}
                className="space-y-4"
              >
                {/* Warning banner */}
                <div
                  className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink)' }}>
                    <strong>Inspect before you pay.</strong> You must visit the property and confirm you are satisfied before any payment is released. No exceptions.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {[
                    { icon: CalendarCheck, title: 'Book a free inspection', desc: 'Contact the landlord directly via WhatsApp. Inspections are free, no commitment.' },
                    { icon: Eye, title: 'Visit and verify', desc: 'Check the property in person — structure, water, power, neighbourhood.' },
                    { icon: ShieldCheck, title: 'Pay only if satisfied', desc: 'Rent goes into a smart contract escrow. Released to landlord only after you confirm move-in.' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex gap-3 items-start px-3 py-3 rounded-2xl"
                      style={{ background: 'var(--surface-muted)' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'var(--accent-soft)' }}>
                        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={bookInspection}
                  className="w-full py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                    boxShadow: '0 4px 16px rgba(37,211,102,0.3)',
                  }}
                >
                  <Phone className="w-4 h-4" />
                  Book Inspection via WhatsApp
                </motion.button>
              </motion.div>
            )}

            {/* STEP 1: Booked — confirm visit */}
            {step === 'booked' && (
              <motion.div
                key="booked"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={springs.snappy}
                className="space-y-4"
              >
                <div
                  className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
                  style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,128,71,0.2)' }}
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>Inspection request sent!</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink)' }}>
                      The landlord has been contacted via WhatsApp. Once you have visited the property and you are satisfied, come back and confirm your visit to unlock payment.
                    </p>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={confirmVisit}
                  className="w-full py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)',
                    color: 'white',
                    boxShadow: '0 4px 16px var(--accent-glow)',
                  }}
                >
                  <Eye className="w-4 h-4" />
                  I Have Visited and I'm Satisfied
                  <ArrowRight className="w-4 h-4" />
                </motion.button>

                <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
                  Only confirm after physically visiting the property.
                </p>
              </motion.div>
            )}

            {/* STEP 2: Visited — pay */}
            {step === 'visited' && (
              <motion.div
                key="visited"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={springs.snappy}
                className="space-y-4"
              >
                <div
                  className="rounded-3xl p-4 space-y-3"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Rent goes into smart contract escrow</p>
                  {[
                    `Rent: ${formatNaira(listing.rentUsdc)} (${formatUsdc(listing.rentUsdc)})`,
                    `Security deposit: ${formatNaira(listing.depositUsdc)} — refundable at end of tenancy`,
                    'Released to landlord only after you confirm move-in',
                    'Deposit returned to you when tenancy ends',
                    'Zero agent fee. Zero hidden charges.',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{item}</p>
                    </div>
                  ))}
                </div>

                <div
                  className="flex items-center justify-between px-4 py-3 rounded-2xl font-semibold"
                  style={{ background: 'var(--accent-soft)' }}
                >
                  <span className="text-sm" style={{ color: 'var(--accent)' }}>Total you pay</span>
                  <span className="display tabular-nums" style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>
                    {formatNaira((listing.rentUsdc + listing.depositUsdc))} ({formatUsdc(listing.rentUsdc + listing.depositUsdc)})
                  </span>
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { void handlePay(); }}
                  disabled={paying}
                  className="w-full py-4 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                  style={{
                    background: paying ? 'var(--subtle)' : `${listing.color}`,
                    boxShadow: paying ? 'none' : '0 4px 20px rgba(0,0,0,0.18)',
                  }}
                >
                  {paying
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Depositing to escrow…</>
                    : <><ShieldCheck className="w-4 h-4" /> Pay Rent to Escrow</>
                  }
                </motion.button>
              </motion.div>
            )}

            {/* STEP 3: Paid */}
            {step === 'paid' && (
              <motion.div
                key="paid"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springs.snappy}
                className="flex flex-col items-center text-center py-4 space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.1 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--success, #1a8047) 0%, #52e09b 100%)',
                    boxShadow: '0 12px 40px rgba(26,128,71,0.3)',
                  }}
                >
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </motion.div>
                <div>
                  <h3 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
                    Rent secured in escrow!
                  </h3>
                  <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--muted)' }}>
                    Visit the property, collect your keys, and confirm move-in in the app. Landlord gets paid — you get your NFT lease certificate.
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="px-8 py-3.5 rounded-2xl font-semibold text-white"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)',
                    boxShadow: '0 4px 20px var(--accent-glow)',
                  }}
                >
                  Done
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
