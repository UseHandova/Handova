/**
 * WhatsAppInbox — "List by WhatsApp" for landlords.
 * 1. Landlord sends house details (text or voice note) to the RentFlow WhatsApp bot.
 * 2. The bot replies with a 6-digit code (and a tap-to-open link when APP_URL is set).
 * 3. Landlord enters the code here, checks the details and publishes from their own wallet —
 *    so they own the listing onchain and receive the rent.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageCircle, Loader2, MapPin, BedDouble, Check, KeyRound, ExternalLink } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { encodeFunctionData } from 'viem';
import { toast } from 'sonner';
import { formatNaira, nairaToUsdc } from '@/lib/naira';
import { parseAmount } from '@/onchain-money';
import { ESCROW_ABI, ESCROW_ADDRESS } from '@/lib/contracts';
import { bundlerClient } from '@/lib/wallet';
import { useRefreshChain } from '@/lib/chain';
import { waCodeFromUrl } from '@/lib/url';

interface Draft {
  code: string;
  location: string;
  rooms: number;
  rentNgn: number;
  depositNgn: number;
  description: string;
  amenities: string[];
  phoneHint: string;
}

interface Props {
  account: SmartAccount;
}

const BOT_NUMBER = ((import.meta.env.VITE_WHATSAPP_BOT_NUMBER as string | undefined) ?? '').replace(/\D/g, '');
const JOIN_CODE = (import.meta.env.VITE_WHATSAPP_JOIN_CODE as string | undefined) ?? '';

export default function WhatsAppInbox({ account }: Props) {
  const [initialCode] = useState(waCodeFromUrl);
  const [code, setCode] = useState(initialCode);
  // The code being looked up; set on "Find" (or straight away when arriving via the bot's link).
  const [submitted, setSubmitted] = useState(initialCode);
  const [publishing, setPublishing] = useState(false);
  const refreshChain = useRefreshChain();

  const lookup = useQuery({
    queryKey: ['wa-draft', submitted],
    enabled: submitted.length === 6,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      let res: Response;
      try { res = await fetch(`/api/bot/draft/${submitted}`); } catch {
        throw new Error('Could not reach the RentFlow WhatsApp service. Please try again.');
      }
      const body = await res.json().catch(() => ({})) as Draft & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not find that code.');
      return body;
    },
  });
  const draft = submitted ? lookup.data ?? null : null;
  const looking = lookup.isFetching;
  const error = submitted && lookup.error ? lookup.error.message : '';

  function find() {
    if (code === submitted) void lookup.refetch();
    else setSubmitted(code);
  }

  async function publish() {
    if (!draft) return;
    if (!ESCROW_ADDRESS) { toast.error('Contract not deployed yet.'); return; }
    setPublishing(true);
    try {
      const calldata = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: 'createListing',
        args: [
          parseAmount(5042002, nairaToUsdc(draft.rentNgn).toFixed(6)).raw,
          parseAmount(5042002, nairaToUsdc(draft.depositNgn).toFixed(6)).raw,
          JSON.stringify({
            location: draft.location,
            rooms: draft.rooms,
            description: draft.description,
            amenities: draft.amenities,
            source: 'whatsapp',
          }),
        ],
      });
      const hash = await bundlerClient.sendUserOperation({
        account,
        calls: [{ to: ESCROW_ADDRESS, data: calldata, value: 0n }],
        paymaster: true,
      });
      await bundlerClient.waitForUserOperationReceipt({ hash });
      const done = await fetch(`/api/bot/draft/${draft.code}/published`, { method: 'POST' })
        .then(r => r.json() as Promise<{ notified?: boolean }>).catch(() => ({ notified: false }));
      await refreshChain();
      toast.success(done.notified ? 'Your property is live! We sent you a WhatsApp confirmation.' : 'Your property is live! Tenants can find it now.');
      setSubmitted(''); setCode('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes('NotAllowedError') ? 'Passkey cancelled.' : 'Could not publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  const waLink = BOT_NUMBER
    ? `https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(JOIN_CODE || '2 bedroom flat in Yaba, 800k per year, generator and borehole')}`
    : '';

  const card = { background: 'var(--glass-card)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' };

  return (
    <div className="space-y-4">
      {/* Step 1 — send details */}
      <div className="rounded-3xl p-5" style={card}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#25D366' }}>
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>List your house on WhatsApp</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Type it or send a voice note — any language.</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
          Tell us the area, number of rooms, rent and caution fee. Example: <i>"2 bedroom flat for Yaba, 800k per year, caution 200k, borehole dey."</i>{' '}
          We reply with a <b>6-digit code</b>.
          {JOIN_CODE && <> First time? Send <b className="mono">{JOIN_CODE}</b> to connect.</>}
        </p>
        {waLink ? (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="w-full py-3 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
            style={{ background: '#25D366' }}>
            Open WhatsApp <ExternalLink className="w-4 h-4" />
          </a>
        ) : (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Set VITE_WHATSAPP_BOT_NUMBER to show the WhatsApp button.</p>
        )}
      </div>

      {/* Step 2 — enter code */}
      <div className="rounded-3xl p-5" style={card}>
        <label className="flex items-center gap-2 font-bold text-sm mb-3" style={{ color: 'var(--ink)' }}>
          <KeyRound className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Enter the code from WhatsApp
        </label>
        <div className="flex gap-2">
          <input
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setSubmitted(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) find(); }}
            className="flex-1 min-w-0 px-4 py-3 rounded-xl border text-lg tracking-[0.3em] mono outline-none"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
          />
          <button
            onClick={find}
            disabled={code.length !== 6 || looking}
            className="px-5 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find'}
          </button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      {/* Step 3 — review + publish */}
      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl p-5 space-y-3" style={card}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Sent from {draft.phoneHint}</p>
          <div className="flex flex-wrap gap-3 text-sm" style={{ color: 'var(--ink)' }}>
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" style={{ color: 'var(--accent)' }} />{draft.location}</span>
            <span className="flex items-center gap-1"><BedDouble className="w-4 h-4" style={{ color: 'var(--accent)' }} />{draft.rooms} bed</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>Rent / year</p>
              <p className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatNaira(nairaToUsdc(draft.rentNgn))}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>Caution fee</p>
              <p className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatNaira(nairaToUsdc(draft.depositNgn))}</p>
            </div>
          </div>
          {draft.description && <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{draft.description}</p>}
          {draft.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draft.amenities.map(a => (
                <span key={a} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{a}</span>
              ))}
            </div>
          )}
          {draft.rentNgn <= 0 ? (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>We couldn't read the rent. Send the details again on WhatsApp with the rent amount.</p>
          ) : (
            <button onClick={() => { void publish(); }} disabled={publishing}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}>
              {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : <><Check className="w-4 h-4" /> This is correct — publish my house</>}
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
