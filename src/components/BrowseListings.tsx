/**
 * BrowseListings — tenant home: search, filters and a responsive grid of photo-first listings.
 * Live listings come from the escrow contract; sample listings only show until the first real one exists.
 * Every listing states whether its landlord is identity-verified (onchain).
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X, Bell, Gift, Loader2 } from 'lucide-react';
import type { SmartAccount } from 'viem/account-abstraction';
import { LAGOS_AREAS, PROPERTY_TYPES, type PropertyType } from '@/lib/i18n';
import { useLang } from '@/lib/LangContext';
import { nairaToUsdc } from '@/lib/naira';
import { useChainState, useHiddenListings, type ChainListing } from '@/lib/chain';
import PropertyMap from '@/components/PropertyMap';
import ErrorBoundary from '@/components/ErrorBoundary';
import InspectionFlow from '@/components/InspectionFlow';
import ShareListing from '@/components/ShareListing';
import SavedSearches from '@/components/SavedSearches';
import TenantReviews from '@/components/TenantReviews';
import ReferralSystem from '@/components/ReferralSystem';
import ListingCard from '@/components/ListingCard';
import ListingDetail from '@/components/ListingDetail';

type Furnishing = 'furnished' | 'unfurnished' | 'semi_furnished';

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
  furnishing: Furnishing;
  rentUsdc: number;
  depositUsdc: number;
  active: boolean;
  desc: string;
  amenities: string[];
  /** Neutral accent used by share cards and the payment flow header. */
  color: string;
  media: { type: 'image' | 'video'; url: string }[];
  /** Unix ms when the landlord was identity-verified onchain (0 = not verified). */
  verifiedAt: number;
  landlord?: string;
  landlordPhone?: string;
  /** Placeholder shown before anything is listed onchain — cannot be rented. */
  sample?: boolean;
}

const NEUTRAL = 'linear-gradient(135deg, #2a332e 0%, #46524b 100%)';
const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };
const QUICK_AREAS = ['Lekki Phase 1', 'Yaba', 'Victoria Island (VI)', 'Ikeja', 'Surulere', 'Ajah', 'Ikoyi', 'Ikorodu', 'Gbagada', 'Magodo'];

function fromChain(l: ChainListing): Listing {
  const m = l.meta;
  const propertyType = (PROPERTY_TYPES as readonly string[]).includes(m.propertyType ?? '')
    ? (m.propertyType as PropertyType)
    : 'two_bed';
  const location = m.location || 'Lagos';
  const rooms = m.rooms ?? 1;
  return {
    id: l.id,
    title: `${rooms}-bedroom in ${location}`,
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
    color: NEUTRAL,
    media: (m.media ?? []).filter(x => typeof x?.url === 'string' && (x.type === 'image' || x.type === 'video')),
    verifiedAt: l.landlordVerifiedAt,
    landlord: l.landlord,
    landlordPhone: m.phone,
  };
}

const px = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
const photos = (...ids: number[]) => ids.map(id => ({ type: 'image' as const, url: px(id) }));

