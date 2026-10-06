/**
 * BrowseListings — full tenant browsing experience.
 * 20+ Lagos areas + custom area · property type filter · furnishing
 * Favourites · WhatsApp contact · monthly/annual toggle
 * Inspection-first flow · map pin modal · full i18n
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, BedDouble, Search, Loader2, ShieldCheck,
  Zap, Droplets, Car, Shield, Wifi, Heart,
  MessageCircle, SlidersHorizontal, X, ChevronDown,
  BadgeCheck, Map, Share2, Bell, Gift,
} from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { formatNaira, formatUsdc } from '@/lib/naira';
import { LAGOS_AREAS, PROPERTY_TYPES, type PropertyType } from '@/lib/i18n';
import { useChainState, type ChainListing } from '@/lib/chain';
import { useLang } from '@/lib/LangContext';
import PropertyMap from '@/components/PropertyMap';
import InspectionFlow from '@/components/InspectionFlow';
import ShareListing from '@/components/ShareListing';
import SavedSearches from '@/components/SavedSearches';
import TenantReviews from '@/components/TenantReviews';
import ReferralSystem from '@/components/ReferralSystem';

const AMENITY_ICONS: Record<string, React.ElementType> = {
  Generator: Zap, Borehole: Droplets, Parking: Car, Security: Shield, Wifi,
};

const LISTING_COLORS = [
  'linear-gradient(135deg, #0a6638 0%, #14a85a 100%)',
  'linear-gradient(135deg, #1e6b9e 0%, #3b9edd 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
  'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  'linear-gradient(135deg, #0e7490 0%, #22d3ee 100%)',
  'linear-gradient(135deg, #be185d 0%, #f472b6 100%)',
];

export interface Listing {
  id: bigint;
  title: string;
  address: string;
  lat: number;
  lng: number;
  location: string;
  area: string;
  rooms: number;
  propertyType: PropertyType;
  furnishing: 'furnished' | 'unfurnished' | 'semi_furnished';
  rentUsdc: number;
  depositUsdc: number;
  active: boolean;
  desc: string;
  amenities: string[];
  color: string;
  verified?: boolean;
  landlordPhone?: string;
  /** Placeholder shown before anything is listed onchain — cannot be rented. */
  sample?: boolean;
}

const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };

function fromChain(l: ChainListing): Listing {
  const m = l.meta;
  const propertyType = (PROPERTY_TYPES as readonly string[]).includes(m.propertyType ?? '')
    ? (m.propertyType as PropertyType)
    : 'two_bed';
  const location = m.location || 'Lagos';
  const rooms = m.rooms ?? 1;
  return {
    id: l.id,
    title: `${rooms}-Bed in ${location}`,
    address: m.address || location,
    lat: m.lat ?? LAGOS_CENTER.lat,
    lng: m.lng ?? LAGOS_CENTER.lng,
    location,
    area: LAGOS_AREAS.find(a => location.toLowerCase().includes(a.toLowerCase())) ?? location,
    rooms,
    propertyType,
    furnishing: m.furnishing ?? 'unfurnished',
    rentUsdc: l.rentUsdc,
    depositUsdc: l.depositUsdc,
    active: l.active,
    desc: m.description ?? '',
    amenities: m.amenities ?? [],
    color: LISTING_COLORS[Number(l.id % BigInt(LISTING_COLORS.length))],
  };
}

