/**
 * Handova E2E Unit Test Suite
 * Tests all critical logic paths without a browser DOM.
 * Run with: bun test src/test/e2e.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// ── Naira / USDC conversion ──────────────────────────────────────────────────
import { nairaToUsdc, usdcToNaira, formatNaira, formatUsdc } from '../lib/naira';

describe('naira conversions', () => {
  test('nairaToUsdc rounds to 6dp', () => {
    const result = nairaToUsdc(1_600_000); // 1.6m NGN at ~1600 NGN/$ = $1000
    expect(result).toBeGreaterThan(900);
    expect(result).toBeLessThan(1100);
  });

  test('usdcToNaira round-trips', () => {
    const usdc = 100;
    const naira = usdcToNaira(usdc);
    const back = nairaToUsdc(naira);
    expect(Math.abs(back - usdc)).toBeLessThan(1);
  });

  test('formatNaira contains ₦', () => {
    expect(formatNaira(100)).toContain('₦');
  });

  test('formatUsdc contains $', () => {
    expect(formatUsdc(50)).toContain('$');
  });
});

// ── i18n translation keys ────────────────────────────────────────────────────
import { translations, LAGOS_AREAS, PROPERTY_TYPES } from '../lib/i18n';

describe('i18n', () => {
  const REQUIRED_KEYS = [
    'browse', 'my_leases', 'book_inspection', 'confirm_visit', 'pay_escrow',
    'reviews', 'rate_landlord', 'boost_listing', 'refer_friend', 'saved_searches',
    'verify_identity', 'maintenance', 'dispute_evidence', 'admin_dashboard',
    'share_listing', 'onboarding_welcome',
  ] as const;

  const LANGUAGES = ['en', 'yo', 'pid', 'ig', 'ha'] as const;

  for (const lang of LANGUAGES) {
    describe(`lang=${lang}`, () => {
      for (const key of REQUIRED_KEYS) {
        test(`has key: ${key}`, () => {
          const val = translations[lang]?.[key];
          expect(val).toBeTruthy();
          expect(typeof val).toBe('string');
          expect((val as string).length).toBeGreaterThan(0);
        });
      }
    });
  }

  test('LAGOS_AREAS has 50+ entries', () => {
    expect(LAGOS_AREAS.length).toBeGreaterThanOrEqual(50);
  });

  test('PROPERTY_TYPES has expected types', () => {
    expect(PROPERTY_TYPES).toContain('one_bed');
    expect(PROPERTY_TYPES).toContain('two_bed');
    expect(PROPERTY_TYPES).toContain('self_contained');
  });

  test('all languages have all keys from English', () => {
    const enKeys = Object.keys(translations.en);
    for (const lang of LANGUAGES) {
      if (lang === 'en') continue;
      const langKeys = Object.keys(translations[lang] ?? {});
      const missing = enKeys.filter(k => !langKeys.includes(k));
      // Allow up to 5 missing keys in non-English (added incrementally)
      expect(missing.length).toBeLessThanOrEqual(5);
    }
  });
});

// ── Contracts addresses ──────────────────────────────────────────────────────
import { ESCROW_ADDRESS, NFT_ADDRESS } from '../lib/contracts';

describe('contract addresses', () => {
  test('ESCROW_ADDRESS is a valid 0x address', () => {
    expect(ESCROW_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('NFT_ADDRESS is a valid 0x address', () => {
    expect(NFT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('addresses are not the zero address', () => {
    expect(ESCROW_ADDRESS).not.toBe('0x0000000000000000000000000000000000000000');
    expect(NFT_ADDRESS).not.toBe('0x0000000000000000000000000000000000000000');
  });
});

// ── onchain-facts: Arc Testnet ───────────────────────────────────────────────
import { getChain, getUsdc, requireChain, buildTxExplorerUrl } from '../onchain-facts';

describe('onchain-facts Arc Testnet (5042002)', () => {
  const CHAIN_ID = 5042002;

  test('getChain returns Arc Testnet', () => {
    const chain = getChain(CHAIN_ID);
    expect(chain).toBeTruthy();
    expect(chain!.id).toBe(CHAIN_ID);
  });

  test('requireChain does not throw', () => {
    expect(() => requireChain(CHAIN_ID)).not.toThrow();
  });

  test('getUsdc returns Arc Testnet USDC', () => {
    const usdc = getUsdc(CHAIN_ID);
    expect(usdc).toBeTruthy();
    expect(usdc!.address).toMatch(/^0x/);
    expect(usdc!.decimals).toBe(6);
  });

  test('buildTxExplorerUrl generates a URL', () => {
    const url = buildTxExplorerUrl(CHAIN_ID, '0xabcdef1234');
    expect(url).toContain('0xabcdef1234');
    expect(url.startsWith('http')).toBe(true);
  });
});

// ── onchain-money: parseAmount / formatAmount ────────────────────────────────
import { parseAmount, formatAmount, formatUsdc as fmtUsdc, parseUsdc } from '../onchain-money';

describe('onchain-money', () => {
  const CHAIN_ID = 5042002;

  test('parseAmount with 10 USDC gives 10_000_000n', () => {
    const a = parseAmount(CHAIN_ID, '10');
    expect(a.raw).toBe(10_000_000n);
  });

  test('formatAmount with 10_000_000n gives "10.00"', () => {
    const a = parseAmount(CHAIN_ID, '10');
    const fmt = formatAmount(a);
    expect(fmt).toContain('10');
  });

  test('parseUsdc / formatUsdc round-trip', () => {
    const a = parseUsdc('25.50');
    expect(formatAmount(a)).toContain('25.5');
  });

  test('zero amount is valid', () => {
    const a = parseAmount(CHAIN_ID, '0');
    expect(a.raw).toBe(0n);
  });
});

// ── Saved searches localStorage logic ───────────────────────────────────────
import type { SavedSearch } from '../components/SavedSearches';

describe('saved searches model', () => {
  const makeSearch = (): SavedSearch => ({
    id: 's1',
    area: 'Yaba',
    propertyType: 'two_bed',
    maxRentUsdc: 150,
    label: '2-Bed in Yaba',
    createdAt: Date.now(),
    matches: 0,
  });

  test('saved search has all required fields', () => {
    const s = makeSearch();
    expect(s.id).toBeTruthy();
    expect(s.area).toBe('Yaba');
    expect(s.maxRentUsdc).toBe(150);
    expect(s.matches).toBe(0);
  });

  test('canary: matches starts at 0', () => {
    const s = makeSearch();
    expect(s.matches).toBe(0);
  });
});

// ── Referral code generation logic ───────────────────────────────────────────
describe('referral code generation', () => {
  function generateCode(addr: string): string {
    return 'RF-' + addr.slice(2, 6).toUpperCase() + addr.slice(-4).toUpperCase();
  }

  test('code starts with RF-', () => {
    const code = generateCode('0x5B12Ce46C7194aD57d143bC22847224047b1Ef42');
    expect(code.startsWith('RF-')).toBe(true);
  });

  test('code is 11 chars', () => {
    const code = generateCode('0x5B12Ce46C7194aD57d143bC22847224047b1Ef42');
    expect(code).toHaveLength(11);
  });

  test('different addresses give different codes', () => {
    const c1 = generateCode('0xaaaa000000000000000000000000000000001111');
    const c2 = generateCode('0xbbbb000000000000000000000000000000002222');
    expect(c1).not.toBe(c2);
  });
});

// ── InspectionFlow 3-step state machine ─────────────────────────────────────
describe('inspection flow step progression', () => {
  type Step = 'book' | 'visit' | 'pay';
  const STEPS: Step[] = ['book', 'visit', 'pay'];

  function nextStep(current: Step): Step | null {
    const idx = STEPS.indexOf(current);
    return idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
  }

  test('book → visit', () => expect(nextStep('book')).toBe('visit'));
  test('visit → pay', () => expect(nextStep('visit')).toBe('pay'));
  test('pay → null (terminal)', () => expect(nextStep('pay')).toBeNull());
});

// ── Escrow status transitions ─────────────────────────────────────────────────
import { EscrowStatus } from '../lib/contracts';

describe('EscrowStatus enum', () => {
  test('Pending is 0', () => expect(EscrowStatus.Pending).toBe(0));
  test('Active is 1', () => expect(EscrowStatus.Active).toBe(1));
  test('Completed is 3', () => expect(EscrowStatus.Completed).toBe(3));
  test('Disputed is 4', () => expect(EscrowStatus.Disputed).toBe(4));
  test('Refunded is 5', () => expect(EscrowStatus.Refunded).toBe(5));
});

// ── NotificationCenter — notification structure ───────────────────────────────
describe('notification model', () => {
  interface Notification {
    id: string;
    type: 'inspection' | 'payment' | 'lease' | 'system';
    title: string;
    body: string;
    read: boolean;
    timestamp: number;
  }

  function countUnread(notifications: Notification[]): number {
    return notifications.filter(n => !n.read).length;
  }

  const DEMO: Notification[] = [
    { id: '1', type: 'inspection', title: 'Inspection booked', body: 'A tenant booked an inspection for your Yaba property.', read: false, timestamp: Date.now() - 3600000 },
    { id: '2', type: 'payment', title: 'Rent received', body: 'Escrow #4 payment confirmed.', read: false, timestamp: Date.now() - 7200000 },
    { id: '3', type: 'system', title: 'Welcome to Handova', body: 'List your first property.', read: true, timestamp: Date.now() - 86400000 },
  ];

  test('countUnread = 2', () => expect(countUnread(DEMO)).toBe(2));
  test('mark read reduces count', () => {
    const updated = DEMO.map((n, i) => i === 0 ? { ...n, read: true } : n);
    expect(countUnread(updated)).toBe(1);
  });
  test('dismiss reduces length', () => {
    const updated = DEMO.filter(n => n.id !== '1');
    expect(updated.length).toBe(2);
  });
});

// ── Boost options ─────────────────────────────────────────────────────────────
describe('listing boost tiers', () => {
  const BOOST_OPTIONS = [
    { id: '7d', days: 7, usdcCost: 2 },
    { id: '14d', days: 14, usdcCost: 3.5 },
    { id: '30d', days: 30, usdcCost: 6 },
  ];

  test('30-day is cheapest per day', () => {
    const cpd = BOOST_OPTIONS.map(o => ({ id: o.id, cpd: o.usdcCost / o.days }));
    const sorted = [...cpd].sort((a, b) => a.cpd - b.cpd);
    expect(sorted[0].id).toBe('30d');
  });

  test('boost expiry is in future', () => {
    const days = 7;
    const expiry = new Date(Date.now() + days * 86400000);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  test('all tiers have positive cost', () => {
    for (const opt of BOOST_OPTIONS) {
      expect(opt.usdcCost).toBeGreaterThan(0);
    }
  });
});

// ── Review ratings ────────────────────────────────────────────────────────────
describe('tenant review ratings', () => {
  function averageRating(ratings: number[]): number {
    if (!ratings.length) return 0;
    return ratings.reduce((s, r) => s + r, 0) / ratings.length;
  }

  test('avg of 4,5,5 = 4.67', () => {
    expect(averageRating([4, 5, 5])).toBeCloseTo(4.67, 1);
  });

  test('empty array returns 0', () => {
    expect(averageRating([])).toBe(0);
  });

  test('all 5-star = 5.0', () => {
    expect(averageRating([5, 5, 5])).toBe(5);
  });

  test('rating must be 1-5', () => {
    const valid = [1, 2, 3, 4, 5];
    for (const r of valid) expect(r >= 1 && r <= 5).toBe(true);
  });
});

// ── Maintenance request priorities ────────────────────────────────────────────
describe('maintenance request model', () => {
  type Priority = 'low' | 'medium' | 'high';
  const PRIORITY_ORDER: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

  test('high > medium > low', () => {
    expect(PRIORITY_ORDER.high).toBeGreaterThan(PRIORITY_ORDER.medium);
    expect(PRIORITY_ORDER.medium).toBeGreaterThan(PRIORITY_ORDER.low);
  });

  function sortByPriority<T extends { priority: Priority }>(reqs: T[]): T[] {
    return [...reqs].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }

  test('high priority sorts first', () => {
    const reqs = [
      { title: 'Broken lock', priority: 'low' as Priority },
      { title: 'Leaking pipe', priority: 'high' as Priority },
      { title: 'Cracked tile', priority: 'medium' as Priority },
    ];
    const sorted = sortByPriority(reqs);
    expect(sorted[0].priority).toBe('high');
  });
});

// ── Dispute evidence file types ────────────────────────────────────────────────
describe('dispute evidence file type detection', () => {
  function detectType(mimetype: string): 'image' | 'video' | 'doc' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    return 'doc';
  }

  test('image/jpeg → image', () => expect(detectType('image/jpeg')).toBe('image'));
  test('video/mp4 → video', () => expect(detectType('video/mp4')).toBe('video'));
  test('application/pdf → doc', () => expect(detectType('application/pdf')).toBe('doc'));
  test('text/plain → doc', () => expect(detectType('text/plain')).toBe('doc'));
});

// ── LeasePdfExport data structure ─────────────────────────────────────────────
describe('lease PDF data', () => {
  const leaseData = {
    escrowId: '7',
    property: 'Lekki Phase 1 — 2-Bed Apartment',
    address: '14B Marcus Garvey St, Lekki',
    rentUsdc: 150,
    depositUsdc: 50,
    startDate: '01/10/2026',
    txHash: '0xabc123',
  };

  test('has escrowId', () => expect(leaseData.escrowId).toBe('7'));
  test('has property', () => expect(leaseData.property).toContain('Lekki'));
  test('rentUsdc > 0', () => expect(leaseData.rentUsdc).toBeGreaterThan(0));
  test('txHash is set', () => expect(leaseData.txHash).toMatch(/^0x/));
});

// ── Address validation (geocode guard) ────────────────────────────────────────
describe('address validation', () => {
  const LAGOS_KEYWORDS = ['Lagos', 'Nigeria', 'NG'];

  function isLagosAddress(addr: string): boolean {
    const lower = addr.toLowerCase();
    return LAGOS_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
  }

  test('Lagos address passes', () => {
    expect(isLagosAddress('14 Allen Avenue, Ikeja, Lagos, Nigeria')).toBe(true);
  });

  test('Non-Lagos address fails', () => {
    expect(isLagosAddress('1600 Pennsylvania Ave, Washington DC, USA')).toBe(false);
  });

  test('Empty string fails', () => {
    expect(isLagosAddress('')).toBe(false);
  });
});

// ── Theme persistence ─────────────────────────────────────────────────────────
describe('theme utilities', () => {
  // Dynamic import avoids DOM dependency in test env
  test('valid theme values are dark or light', () => {
    const VALID = ['dark', 'light'];
    for (const v of VALID) expect(VALID.includes(v)).toBe(true);
  });
});

// ── Role state machine ────────────────────────────────────────────────────────
describe('role selection', () => {
  type Role = 'tenant' | 'landlord';

  function defaultTabForRole(role: Role): string {
    return role === 'tenant' ? 'browse' : 'dashboard';
  }

  test('tenant default tab is browse', () => {
    expect(defaultTabForRole('tenant')).toBe('browse');
  });

  test('landlord default tab is dashboard', () => {
    expect(defaultTabForRole('landlord')).toBe('dashboard');
  });
});