/** Illustrative listings (Pexels photos, realistic 2026 Lagos rents). Never rentable, never "verified". */
const SAMPLE_LISTINGS: Listing[] = ([
  { id: 1n, title: 'Bright 2-bedroom flat', address: 'Admiralty Way, Lekki Phase 1', location: 'Lekki Phase 1', area: 'Lekki Phase 1',
    rooms: 2, propertyType: 'two_bed', furnishing: 'semi_furnished', rentUsdc: nairaToUsdc(4_500_000), depositUsdc: nairaToUsdc(450_000),
    desc: 'Serviced 2-bedroom flat in a gated estate. 24-hour security, generator, parking for two cars.', amenities: ['Generator', 'Security', 'Parking'],
    media: photos(2462015, 6527029, 271624) },
  { id: 2n, title: 'Self-contain near UNILAG', address: 'Herbert Macaulay Way, Yaba', location: 'Yaba', area: 'Yaba',
    rooms: 1, propertyType: 'self_contain', furnishing: 'unfurnished', rentUsdc: nairaToUsdc(900_000), depositUsdc: nairaToUsdc(90_000),
    desc: 'Quiet street, tiled floors, constant borehole water. Five minutes to UNILAG and the Yaba tech hub.', amenities: ['Borehole', 'Prepaid meter'],
    media: photos(2079249, 6180674) },
  { id: 3n, title: '4-bedroom duplex with BQ', address: 'Ozumba Mbadiwe Avenue, Victoria Island', location: 'Victoria Island', area: 'Victoria Island (VI)',
    rooms: 4, propertyType: 'duplex', furnishing: 'furnished', rentUsdc: nairaToUsdc(15_000_000), depositUsdc: nairaToUsdc(1_500_000),
    desc: 'Fully furnished duplex with boys\' quarters, ensuite rooms and a fitted kitchen.', amenities: ['Generator', 'Security', 'Parking', 'BQ'],
    media: photos(323780, 1571460, 3935350) },
  { id: 4n, title: 'Clean room and parlour', address: 'Adeniran Ogunsanya Street, Surulere', location: 'Surulere', area: 'Surulere',
    rooms: 1, propertyType: 'single_room', furnishing: 'unfurnished', rentUsdc: nairaToUsdc(350_000), depositUsdc: nairaToUsdc(35_000),
    desc: 'Well-kept compound with shared facilities. Close to the National Stadium and bus stops.', amenities: ['Borehole'],
    media: photos(6934189) },
  { id: 5n, title: '3-bedroom bungalow, GRA', address: 'Obafemi Awolowo Way, Ikeja GRA', location: 'Ikeja GRA', area: 'Ikeja GRA',
    rooms: 3, propertyType: 'bungalow', furnishing: 'semi_furnished', rentUsdc: nairaToUsdc(8_000_000), depositUsdc: nairaToUsdc(800_000),
    desc: 'Detached bungalow in a secure estate with a large compound and staff quarters.', amenities: ['Generator', 'Security', 'Parking', 'Borehole'],
    media: photos(1918291, 1643383) },
  { id: 6n, title: 'Mini flat by the market', address: 'Garage Road, Ikorodu', location: 'Ikorodu', area: 'Ikorodu',
    rooms: 1, propertyType: 'mini_flat', furnishing: 'unfurnished', rentUsdc: nairaToUsdc(450_000), depositUsdc: nairaToUsdc(45_000),
    desc: 'New mini flat close to the market and bus park. Good for working professionals.', amenities: ['Borehole'],
    media: photos(5997967) },
  { id: 7n, title: 'New 2-bedroom, Abraham Adesanya', address: 'Abraham Adesanya Estate, Ajah', location: 'Ajah', area: 'Ajah',
    rooms: 2, propertyType: 'two_bed', furnishing: 'unfurnished', rentUsdc: nairaToUsdc(2_500_000), depositUsdc: nairaToUsdc(250_000),
    desc: 'Newly built, POP ceiling, tiled throughout, prepaid meter.', amenities: ['Generator', 'Borehole', 'Security'],
    media: photos(4857757, 6312353) },
  { id: 8n, title: 'Penthouse with lagoon view', address: 'Bourdillon Road, Ikoyi', location: 'Ikoyi', area: 'Ikoyi',
    rooms: 4, propertyType: 'penthouse', furnishing: 'furnished', rentUsdc: nairaToUsdc(35_000_000), depositUsdc: nairaToUsdc(3_500_000),
    desc: 'Four ensuite bedrooms, rooftop terrace, gym and pool in the building.', amenities: ['Generator', 'Security', 'Parking', 'Gym', 'Pool'],
    media: photos(1457842, 1571460, 3935350) },
] as const).map(l => ({
  ...l, amenities: [...l.amenities], media: [...l.media],
  lat: LAGOS_CENTER.lat, lng: LAGOS_CENTER.lng, active: true, color: NEUTRAL, verifiedAt: 0, sample: true,
}));

