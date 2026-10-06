/**
 * LandlordDashboard — full landlord hub.
 * Glass cards, animated media grid, tab navigation, rich stats.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, MapPin, Info, Loader2, Check, Upload, X,
  Play, ImagePlus, Building2, ChevronRight, TrendingUp,
  PlusCircle, Eye, BarChart3, List, MessageCircle,
  CheckCircle2, AlertCircle, BadgeCheck,
} from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { formatNaira, nairaToUsdc, USDC_TO_NGN } from '@/lib/naira';
import { parseAmount } from '@/onchain-money';
import { ESCROW_ABI, ESCROW_ADDRESS } from '@/lib/contracts';
import { sameAddress, useChainState, useRefreshChain, useVerifiedAt, type ChainEscrow } from '@/lib/chain';
import LandlordEscrowPanel from '@/components/LandlordEscrowPanel';
import { bundlerClient } from '@/lib/wallet';
import { encodeFunctionData } from 'viem';
import { toast } from 'sonner';
import WhatsAppInbox from '@/components/WhatsAppInbox';
import LangSelector from '@/components/LangSelector';
import { geocodeAddress, PinDropMap } from '@/components/PropertyMap';
import { PROPERTY_TYPES, type PropertyType, type TranslationKey } from '@/lib/i18n';
import { useLang } from '@/lib/LangContext';
import LandlordVerification from '@/components/LandlordVerification';
import ListingBoost from '@/components/ListingBoost';
import MaintenanceTracker from '@/components/MaintenanceTracker';
import TenantReviews from '@/components/TenantReviews';


interface Props { account: SmartAccount; }

type MediaItem = { id: string; type: 'image' | 'video'; url: string; name: string };
type View = 'home' | 'new-listing';
type DashTab = 'listings' | 'whatsapp' | 'stats';

interface MockListing {
  id: string;
  location: string;
  rooms: string;
  rentNgn: number;
  status: 'active' | 'rented';
  thumb: string | null;
  color: string;
  escrow?: ChainEscrow;
}

const LISTING_COLORS = [
  'linear-gradient(135deg, #0a6638 0%, #14a85a 100%)',
  'linear-gradient(135deg, #1e6b9e 0%, #3b9edd 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
  'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  'linear-gradient(135deg, #0e7490 0%, #22d3ee 100%)',
];

const AMENITIES = ['Generator', 'Borehole', 'Security', 'Parking', 'Tiled', 'Fenced', 'CCTV', 'Pop Ceiling'];

const springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 32 } as const,
  gentle: { type: 'spring', stiffness: 280, damping: 26 } as const,
};

export default function LandlordDashboard({ account }: Props) {
  const [view, setView] = useState<View>('home');
  const [dashTab, setDashTab] = useState<DashTab>(() => (new URLSearchParams(window.location.search).has('wa') ? 'whatsapp' : 'listings'));
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const { t } = useLang();
  const [form, setForm] = useState({
    address: '',
    location: '',
    rooms: '2',
    propertyType: 'two_bed' as PropertyType,
    furnishing: 'unfurnished' as 'furnished' | 'unfurnished' | 'semi_furnished',
    description: '',
    rentNgn: '',
    depositNgn: '',
    amenities: [] as string[],
  });
  const [geoStatus, setGeoStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showPinDrop, setShowPinDrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const chain = useChainState();
  const refreshChain = useRefreshChain();
  const isVerified = (useVerifiedAt(account.address).data ?? 0) > 0;

  // This landlord's listings, read from the escrow contract.
  const listings = useMemo<MockListing[]>(() => {
    const escrows = new Map((chain.data?.escrows ?? []).map(e => [e.id, e]));
    return (chain.data?.listings ?? [])
      .filter(l => sameAddress(l.landlord, account.address))
      .reverse()
      .map(l => ({
        id: String(l.id),
        location: l.meta.location || l.meta.address || `Listing #${l.id}`,
        rooms: String(l.meta.rooms ?? '—'),
        rentNgn: l.rentUsdc * USDC_TO_NGN,
        status: l.escrowId !== 0n ? 'rented' : 'active',
        thumb: null,
        color: LISTING_COLORS[Number(l.id % BigInt(LISTING_COLORS.length))],
        escrow: escrows.get(l.escrowId),
      }));
  }, [chain.data, account.address]);
  const [showVerification, setShowVerification] = useState(false);
  const [showBoost, setShowBoost] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rentUsdc = nairaToUsdc(parseFloat(form.rentNgn) || 0);
  const depositUsdc = nairaToUsdc(parseFloat(form.depositNgn) || 0);
  const locationConfirmed = geoStatus === 'valid' || pin !== null;
  const isValid =
    form.address.trim().length > 5 &&
    locationConfirmed &&
    form.location.trim().length > 0 &&
    form.description.trim().length > 0 &&
    parseFloat(form.rentNgn) > 0 &&
    parseFloat(form.depositNgn) > 0;

  async function checkGeo() {
    if (form.address.trim().length < 5) return;
    setGeoStatus('checking');
    const result = await geocodeAddress(form.address);
    setGeoStatus(result ? 'valid' : 'invalid');
  }

  const readFile = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 10 - media.length);
    const items: MediaItem[] = [];
    for (const f of arr) {
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) continue;
      const url = await readFile(f);
      items.push({
        id: Math.random().toString(36).slice(2),
        type: f.type.startsWith('video/') ? 'video' : 'image',
        url,
        name: f.name,
      });
    }
    setMedia(prev => [...prev, ...items]);
  }, [media.length]);

  function removeMedia(id: string) {
    setMedia(prev => prev.filter(m => m.id !== id));
  }

  function toggleAmenity(a: string) {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(a)
        ? f.amenities.filter(x => x !== a)
        : [...f.amenities, a],
    }));
  }

  async function handleSubmit() {
    if (!isValid) return;
    if (!ESCROW_ADDRESS) {
      toast.error('Contract not deployed yet.');
      return;
    }
    setLoading(true);
    try {
      const rentRaw = parseAmount(5042002, rentUsdc.toFixed(6)).raw;
      const depositRaw = parseAmount(5042002, depositUsdc.toFixed(6)).raw;

      const thumbs = media.slice(0, 3).map(m => ({
        type: m.type,
        url: m.type === 'image' ? m.url.slice(0, 200) : '__video__',
        name: m.name,
      }));

      const metadata = JSON.stringify({
        address: form.address,
        location: form.location,
        rooms: parseInt(form.rooms),
        propertyType: form.propertyType,
        furnishing: form.furnishing,
        description: form.description,
        amenities: form.amenities,
        mediaCount: media.length,
        thumbs,
        ...(pin && { lat: pin.lat, lng: pin.lng }),
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

      await refreshChain();

      setDone(true);
      toast.success('Property listed onchain!');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('NotAllowedError')) toast.error('Could not list property.');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ address: '', location: '', rooms: '2', propertyType: 'two_bed', furnishing: 'unfurnished', description: '', rentNgn: '', depositNgn: '', amenities: [] });
    setGeoStatus('idle');
    setPin(null);
    setMedia([]);
    setDone(false);
    setView('home');
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, var(--success) 0%, #52e09b 100%)', boxShadow: '0 12px 40px rgba(26,128,71,0.3)' }}
        >
          <Check className="w-10 h-10 text-white" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="display text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Listed Onchain!</h2>
          <p className="text-sm mb-7 max-w-xs" style={{ color: 'var(--muted)' }}>
            Your property is live. Rent goes directly into escrow — no agent, no cut.
          </p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={resetForm}
            className="px-8 py-3.5 rounded-2xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 4px 20px var(--accent-glow)' }}
          >
            Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── New listing form ──────────────────────────────────────────────────────
  if (view === 'new-listing') {
    return (
      <div className="px-4 pt-4 pb-28">
        {/* Back */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setView('home')}
          className="flex items-center gap-1 text-sm mb-5 -ml-1"
          style={{ color: 'var(--muted)' }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
        </motion.button>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            New Property
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Add photos, set your price — tenants pay you directly.</p>

          <div className="space-y-5">

            {/* ── Media upload ── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                Photos &amp; Videos ({media.length}/10)
              </label>
              <div
                className="relative rounded-3xl border-2 border-dashed transition-all"
                style={{
                  borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
                  background: dragOver ? 'var(--accent-soft)' : 'var(--surface-muted)',
                  boxShadow: dragOver ? '0 0 0 4px var(--accent-glow)' : 'none',
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={e => { if (e.target.files) void addFiles(e.target.files); }}
                />
                {media.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--accent-soft)' }}>
                      <ImagePlus className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      Tap to add photos or videos
                    </p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>JPG · PNG · MP4 · up to 10 files</p>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      {media.map((m, idx) => (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.04, ...springs.snappy }}
                          className="relative aspect-square rounded-2xl overflow-hidden"
                        >
                          {m.type === 'image' ? (
                            <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"
                              style={{ background: 'var(--surface-muted)' }}>
                              <Play className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                            </div>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); removeMedia(m.id); }}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.65)' }}
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </motion.div>
                      ))}
                      {media.length < 10 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square rounded-2xl border-2 border-dashed flex items-center justify-center transition-colors"
                          style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}
                        >
                          <Upload className="w-5 h-5" style={{ color: 'var(--subtle)' }} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Full address + pin drop ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  Full Street Address <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => setShowPinDrop(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                  style={pin
                    ? { background: 'var(--accent)', color: 'white' }
                    : { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  }
                >
                  <MapPin className="w-3 h-3" />
                  {pin ? 'Pin set ✓' : 'Drop a Pin'}
                </motion.button>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>
                Type your address and tap "Verify", or tap "Drop a Pin" on the map to mark the exact spot.
              </p>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--subtle)' }} />
                <input
                  value={form.address}
                  onChange={e => { setForm(f => ({ ...f, address: e.target.value })); setGeoStatus('idle'); }}
                  onBlur={() => { void checkGeo(); }}
                  placeholder="e.g. 14 Admiralty Way, Lekki Phase 1, Lagos"
                  className="w-full pl-10 pr-12 py-3.5 rounded-2xl border text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--surface-strong)',
                    borderColor: geoStatus === 'valid' ? 'var(--accent)' : geoStatus === 'invalid' ? '#ef4444' : 'var(--border)',
                    color: 'var(--ink)',
                  }}
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {geoStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--subtle)' }} />}
                  {geoStatus === 'valid' && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
                  {geoStatus === 'invalid' && <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />}
                </div>
              </div>
              {geoStatus === 'valid' && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <CheckCircle2 className="w-3 h-3" /> Address found on map
                </motion.p>
              )}
              {geoStatus === 'invalid' && !pin && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs mt-1.5" style={{ color: '#ef4444' }}>
                  Address not found on OpenStreetMap — tap <strong>Drop a Pin</strong> above to mark the exact spot instead.
                </motion.p>
              )}
              {pin && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <CheckCircle2 className="w-3 h-3" /> Pin placed at {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </motion.p>
              )}
            </div>

            {/* ── PinDrop modal ── */}
            {showPinDrop && (
              <PinDropMap
                initialAddress={form.address}
                onConfirm={result => { setPin(result); setGeoStatus('valid'); setShowPinDrop(false); }}
                onClose={() => setShowPinDrop(false)}
              />
            )}

            {/* ── Location (neighbourhood display name) ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Neighbourhood / Area</label>
                <LangSelector compact showMic onVoiceResult={text => setForm(f => ({ ...f, location: text }))} />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--subtle)' }} />
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Lekki Phase 1"
                  className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-sm outline-none transition-colors"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                />
              </div>
            </div>

            {/* ── Bedrooms ── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Bedrooms</label>
              <div className="flex gap-2">
                {['1', '2', '3', '4', '5+'].map(n => (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => setForm(f => ({ ...f, rooms: n }))}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all"
                    style={
                      form.rooms === n
                        ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', boxShadow: '0 2px 12px var(--accent-glow)' }
                        : { background: 'var(--surface-strong)', color: 'var(--ink)', borderColor: 'var(--border)' }
                    }
                  >
                    {n}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* ── Property Type ── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {t('property_type_label')}
              </label>
              <div className="flex flex-wrap gap-2">
                {(PROPERTY_TYPES as readonly PropertyType[]).map(pt => (
                  <motion.button key={pt} whileTap={{ scale: 0.93 }}
                    onClick={() => setForm(f => ({ ...f, propertyType: pt }))}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
                    style={form.propertyType === pt
                      ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', boxShadow: '0 2px 8px var(--accent-glow)' }
                      : { background: 'var(--surface-strong)', color: 'var(--muted)', borderColor: 'var(--border)' }}>
                    {t(pt as TranslationKey)}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* ── Furnishing ── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {t('furnishing_label')}
              </label>
              <div className="flex gap-2">
                {(['unfurnished', 'semi_furnished', 'furnished'] as const).map(fn => (
                  <motion.button key={fn} whileTap={{ scale: 0.93 }}
                    onClick={() => setForm(frm => ({ ...frm, furnishing: fn }))}
                    className="flex-1 py-2.5 rounded-2xl text-xs font-semibold border transition-all"
                    style={form.furnishing === fn
                      ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', boxShadow: '0 2px 8px var(--accent-glow)' }
                      : { background: 'var(--surface-strong)', color: 'var(--muted)', borderColor: 'var(--border)' }}>
                    {t(fn as TranslationKey)}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* ── Description ── */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the property — security, power, finishing…"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border text-sm outline-none resize-none transition-colors"
                style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              />
            </div>

            {/* ── Amenities ── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Amenities</label>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map(a => {
                  const active = form.amenities.includes(a);
                  return (
                    <motion.button
                      key={a}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => toggleAmenity(a)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
                      style={
                        active
                          ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', boxShadow: '0 2px 8px var(--accent-glow)' }
                          : { background: 'var(--surface-strong)', color: 'var(--muted)', borderColor: 'var(--border)' }
                      }
                    >
                      {a}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* ── Pricing card ── */}
            <div
              className="rounded-3xl p-5 space-y-4"
              style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Pricing</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Annual Rent (₦)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.rentNgn}
                  onChange={e => setForm(f => ({ ...f, rentNgn: e.target.value }))}
                  placeholder="e.g. 480000"
                  className="w-full px-4 py-3.5 rounded-2xl border text-lg font-bold outline-none tabular-nums"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                />
                {parseFloat(form.rentNgn) > 0 && (
                  <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                    ≈ {rentUsdc.toFixed(2)} USDC stored onchain
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Security Deposit (₦)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.depositNgn}
                  onChange={e => setForm(f => ({ ...f, depositNgn: e.target.value }))}
                  placeholder="e.g. 480000"
                  className="w-full px-4 py-3.5 rounded-2xl border text-lg font-bold outline-none tabular-nums"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                />
              </div>

              {parseFloat(form.rentNgn) > 0 && parseFloat(form.depositNgn) > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between text-sm pt-3 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span style={{ color: 'var(--muted)' }}>Total tenant pays</span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formatNaira((parseFloat(form.rentNgn) + parseFloat(form.depositNgn)) / 1600)}
                  </span>
                </motion.div>
              )}
            </div>

            {/* ── Escrow note ── */}
            <div className="flex gap-3 p-4 rounded-2xl" style={{ background: 'var(--accent-soft)' }}>
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
                Rent held by smart contract — not an agent. Released to you only after tenant confirms move-in. <strong>Zero agent fee.</strong>
              </p>
            </div>

            {/* ── Submit ── */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { void handleSubmit(); }}
              disabled={!isValid || loading}
              className="w-full py-4 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2 transition-all"
              style={{
                background: isValid && !loading
                  ? 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)'
                  : 'var(--subtle)',
                boxShadow: isValid && !loading ? '0 4px 20px var(--accent-glow)' : 'none',
              }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Listing onchain…</>
                : <><Home className="w-4 h-4" /> List Property</>
              }
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Home dashboard ─────────────────────────────────────────────────────────
  const totalEarnings = listings.filter(l => l.status === 'rented').reduce((s, l) => s + l.rentNgn, 0);
  const activeCount = listings.filter(l => l.status === 'active').length;
  const rentedCount = listings.filter(l => l.status === 'rented').length;

  return (
    <div className="px-4 pt-4 pb-28">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>

        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              Landlord Hub
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              No agents. You keep 100% of rent.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setView('new-listing')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-semibold text-white text-sm"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)',
              boxShadow: '0 4px 16px var(--accent-glow)',
            }}
          >
            <PlusCircle className="w-4 h-4" />
            List
          </motion.button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Properties', value: String(listings.length), icon: Building2 },
            { label: 'Active', value: String(activeCount), icon: List },
            { label: 'Rented', value: String(rentedCount), icon: BarChart3 },
          ].map(({ label, value, icon: Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl p-3.5 glass-card"
            >
              <Icon className="w-4 h-4 mb-2" style={{ color: 'var(--accent)' }} />
              <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
              <div className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--muted)' }}>{label}</div>
            </motion.div>
          ))}
        </div>

        {/* Earnings card */}
        {listings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-5 mb-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' }}
          >
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <p className="text-white/70 text-xs font-medium mb-1" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Est. Annual Earnings
            </p>
            <p className="display text-3xl font-bold text-white tabular-nums" style={{ letterSpacing: '-0.04em' }}>
              {formatNaira(totalEarnings / 1600)}
            </p>
            <p className="text-white/60 text-xs mt-1">From {rentedCount} rented propert{rentedCount === 1 ? 'y' : 'ies'}</p>
          </motion.div>
        )}

        {/* Quick tools row */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: isVerified ? 'Verified ✓' : t('verify_identity'), icon: isVerified ? BadgeCheck : CheckCircle2, onClick: () => setShowVerification(true), color: isVerified ? 'var(--success)' : 'var(--accent)', active: isVerified },
            { label: t('maintenance'), icon: Home, onClick: () => setShowMaintenance(true), color: '#7c3aed' },
            { label: t('reviews'), icon: TrendingUp, onClick: () => setShowReviews(true), color: '#f59e0b' },
            { label: t('boost_listing').split(' ')[0], icon: BarChart3, onClick: () => listings.length > 0 ? setShowBoost(listings[0].id) : null, color: '#0e7490' },
          ].map(item => (
            <motion.button key={item.label} whileTap={{ scale: 0.93 }} onClick={item.onClick}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[10px] font-semibold"
              style={{ background: 'active' in item && item.active ? 'rgba(26,128,71,0.12)' : 'var(--glass-card)', backdropFilter: 'blur(24px)', border: `1px solid ${'active' in item && item.active ? 'var(--success)' : 'var(--glass-border)'}`, color: item.color }}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </motion.button>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {([
            { id: 'listings' as DashTab, label: 'My Properties', icon: Building2 },
            { id: 'whatsapp' as DashTab, label: 'WhatsApp', icon: MessageCircle },
            { id: 'stats' as DashTab, label: 'Insights', icon: BarChart3 },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setDashTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0"
              style={
                dashTab === tab.id
                  ? { background: 'var(--accent)', color: 'white', boxShadow: '0 2px 10px var(--accent-glow)' }
                  : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }
              }
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {dashTab === 'listings' && (
            <motion.div
              key="listings"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={springs.snappy}
            >
              {listings.length === 0 ? (
                <div
                  className="rounded-3xl p-10 flex flex-col items-center text-center"
                  style={{ background: 'var(--surface-muted)', border: '2px dashed var(--border)' }}
                >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'var(--accent-soft)' }}>
                    <Building2 className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>No properties yet</p>
                  <p className="text-xs mb-5 max-w-xs" style={{ color: 'var(--muted)' }}>
                    List your first property — tenants pay directly, zero agent.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setView('new-listing')}
                    className="px-6 py-3 rounded-2xl font-semibold text-white text-sm"
                    style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 4px 16px var(--accent-glow)' }}
                  >
                    List a Property
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-4">
                  {listings.map((l, i) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="rounded-3xl overflow-hidden"
                      style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}
                    >
                      {l.thumb ? (
                        <div className="h-32 overflow-hidden">
                          <img src={l.thumb} alt={l.location} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-24 relative overflow-hidden" style={{ background: l.color }}>
                          <div className="absolute inset-0 opacity-10"
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                        </div>
                      )}
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{l.location}</p>
                          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                            {l.rooms} bed · {formatNaira(l.rentNgn / 1600)}/yr
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                            style={{
                              background: l.status === 'active' ? 'var(--accent-soft)' : 'rgba(26,128,71,0.12)',
                              color: l.status === 'active' ? 'var(--accent)' : 'var(--success)',
                            }}
                          >
                            {l.status === 'active' ? 'Active' : 'Rented'}
                          </span>
                          <Eye className="w-4 h-4" style={{ color: 'var(--subtle)' }} />
                        </div>
                      </div>
                      {l.escrow && <LandlordEscrowPanel escrow={l.escrow} account={account} />}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {dashTab === 'whatsapp' && (
            <motion.div
              key="whatsapp"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={springs.snappy}
            >
              <WhatsAppInbox account={account} />
            </motion.div>
          )}

          {dashTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={springs.snappy}
              className="rounded-3xl p-5 space-y-4"
              style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}
            >
              <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Property Insights</h3>
              {listings.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>
                  Stats will appear once you list a property.
                </p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Total properties', value: String(listings.length) },
                    { label: 'Active listings', value: String(activeCount) },
                    { label: 'Properties rented', value: String(rentedCount) },
                    { label: 'Est. annual rent', value: formatNaira(listings.reduce((s, l) => s + l.rentNgn, 0) / 1600) },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-sm" style={{ color: 'var(--muted)' }}>{row.label}</span>
                      <span className="font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Feature modals */}
      <AnimatePresence>
        {showVerification && <LandlordVerification key="verif" account={account} onClose={() => setShowVerification(false)} />}
        {showBoost && (
          <ListingBoost key="boost"
            listingId={showBoost}
            listingTitle={listings.find(l => l.id === showBoost)?.location ?? 'Your property'}
            account={account}
            onClose={() => setShowBoost(null)} />
        )}
        {showMaintenance && <MaintenanceTracker key="maint" role="landlord" onClose={() => setShowMaintenance(false)} />}
        {showReviews && <TenantReviews key="reviews" landlordName="You" mode="view" onClose={() => setShowReviews(false)} />}
      </AnimatePresence>
    </div>
  );
}
