/**
 * ListingDetail — full view of a listing: gallery, landlord trust, price breakdown, how escrow
 * protects the tenant, and the two real next steps (book inspection / rent with escrow).
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, BadgeCheck, ShieldAlert, ShieldCheck, MapPin, Map,
  Share2, Heart, Star, Home, Play, Info,
} from 'lucide-react';
import { formatNaira } from '@/lib/naira';
import { useLang } from '@/lib/LangContext';
import type { Listing } from '@/components/BrowseListings';

interface Props {
  listing: Listing;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onRent: () => void;
  onMap: () => void;
  onShare: () => void;
  onReviews: () => void;
}

/** Property types whose name already says how many bedrooms there are. */
const BEDROOM_TYPES = new Set(['single_room', 'self_contain', 'mini_flat', 'two_bed', 'three_bed']);

const STEPS = [
  'You pay rent + caution fee into the RentFlow escrow — not to the landlord.',
  'Rent is released to the landlord only after you confirm you\'ve moved in.',
  'Your caution fee comes back after you move out, unless there\'s a damage dispute.',
];

export default function ListingDetail({ listing, saved, onToggleSave, onClose, onRent, onMap, onShare, onReviews }: Props) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const media = listing.media;
  const current = media[index];
  const go = (d: number) => setIndex(i => (i + d + media.length) % media.length);

  const verifiedDate = listing.verifiedAt > 0
    ? new Date(listing.verifiedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        role="dialog" aria-modal="true" aria-label={listing.title}
        className="relative w-full sm:max-w-3xl max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--popover)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gallery */}
        <div className="relative aspect-[16/10] sm:rounded-t-3xl overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
          {!current ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--subtle)' }}>
              <Home className="w-12 h-12" />
              <span className="text-sm">No photos yet — ask to see the property at inspection.</span>
            </div>
          ) : current.type === 'video' ? (
            <video key={current.url} src={current.url} controls autoPlay muted playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
          ) : (
            <img key={current.url} src={current.url} alt={`${listing.title} — photo ${index + 1}`} className="absolute inset-0 w-full h-full object-cover" />
          )}

          <button onClick={onClose} aria-label="Close"
            className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/70 text-white">
            <X className="w-5 h-5" />
          </button>
          {media.length > 1 && (
            <>
              <button onClick={() => go(-1)} aria-label="Previous"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/70 text-white">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => go(1)} aria-label="Next"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/70 text-white">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="absolute bottom-3 right-3 text-xs font-semibold px-2 py-1 rounded-full bg-black/60 text-white tabular-nums">
                {index + 1} / {media.length}
              </span>
            </>
          )}
        </div>

        {media.length > 1 && (
          <div className="flex gap-2 px-5 pt-3 overflow-x-auto no-scrollbar">
            {media.map((m, i) => (
              <button key={m.url} onClick={() => setIndex(i)} aria-label={`Show ${m.type} ${i + 1}`}
                className="relative shrink-0 w-20 h-14 rounded-lg overflow-hidden"
                style={{ outline: i === index ? '2px solid var(--accent)' : '1px solid var(--border)', outlineOffset: i === index ? 1 : 0 }}>
                {m.type === 'image'
                  ? <img src={m.url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-black"><Play className="w-5 h-5 text-white" /></div>}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-5">
          {/* Title + price */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <MapPin className="w-4 h-4 shrink-0" /> <span className="truncate">{listing.address}</span>
              </p>
              <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{listing.title}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {t(listing.propertyType)}{BEDROOM_TYPES.has(listing.propertyType) ? '' : ` · ${listing.rooms} bed`} · {t(listing.furnishing)}
              </p>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {formatNaira(listing.rentUsdc)}<span className="text-sm font-normal" style={{ color: 'var(--muted)' }}> {t('per_year')}</span>
              </p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>≈ {formatNaira(listing.rentUsdc / 12)} {t('per_month')}</p>
            </div>
          </div>

          {/* Landlord trust */}
          {listing.sample ? (
            <div className="flex gap-3 p-4 rounded-2xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                <b>Sample listing.</b> This shows how listings look. Real homes appear here once landlords list them.
              </p>
            </div>
          ) : listing.verifiedAt > 0 ? (
            <div className="flex gap-3 p-4 rounded-2xl" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}>
              <BadgeCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
              <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>Verified landlord</p>
                <p className="mt-0.5">Identity checked against their NIN record with NIMC on {verifiedDate}. Recorded onchain — it can't be faked.</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 p-4 rounded-2xl" style={{ background: 'rgba(242,180,90,0.10)', border: '1px solid rgba(242,180,90,0.35)' }}>
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
              <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>Landlord not verified yet</p>
                <p className="mt-0.5">RentFlow hasn't checked this landlord's identity. Inspect the property in person, and only pay through RentFlow escrow — never by bank transfer.</p>
              </div>
            </div>
          )}

          {/* Cost breakdown */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {[
              ['Rent (1 year)', listing.rentUsdc],
              ['Caution fee (refundable)', listing.depositUsdc],
              ['Agent fee', 0],
            ].map(([label, amount]) => (
              <div key={label as string} className="flex justify-between px-4 py-2.5 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span className="tabular-nums" style={{ color: 'var(--ink)' }}>{amount === 0 ? '₦0' : formatNaira(amount as number)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 text-sm font-semibold" style={{ background: 'var(--surface-muted)' }}>
              <span style={{ color: 'var(--ink)' }}>You pay into escrow</span>
              <span className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatNaira(listing.rentUsdc + listing.depositUsdc)}</span>
            </div>
          </div>

          {/* How escrow protects you */}
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5 mb-2" style={{ color: 'var(--ink)' }}>
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--success)' }} /> How your money is protected
            </p>
            <ol className="space-y-1.5">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <span className="w-5 h-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center"
                    style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          {listing.desc && (
            <div>
              <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>About this home</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{listing.desc}</p>
            </div>
          )}

          {listing.amenities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map(a => (
                <span key={a} className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>{a}</span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {[
              { label: 'Map', icon: Map, onClick: onMap },
              { label: 'Share', icon: Share2, onClick: onShare },
              { label: saved ? 'Saved' : 'Save', icon: Heart, onClick: onToggleSave, active: saved },
              { label: 'Reviews', icon: Star, onClick: onReviews },
            ].map(({ label, icon: Icon, onClick, active }) => (
              <button key={label} onClick={onClick}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium"
                style={{ background: 'var(--surface-muted)', color: active ? '#e0475b' : 'var(--ink-2)', border: '1px solid var(--border)' }}>
                <Icon className="w-4 h-4" style={active ? { fill: '#e0475b' } : undefined} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 p-4 sm:px-6 flex items-center gap-3"
          style={{ background: 'var(--popover)', borderTop: '1px solid var(--border)' }}>
          <div className="hidden sm:block mr-auto">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Total into escrow</p>
            <p className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatNaira(listing.rentUsdc + listing.depositUsdc)}</p>
          </div>
          <button onClick={onRent}
            className="flex-1 sm:flex-none sm:px-8 py-3.5 rounded-xl font-semibold text-white text-sm"
            style={{ background: 'var(--accent)' }}>
            Inspect &amp; rent
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