interface Props { account: SmartAccount; }

export default function BrowseListings({ account }: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all_areas');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>('all');
  const [furnishing, setFurnishing] = useState<Furnishing | 'all'>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [priceMode, setPriceMode] = useState<'monthly' | 'yearly'>('yearly');
  const [showFilters, setShowFilters] = useState(false);
  const [saved, setSaved] = useState<Set<bigint>>(new Set());
  const [detail, setDetail] = useState<Listing | null>(null);
  const [mapListing, setMapListing] = useState<Listing | null>(null);
  const [flowListing, setFlowListing] = useState<Listing | null>(null);
  const [shareListing, setShareListing] = useState<Listing | null>(null);
  const [reviewListing, setReviewListing] = useState<Listing | null>(null);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const chain = useChainState();
  const hidden = useHiddenListings().data;

  // Live listings that aren't rented yet; samples only until the first real listing exists.
  const listings = useMemo(() => {
    const live = (chain.data?.listings ?? [])
      .filter(l => l.active && l.escrowId === 0n && !hidden?.has(String(l.id)))
      .map(fromChain).reverse();
    return live.length > 0 || !chain.isSuccess ? live : SAMPLE_LISTINGS;
  }, [chain.data, chain.isSuccess, hidden]);
  const showingSamples = listings[0]?.sample ?? false;

  const filtered = listings.filter(l => {
    const q = query.trim().toLowerCase();
    const matchArea = area === 'all_areas' || l.area === area || l.location.toLowerCase().includes(area.toLowerCase());
    const matchType = propertyType === 'all' || l.propertyType === propertyType;
    const matchFurnish = furnishing === 'all' || l.furnishing === furnishing;
    const matchVerified = !verifiedOnly || l.verifiedAt > 0;
    const matchQ = !q || [l.address, l.location, l.title, l.desc].some(s => s.toLowerCase().includes(q));
    return matchArea && matchType && matchFurnish && matchVerified && matchQ;
  });

  const activeFilters = [propertyType !== 'all', furnishing !== 'all', verifiedOnly].filter(Boolean).length;

  function toggleSave(id: bigint) {
    setSaved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setArea('all_areas'); setPropertyType('all'); setFurnishing('all'); setVerifiedOnly(false); setQuery('');
  }

  const chip = (active: boolean) => active
    ? { background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)' }
    : { background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' };

  const priceToggle = (className: string) => (
    <div className={`rounded-xl overflow-hidden shrink-0 ${className}`} style={{ border: '1px solid var(--border)' }}>
      {(['yearly', 'monthly'] as const).map(m => (
        <button key={m} onClick={() => setPriceMode(m)} className="flex-1 px-3.5 h-11 text-sm font-medium whitespace-nowrap"
          style={priceMode === m ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--surface)', color: 'var(--muted)' }}>
          {m === 'yearly' ? 'Per year' : 'Per month'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="pb-28">
      {/* ── Search + filters (solid, sticky) ── */}
      <div className="sticky top-[57px] z-30" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-2 px-3.5 h-11 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--subtle)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search_placeholder')}
                className="flex-1 min-w-0 text-sm bg-transparent outline-none" style={{ color: 'var(--ink)' }} />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X className="w-4 h-4" style={{ color: 'var(--subtle)' }} /></button>}
            </label>
            <button onClick={() => setShowFilters(f => !f)} aria-expanded={showFilters}
              className="flex items-center gap-2 px-3.5 h-11 rounded-xl text-sm font-medium shrink-0"
              style={chip(showFilters)}>
              <SlidersHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && (
                <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--accent)', color: 'white' }}>{activeFilters}</span>
              )}
            </button>
            {priceToggle('hidden sm:flex')}
          </div>

          {/* Quick areas */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {['all_areas', ...QUICK_AREAS].map(a => (
              <button key={a} onClick={() => setArea(a)} className="shrink-0 px-3.5 py-1.5 rounded-full text-sm" style={chip(area === a)}>
                {a === 'all_areas' ? t('all_areas') : a}
              </button>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden">
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr] pt-1 pb-2">
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>{t('property_type_label')}</p>
                    <div className="flex flex-wrap gap-2">
                      {(['all', ...PROPERTY_TYPES] as const).map(pt => (
                        <button key={pt} onClick={() => setPropertyType(pt)} className="px-3 py-1.5 rounded-full text-sm" style={chip(propertyType === pt)}>
                          {pt === 'all' ? t('all_types') : t(pt)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>{t('furnishing_label')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(['all', 'furnished', 'semi_furnished', 'unfurnished'] as const).map(f => (
                          <button key={f} onClick={() => setFurnishing(f)} className="px-3 py-1.5 rounded-full text-sm" style={chip(furnishing === f)}>
                            {f === 'all' ? t('all_types') : t(f)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                      <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                      Verified landlords only
                    </label>
                    {priceToggle('flex sm:hidden')}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        {/* ── Heading ── */}
        <div className="flex flex-wrap items-end justify-between gap-3 pt-6 pb-5">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Homes in Lagos, straight from landlords
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {chain.isLoading ? 'Loading listings…' : `${filtered.length} ${showingSamples ? 'sample ' : ''}${filtered.length === 1 ? 'home' : 'homes'}`}
              {' · '}no agent fees · rent held in escrow until you move in
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSavedSearches(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
              <Bell className="w-4 h-4" /> {t('saved_searches')}
            </button>
            <button onClick={() => setShowReferral(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
              <Gift className="w-4 h-4" /> {t('refer_friend')}
            </button>
          </div>
        </div>

        {showingSamples && (
          <p className="text-sm mb-5 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
            No homes are listed yet, so these are <b>sample listings</b> to show how RentFlow works. They can't be rented.
          </p>
        )}

        {/* ── Grid ── */}
        {chain.isLoading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--subtle)' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>No homes match these filters</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Try another area, or clear the filters.</p>
            <button onClick={clearFilters} className="text-sm font-semibold px-4 py-2 rounded-xl" style={{ background: 'var(--accent)', color: 'white' }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(listing => (
              <ListingCard key={String(listing.id)} listing={listing} priceMode={priceMode}
                saved={saved.has(listing.id)} onToggleSave={() => toggleSave(listing.id)}
                onOpen={() => setDetail(listing)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {detail && (
          <ListingDetail key="detail" listing={detail}
            saved={saved.has(detail.id)} onToggleSave={() => toggleSave(detail.id)}
            onClose={() => setDetail(null)}
            onRent={() => { setFlowListing(detail); setDetail(null); }}
            onMap={() => setMapListing(detail)}
            onShare={() => setShareListing(detail)}
            onReviews={() => setReviewListing(detail)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mapListing && (
          <ErrorBoundary key="map-modal" inline onReset={() => setMapListing(null)}>
            <PropertyMap address={mapListing.address} lat={mapListing.lat} lng={mapListing.lng}
              title={mapListing.title} onClose={() => setMapListing(null)} />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flowListing && <InspectionFlow key="flow-modal" listing={flowListing} account={account} onClose={() => setFlowListing(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {shareListing && <ShareListing key="share-modal" listing={shareListing} onClose={() => setShareListing(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {reviewListing && <TenantReviews key="review-modal" landlordName={reviewListing.title} mode="view" onClose={() => setReviewListing(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showSavedSearches && <SavedSearches key="saved-searches" onClose={() => setShowSavedSearches(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showReferral && <ReferralSystem key="referral" address={account.address} onClose={() => setShowReferral(false)} />}
      </AnimatePresence>
    </div>
  );
}