const DEMO_LISTINGS: Listing[] = [
  {
    id: 1n, title: 'Modern 2-Bed Flat',
    address: '14 Admiralty Way, Lekki Phase 1, Lagos', lat: 6.4281, lng: 3.4219,
    location: 'Lekki Phase 1', area: 'Lekki Phase 1',
    rooms: 2, propertyType: 'two_bed', furnishing: 'semi_furnished',
    rentUsdc: 150, depositUsdc: 150, active: true,
    desc: 'Modern 2-bed flat, 24hr security, parking, generator. Marble finish throughout. Very clean and spacious.',
    amenities: ['Generator', 'Security', 'Parking'],
    color: LISTING_COLORS[0], verified: true, landlordPhone: '+2348012345678',
  },
  {
    id: 2n, title: 'Self-Contain Mini-Flat',
    address: '7 Herbert Macaulay Way, Yaba, Lagos', lat: 6.5158, lng: 3.3792,
    location: 'Yaba', area: 'Yaba',
    rooms: 1, propertyType: 'self_contain', furnishing: 'unfurnished',
    rentUsdc: 80, depositUsdc: 80, active: true,
    desc: 'Self-contain mini-flat, close to UNILAG, tiled floors. Quiet street. Constant borehole water.',
    amenities: ['Borehole', 'Wifi'],
    color: LISTING_COLORS[1], landlordPhone: '+2348023456789',
  },
  {
    id: 3n, title: 'Spacious 3-Bed Duplex',
    address: '22 Ozumba Mbadiwe Avenue, Victoria Island, Lagos', lat: 6.4281, lng: 3.4204,
    location: 'Victoria Island', area: 'Victoria Island (VI)',
    rooms: 3, propertyType: 'duplex', furnishing: 'furnished',
    rentUsdc: 250, depositUsdc: 250, active: true,
    desc: 'Spacious 3-bed duplex, ensuite, ocean breeze. Serviced and fully furnished. BQ included.',
    amenities: ['Generator', 'Security', 'Parking', 'Wifi'],
    color: LISTING_COLORS[2], verified: true, landlordPhone: '+2348034567890',
  },
  {
    id: 4n, title: 'Neat Single Room',
    address: '5 Adeniran Ogunsanya Street, Surulere, Lagos', lat: 6.4969, lng: 3.3534,
    location: 'Surulere', area: 'Surulere',
    rooms: 1, propertyType: 'single_room', furnishing: 'unfurnished',
    rentUsdc: 60, depositUsdc: 60, active: true,
    desc: 'Neat room in a well-maintained compound. Shared facilities. Safe and quiet area.',
    amenities: ['Borehole'],
    color: LISTING_COLORS[3], landlordPhone: '+2348045678901',
  },
  {
    id: 5n, title: '3-Bed Bungalow GRA',
    address: 'Obafemi Awolowo Way, Ikeja GRA, Lagos', lat: 6.6018, lng: 3.3515,
    location: 'Ikeja GRA', area: 'Ikeja GRA',
    rooms: 3, propertyType: 'bungalow', furnishing: 'semi_furnished',
    rentUsdc: 200, depositUsdc: 200, active: true,
    desc: '3-bed bungalow in a secure estate. 24hr power, swimming pool, staff quarters.',
    amenities: ['Generator', 'Security', 'Parking', 'Borehole'],
    color: LISTING_COLORS[4], verified: true, landlordPhone: '+2348056789012',
  },
  {
    id: 6n, title: 'Mini Flat — Ikorodu',
    address: 'Garage Road, Ikorodu, Lagos', lat: 6.6194, lng: 3.5061,
    location: 'Ikorodu', area: 'Ikorodu',
    rooms: 1, propertyType: 'mini_flat', furnishing: 'unfurnished',
    rentUsdc: 35, depositUsdc: 35, active: true,
    desc: 'Clean mini flat in Ikorodu. Close to market and bus park. Good for working class.',
    amenities: ['Borehole'],
    color: LISTING_COLORS[5], landlordPhone: '+2348067890123',
  },
  {
    id: 7n, title: '2-Bed Flat — Ajah',
    address: 'Abraham Adesanya Estate, Ajah, Lagos', lat: 6.4693, lng: 3.5726,
    location: 'Ajah', area: 'Ajah',
    rooms: 2, propertyType: 'two_bed', furnishing: 'unfurnished',
    rentUsdc: 110, depositUsdc: 110, active: true,
    desc: 'Newly built 2-bed flat in Abraham Adesanya. Tiled, POP ceiling, pre-paid meter.',
    amenities: ['Generator', 'Borehole', 'Security'],
    color: LISTING_COLORS[0], landlordPhone: '+2348078901234',
  },
  {
    id: 8n, title: 'Penthouse — Ikoyi',
    address: '3 Bourdillon Road, Ikoyi, Lagos', lat: 6.4550, lng: 3.4381,
    location: 'Ikoyi', area: 'Ikoyi',
    rooms: 4, propertyType: 'penthouse', furnishing: 'furnished',
    rentUsdc: 500, depositUsdc: 500, active: true,
    desc: 'Luxury penthouse with rooftop terrace. 4 beds, 4 baths, modern kitchen, ocean view.',
    amenities: ['Generator', 'Security', 'Parking', 'Wifi'],
    color: LISTING_COLORS[2], verified: true, landlordPhone: '+2348089012345',
  },
];

interface Props { account: SmartAccount; }


