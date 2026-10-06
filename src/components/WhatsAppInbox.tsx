/**
 * WhatsAppInbox — shown in the Landlord Dashboard.
 * Polls /api/bot/pending for listings sent via the WhatsApp bot.
 * Landlord can approve (publish onchain) or reject each one.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Check, X, Loader2, MapPin, BedDouble, RefreshCw, Phone } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { toast } from 'sonner';
import { formatNaira, nairaToUsdc } from '@/lib/naira';
import { parseAmount } from '@/onchain-money';
import { ESCROW_ABI, ESCROW_ADDRESS } from '@/lib/contracts';
import { bundlerClient } from '@/lib/wallet';
import { encodeFunctionData } from 'viem';
import { useLang } from '@/lib/LangContext';

interface BotListing {
  id: string;
  from: string;
  location: string;
  rooms: number;
  rentNgn: number;
  depositNgn: number;
  description: string;
  amenities: string[];
  mediaUrls: string[];
  rawMessage: string;
  parsedAt: number;
  status: 'pending' | 'published' | 'rejected';
}

interface Props {
  account: SmartAccount;
}

const BOT_SECRET: string = (import.meta.env.VITE_BOT_SECRET as string | undefined) ?? '';

export default function WhatsAppInbox({ account }: Props) {
  const { t } = useLang();
  const [listings, setListings] = useState<BotListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [botConfigured, setBotConfigured] = useState(true);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bot/pending', {
        headers: { 'x-bot-secret': BOT_SECRET },
      });
      if (res.status === 401) { setBotConfigured(false); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as BotListing[];
      setListings(data);
      setBotConfigured(true);
    } catch {
      setBotConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPending();
    // Poll every 30s
    const id = setInterval(() => { void fetchPending(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchPending]);

  async function handleApprove(listing: BotListing) {
    if (!ESCROW_ADDRESS) {
      toast.error('Contract not deployed yet.');
      return;
    }
    setPublishing(listing.id);
    try {
      // 1. Publish onchain
      const rentRaw = parseAmount(5042002, nairaToUsdc(listing.rentNgn).toFixed(6)).raw;
      const depositRaw = parseAmount(5042002, nairaToUsdc(listing.depositNgn).toFixed(6)).raw;
      const metadata = JSON.stringify({
        location: listing.location,
        rooms: listing.rooms,
        description: listing.description,
        amenities: listing.amenities,
        source: 'whatsapp',
      });
      const calldata = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: 'createListing',
        args: [rentRaw, depositRaw, metadata],
      });
      const hash = await bundlerClient.sendUserOperation({
        account,
        calls: [{ to: ESCROW_ADDRESS, data: calldata, value: 0n }],
        paymaster: true,
      });
      await bundlerClient.waitForUserOperationReceipt({ hash });

      // 2. Notify bot server to send WhatsApp confirmation
      await fetch('/api/bot/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
        body: JSON.stringify({ id: listing.id }),
      });

      setListings(prev => prev.filter(l => l.id !== listing.id));
      toast.success(`Listed onchain! Landlord notified via WhatsApp.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('NotAllowedError')) toast.error('Failed to publish listing.');
    } finally {
      setPublishing(null);
    }
  }

  async function handleReject(listing: BotListing) {
    await fetch('/api/bot/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
      body: JSON.stringify({ id: listing.id }),
    });
    setListings(prev => prev.filter(l => l.id !== listing.id));
    toast.info('Listing rejected.');
  }

  // Bot not configured yet
  if (!botConfigured) {
    return (
      <div
        className="rounded-2xl p-5 text-sm"
        style={{ background: 'var(--surface-muted)', border: '1px dashed var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {t('whatsapp_bot_section')}
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          {t('whatsapp_bot_desc')}
        </p>
        <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Setup required — add to .env:</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>TWILIO_ACCOUNT_SID=ACxxxxxxxx</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>TWILIO_AUTH_TOKEN=xxxxxxxx</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>OPENAI_API_KEY=sk-xxxx</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>VITE_BOT_SECRET=any-random-string</p>
          <p className="mono" style={{ color: 'var(--muted)' }}>BOT_SECRET=same-string-as-above</p>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          Then run: <span className="mono">bun run server</span> — and set Twilio Sandbox webhook to your tunnel URL + <span className="mono">/api/whatsapp/incoming</span>
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: '#25D366', boxShadow: '0 2px 8px rgba(37,211,102,0.3)' }}
          >
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              {t('whatsapp_bot_section')}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
              {listings.length} pending review
            </p>
          </div>
        </div>
        <button
          onClick={() => { void fetchPending(); }}
          disabled={loading}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* Empty state */}
      {listings.length === 0 && !loading && (
        <div
          className="rounded-2xl p-6 flex flex-col items-center text-center"
          style={{ background: 'var(--surface-muted)', border: '1px dashed var(--border)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: '#25D366' }}
          >
            <Phone className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
            No pending listings
          </p>
          <p className="text-xs max-w-[200px]" style={{ color: 'var(--muted)' }}>
            Landlords can send property details to your WhatsApp bot — they appear here for review.
          </p>
        </div>
      )}

      {/* Listing cards */}
      <AnimatePresence>
        {listings.map((listing, i) => (
          <motion.div
            key={listing.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl overflow-hidden mb-3"
            style={{
              background: 'var(--surface-strong)',
              border: '1px solid var(--border)',
            }}
          >
            {/* WhatsApp green top strip */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #25D366, #128C7E)' }} />

            <div className="p-4">
              {/* From + time */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#25D366' }}
                  >
                    <Phone className="w-3 h-3 text-white" />
                  </div>
                  <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
                    {listing.from.replace('whatsapp:', '')}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                  {new Date(listing.parsedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Parsed details */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{listing.location}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{listing.rooms} bed</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                    {formatNaira(listing.rentNgn / 1600)}/yr
                  </span>
                </div>
                {listing.description && (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{listing.description}</p>
                )}
              </div>

              {/* Original message */}
              {listing.rawMessage && (
                <div
                  className="rounded-xl p-2.5 mb-3 text-xs italic"
                  style={{ background: 'var(--surface-muted)', borderLeft: '3px solid #25D366', color: 'var(--muted)' }}
                >
                  "{listing.rawMessage.slice(0, 120)}{listing.rawMessage.length > 120 ? '…' : ''}"
                </div>
              )}

              {/* Amenities */}
              {listing.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {listing.amenities.map(a => (
                    <span
                      key={a}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { void handleApprove(listing); }}
                  disabled={publishing === listing.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5"
                  style={{ background: publishing === listing.id ? 'var(--subtle)' : 'var(--success)' }}
                >
                  {publishing === listing.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Check className="w-3.5 h-3.5" />
                  }
                  {publishing === listing.id ? 'Publishing…' : 'Publish'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { void handleReject(listing); }}
                  disabled={publishing === listing.id}
                  className="w-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }}
                >
                  <X className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