export default function BrowseListings({ account }: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all_areas');
  const [customArea, setCustomArea] = useState('');
  const [showCustomArea, setShowCustomArea] = useState(false);
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>('all');
  const [furnishing, setFurnishing] = useState<'all' | 'furnished' | 'unfurnished' | 'semi_furnished'>('all');
  const [priceMode, setPriceMode] = useState<'monthly' | 'yearly'>('yearly');
  const [showFilters, setShowFilters] = useState(false);
  const [saved, setSaved] = useState<Set<bigint>>(new Set());
  const [mapListing, setMapListing] = useState<Listing | null>(null);
  const [flowListing, setFlowListing] = useState<Listing | null>(null);
  const [shareListing, setShareListing] = useState<Listing | null>(null);
  const [reviewListing, setReviewListing] = useState<Listing | null>(null);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [_paying, _setPaying] = useState<bigint | null>(null);
  const chain = useChainState();

  // Onchain listings that are live and not already rented; samples only until the first real listing exists.
  const listings = useMemo(() => {
    const live = (chain.data?.listings ?? []).filter(l => l.active && l.escrowId === 0n).map(fromChain);
    return live.length > 0 || !chain.isSuccess ? live : DEMO_LISTINGS.map(l => ({ ...l, sample: true }));
  }, [chain.data, chain.isSuccess]);

  const activeArea = showCustomArea && customArea.trim() ? customArea.trim() : area;

  const filtered = listings.filter(l => {
    const matchArea = activeArea === 'all_areas' || l.area === activeArea ||
      (showCustomArea && customArea.trim() &&
        l.area.toLowerCase().includes(customArea.toLowerCase()) ||
        l.location.toLowerCase().includes(customArea.toLowerCase()));
    const matchType = propertyType === 'all' || l.propertyType === propertyType;
    const matchFurnish = furnishing === 'all' || l.furnishing === furnishing;
    const matchQ = !query ||
      l.address.toLowerCase().includes(query.toLowerCase()) ||
      l.location.toLowerCase().includes(query.toLowerCase()) ||
      l.title.toLowerCase().includes(query.toLowerCase()) ||
      l.desc.toLowerCase().includes(query.toLowerCase());
    return matchArea && matchType && matchFurnish && matchQ;
  });

  function toggleSave(id: bigint) {
    setSaved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function contactLandlord(listing: Listing) {
    const msg = encodeURIComponent(
      `Hello, I am interested in your property: "${listing.title}" at ${listing.address}. ` +
      `I found it on RentFlow. Can we arrange an inspection?`
    );
    const phone = (listing.landlordPhone ?? '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  }

  function formatPrice(usdcPerYear: number) {
    return priceMode === 'monthly'
      ? `${formatNaira(usdcPerYear / 12)}${t('per_month')}`
      : `${formatNaira(usdcPerYear)}${t('per_year')}`;
  }

  const activeFilters = [
    propertyType !== 'all',
    furnishing !== 'all',
    area !== 'all_areas' || (showCustomArea && !!customArea.trim()),
  ].filter(Boolean).length;

  return (
    <div className="pb-28">

      {/* ── Sticky search + filter bar ── */}
      <div className="sticky top-[57px] z-30 px-4 pt-3 pb-3 space-y-2.5"
        style={{ background: 'var(--glass-card)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>

        {/* Search row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--subtle)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }} />
            {query && (
              <button onClick={() => setQuery('')}>
                <X className="w-3.5 h-3.5" style={{ color: 'var(--subtle)' }} />
              </button>
            )}
          </div>
          {/* Filters toggle */}
          <motion.button whileTap={{ scale: 0.93 }}
            onClick={() => setShowFilters(f => !f)}
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: showFilters || activeFilters > 0 ? 'var(--accent)' : 'var(--surface-muted)',
              border: '1px solid var(--border)',
            }}>
            <SlidersHorizontal className="w-4 h-4" style={{ color: showFilters || activeFilters > 0 ? 'white' : 'var(--subtle)' }} />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                style={{ background: '#ef4444' }}>
                {activeFilters}
              </span>
            )}
          </motion.button>
        </div>

        {/* Price mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {(['yearly', 'monthly'] as const).map(mode => (
              <button key={mode}
                onClick={() => setPriceMode(mode)}
                className="px-3 py-1.5 text-xs font-semibold transition-all"
                style={priceMode === mode
                  ? { background: 'var(--accent)', color: 'white' }
                  : { background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                {mode === 'yearly' ? t('yearly_label') : t('monthly_label')}
              </button>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            {filtered.length} {filtered.length === 1 ? 'property' : 'properties'}
          </span>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-3">

              {/* Area chips */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
                  {t('area_label')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button onClick={() => { setArea('all_areas'); setShowCustomArea(false); }}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={area === 'all_areas' && !showCustomArea
                      ? { background: 'var(--accent)', color: 'white' }
                      : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {t('all_areas')}
                  </button>
                  {/* Popular areas shortcut */}
                  {['Lekki Phase 1', 'Yaba', 'Victoria Island (VI)', 'Ikeja', 'Ikorodu', 'Ajah', 'Surulere', 'Ikoyi', 'Magodo', 'Gbagada'].map(a => (
                    <button key={a} onClick={() => { setArea(a); setShowCustomArea(false); }}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={area === a && !showCustomArea
                        ? { background: 'var(--accent)', color: 'white' }
                        : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {a}
                    </button>
                  ))}
                  {/* More areas dropdown */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowCustomArea(c => !c)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={showCustomArea
                        ? { background: 'var(--accent)', color: 'white' }
                        : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      More <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Custom area input */}
                {showCustomArea && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                    <input value={customArea} onChange={e => setCustomArea(e.target.value)}
                      placeholder={t('custom_area_placeholder')}
                      className="w-full px-3.5 py-2.5 rounded-2xl text-sm outline-none"
                      style={{ background: 'var(--surface-strong)', border: '1px solid var(--accent)', color: 'var(--ink)' }} />
                    {/* Suggestions from LAGOS_AREAS */}
                    {customArea.trim().length > 1 && (
                      <div className="mt-1 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--glass-card)' }}>
                        {LAGOS_AREAS
                          .filter(a => a.toLowerCase().includes(customArea.toLowerCase()))
                          .slice(0, 6)
                          .map(a => (
                            <button key={a} onClick={() => { setCustomArea(a); setArea(a); }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--accent-soft)] transition-colors"
                              style={{ color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}>
                              {a}
                            </button>
                          ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Property type */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
                  {t('property_type_label')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button onClick={() => setPropertyType('all')}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={propertyType === 'all'
                      ? { background: 'var(--accent)', color: 'white' }
                      : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {t('all_types')}
                  </button>
                  {PROPERTY_TYPES.map(pt => (
                    <button key={pt} onClick={() => setPropertyType(pt)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={propertyType === pt
                        ? { background: 'var(--accent)', color: 'white' }
                        : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {t(pt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Furnishing */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
                  {t('furnishing_label')}
                </p>
                <div className="flex gap-2">
                  {(['all', 'furnished', 'unfurnished', 'semi_furnished'] as const).map(f => (
                    <button key={f} onClick={() => setFurnishing(f)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={furnishing === f
                        ? { background: 'var(--accent)', color: 'white' }
                        : { background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {f === 'all' ? t('all_types') : t(f)}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Hero banner ── */}
      <div className="px-4 pt-4 pb-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)' }}>
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="absolute -right-4 bottom-2 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <p className="text-white text-[10px] font-semibold mb-1 opacity-70" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Lagos Housing
          </p>
          <h2 className="display text-white text-2xl font-bold mb-1" style={{ letterSpacing: '-0.03em' }}>{t('no_agent')}</h2>
          <p className="text-white text-sm opacity-80 max-w-xs">{t('inspection_note')}</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">{listings.length} {listings[0]?.sample ? 'sample ' : ''}properties</span>
            <span className="text-[10px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">Gasless payments</span>
            <span className="text-[10px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">20+ areas</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setShowSavedSearches(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors">
              <Bell className="w-3 h-3" /> {t('saved_searches')}
            </button>
            <button onClick={() => setShowReferral(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors">
              <Gift className="w-3 h-3" /> {t('refer_friend')}
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Listings ── */}
      <div className="px-4 pt-2 space-y-4">
        <AnimatePresence>
          {filtered.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-16 space-y-3">
              <p className="text-3xl">🏠</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No properties found</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Try a different area or clear filters
              </p>
              <button onClick={() => { setArea('all_areas'); setPropertyType('all'); setFurnishing('all'); setQuery(''); setCustomArea(''); }}
                className="text-xs font-semibold px-4 py-2 rounded-xl"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                Clear all filters
              </button>
            </motion.div>
          )}

          {filtered.map((listing, i) => (
            <motion.div key={String(listing.id)}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="rounded-3xl overflow-hidden"
              style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}>

              {/* Photo placeholder with color gradient */}
              <div className="h-40 relative overflow-hidden" style={{ background: listing.color }}>
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)', backgroundSize: '24px 24px' }} />

                {/* Top badges */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  {listing.sample && (
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-black/60 text-white">
                      Sample
                    </span>
                  )}
                  {listing.verified && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-white/90 text-green-700">
                      <BadgeCheck className="w-3 h-3" /> {t('verified_landlord')}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white/90 text-gray-700">
                    {t(listing.propertyType)}
                  </span>
                </div>

                {/* Furnishing badge */}
                <div className="absolute top-3 right-3">
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white/90 text-gray-700">
                    {t(listing.furnishing)}
                  </span>
                </div>

                {/* Save button */}
                <motion.button whileTap={{ scale: 0.88 }}
                  onClick={() => toggleSave(listing.id)}
                  className="absolute top-12 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <Heart className="w-4 h-4"
                    style={{ color: saved.has(listing.id) ? '#ef4444' : 'white', fill: saved.has(listing.id) ? '#ef4444' : 'none' }} />
                </motion.button>

                {/* Bottom info bar */}
                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }}>
                  <div className="flex items-center gap-1.5 text-white">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-semibold truncate max-w-[160px]">{listing.location}</span>
                  </div>
                  <div className="text-white text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
                    <BedDouble className="w-3 h-3 inline mr-1" />
                    {listing.rooms} bed
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Title + price row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--ink)' }}>{listing.title}</p>
                    <p className="display text-xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                      {formatPrice(listing.rentUsdc)}
                    </p>
                    <p className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
                      {formatUsdc(listing.rentUsdc)} USDC
                      {priceMode === 'yearly' && ` · ${formatNaira(listing.rentUsdc / 12)}${t('per_month')}`}
                    </p>
                  </div>
                  {/* Amenity icons */}
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-[80px]">
                    {listing.amenities.slice(0, 3).map(a => {
                      const Icon = AMENITY_ICONS[a];
                      return Icon ? (
                        <div key={a} className="w-7 h-7 rounded-xl flex items-center justify-center"
                          style={{ background: 'var(--accent-soft)' }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs mb-3 leading-relaxed line-clamp-2" style={{ color: 'var(--ink-2)' }}>
                  {listing.desc}
                </p>

                {/* Deposit info */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl mb-3 text-xs"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('security_deposit')} {formatNaira(listing.depositUsdc)} — smart contract escrow</span>
                </div>

                {/* Inspection note */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl mb-3 text-xs"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#92400e' }}>
                  <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('inspection_note')}</span>
                </div>

                {/* Action buttons — row 1 */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Map */}
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => setMapListing(listing)}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl text-xs font-semibold"
                    style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <Map className="w-3.5 h-3.5" />
                    Map
                  </motion.button>

                  {/* WhatsApp contact */}
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => contactLandlord(listing)}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl text-xs font-semibold"
                    style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
                    <MessageCircle className="w-3.5 h-3.5" />
                    Chat
                  </motion.button>

                  {/* Share */}
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => setShareListing(listing)}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl text-xs font-semibold"
                    style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <Share2 className="w-3.5 h-3.5" />
                    {t('share_listing').split(' ')[0]}
                  </motion.button>

                  {/* Book inspection */}
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => setFlowListing(listing)}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 2px 10px var(--accent-glow)' }}>
                    {_paying === listing.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <BadgeCheck className="w-3.5 h-3.5" />}
                    Inspect
                  </motion.button>
                </div>

                {/* Rate landlord row */}
                <button onClick={() => setReviewListing(listing)}
                  className="w-full mt-2 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  ★ {t('rate_landlord')}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Map modal ── */}
      <AnimatePresence>
        {mapListing && (
          <PropertyMap key="map-modal"
            address={mapListing.address}
            lat={mapListing.lat} lng={mapListing.lng}
            title={mapListing.title}
            onClose={() => setMapListing(null)} />
        )}
      </AnimatePresence>

      {/* ── Inspection / payment flow ── */}
      <AnimatePresence>
        {flowListing && (
          <InspectionFlow key="flow-modal" listing={flowListing} account={account}
            onClose={() => setFlowListing(null)} />
        )}
      </AnimatePresence>

      {/* ── Share listing ── */}
      <AnimatePresence>
        {shareListing && (
          <ShareListing key="share-modal" listing={shareListing} onClose={() => setShareListing(null)} />
        )}
      </AnimatePresence>

      {/* ── Tenant reviews ── */}
      <AnimatePresence>
        {reviewListing && (
          <TenantReviews key="review-modal"
            landlordName={reviewListing.title}
            mode="view"
            onClose={() => setReviewListing(null)} />
        )}
      </AnimatePresence>

      {/* ── Saved searches ── */}
      <AnimatePresence>
        {showSavedSearches && (
          <SavedSearches key="saved-searches" onClose={() => setShowSavedSearches(false)} />
        )}
      </AnimatePresence>

      {/* ── Referral system ── */}
      <AnimatePresence>
        {showReferral && (
          <ReferralSystem key="referral"
            address={account.address}
            onClose={() => setShowReferral(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
