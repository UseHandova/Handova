/**
 * Onchain reads + writes for RentFlowEscrow.
 * Reads go straight to the Arc RPC via Multicall3; writes go through the Circle bundler (gasless).
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPublicClient, encodeFunctionData, formatUnits, http, type Address } from 'viem';
import type { SmartAccount } from 'viem/account-abstraction';
import { arcTestnet } from 'viem/chains';
import { ESCROW_ABI, ESCROW_ADDRESS, EscrowStatus } from '@/lib/contracts';
import { bundlerClient } from '@/lib/wallet';

// Mirrors the constants in RentFlowEscrow.sol
export const MOVE_IN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const DEPOSIT_REVIEW_MS = 7 * 24 * 60 * 60 * 1000;
export const DISPUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

const readClient = createPublicClient({ chain: arcTestnet, transport: http() });
const escrowContract = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const;

/** Free-form metadata a landlord stores with a listing (JSON in metadataUri). */
export interface ListingMeta {
  address?: string;
  location?: string;
  rooms?: number;
  propertyType?: string;
  furnishing?: 'furnished' | 'unfurnished' | 'semi_furnished';
  description?: string;
  amenities?: string[];
  lat?: number;
  lng?: number;
  source?: string;
  /** Landlord's WhatsApp number for inspections (digits, e.g. 2348031234567), if they chose to share it. */
  phone?: string;
  /** Uploaded photos/videos (URLs served by /api/media). */
  media?: { type: 'image' | 'video'; url: string }[];
}

export interface ChainListing {
  id: bigint;
  landlord: Address;
  rentUsdc: number;
  depositUsdc: number;
  active: boolean;
  meta: ListingMeta;
  /** Current escrow on this listing, 0n when the property is free to rent. */
  escrowId: bigint;
  /** Unix ms when the landlord passed identity verification onchain (0 = not verified). */
  landlordVerifiedAt: number;
}

export interface ChainEscrow {
  id: bigint;
  listingId: bigint;
  tenant: Address;
  heldUsdc: number;
  status: EscrowStatus;
  createdAt: number;
  /** Unix ms, 0 when not set. */
  handoverAt: number;
  endRequestedAt: number;
  disputedAt: number;
  listing?: ChainListing;
}

export interface ChainState {
  listings: ChainListing[];
  escrows: ChainEscrow[];
  arbiter: Address | null;
}

const usdc = (raw: bigint) => Number(formatUnits(raw, 6));
const ms = (secs: bigint) => Number(secs) * 1000;

function parseMeta(uri: string): ListingMeta {
  try {
    const parsed: unknown = JSON.parse(uri);
    return parsed && typeof parsed === 'object' ? (parsed) : {};
  } catch {
    return { description: uri };
  }
}

async function fetchChainState(): Promise<ChainState> {
  const [listingCount, escrowCount, arbiter] = await readClient.multicall({
    contracts: [
      { ...escrowContract, functionName: 'listingCounter' },
      { ...escrowContract, functionName: 'escrowCounter' },
      // Older deployments have no arbiter(); allowFailure keeps the read working.
      { ...escrowContract, functionName: 'arbiter' },
    ],
  });
  // Multicall reports failed calls as results instead of throwing. If the counters themselves failed
  // (RPC down / rate-limited), throw so the UI shows an error instead of "you have nothing".
  if (listingCount.status === 'failure') throw listingCount.error;
  if (escrowCount.status === 'failure') throw escrowCount.error;
  const nListings = Number(listingCount.result);
  const nEscrows = Number(escrowCount.result);

  const listingIds = Array.from({ length: nListings }, (_, i) => BigInt(i + 1));
  const escrowIds = Array.from({ length: nEscrows }, (_, i) => BigInt(i + 1));

  const [listingRows, escrowRows] = await Promise.all([
    readClient.multicall({
      contracts: listingIds.flatMap(id => [
        { ...escrowContract, functionName: 'listings', args: [id] } as const,
        { ...escrowContract, functionName: 'listingToEscrowId', args: [id] } as const,
      ]),
    }),
    readClient.multicall({
      contracts: escrowIds.flatMap(id => [
        { ...escrowContract, functionName: 'escrows', args: [id] } as const,
        { ...escrowContract, functionName: 'handoverAt', args: [id] } as const,
        { ...escrowContract, functionName: 'endRequestedAt', args: [id] } as const,
        { ...escrowContract, functionName: 'disputedAt', args: [id] } as const,
      ]),
    }),
  ]);

  const listings: ChainListing[] = listingIds.map((id, i) => {
    const row = listingRows[i * 2].result as readonly [Address, bigint, bigint, boolean, string] | undefined;
    const escrowId = (listingRows[i * 2 + 1].result as bigint | undefined) ?? 0n;
    const [landlord, rent, deposit, active, metadataUri] = row ?? ['0x0000000000000000000000000000000000000000', 0n, 0n, false, ''];
    return { id, landlord, rentUsdc: usdc(rent), depositUsdc: usdc(deposit), active, meta: parseMeta(metadataUri), escrowId, landlordVerifiedAt: 0 };
  });

  // Verified badges for every landlord with a listing.
  const landlords = [...new Set(listings.map(l => l.landlord.toLowerCase()))] as Address[];
  if (landlords.length > 0) {
    const verified = await readClient.multicall({
      contracts: landlords.map(a => ({ ...escrowContract, functionName: 'verifiedAt', args: [a] } as const)),
    });
    const verifiedAt = new Map(landlords.map((a, i) => [a, ms((verified[i].result) ?? 0n)]));
    for (const l of listings) l.landlordVerifiedAt = verifiedAt.get(l.landlord.toLowerCase() as Address) ?? 0;
  }

  const byId = new Map(listings.map(l => [l.id, l]));
  const escrows: ChainEscrow[] = escrowIds.map((id, i) => {
    const row = escrowRows[i * 4].result as readonly [bigint, Address, bigint, number, bigint] | undefined;
    const [listingId, tenant, held, status, createdAt] = row ?? [0n, '0x0000000000000000000000000000000000000000', 0n, 0, 0n];
    const opt = (j: number) => ms((escrowRows[i * 4 + j].result as bigint | undefined) ?? 0n);
    return {
      id, listingId, tenant, heldUsdc: usdc(held), status: status, createdAt: ms(createdAt),
      handoverAt: opt(1), endRequestedAt: opt(2), disputedAt: opt(3), listing: byId.get(listingId),
    };
  });

  return { listings, escrows, arbiter: (arbiter.result) ?? null };
}

const CHAIN_KEY = ['rentflow-chain', ESCROW_ADDRESS] as const;

/** All listings + escrows, refreshed every 15s. */
export function useChainState() {
  return useQuery({
    queryKey: CHAIN_KEY,
    queryFn: fetchChainState,
    enabled: !!ESCROW_ADDRESS,
    refetchInterval: 15_000,
  });
}

/** Listing ids the platform has taken down (scams, spam, test data) — hidden from tenants. */
export function useHiddenListings() {
  return useQuery({
    queryKey: ['rentflow-hidden'],
    queryFn: async () => {
      const res = await fetch('/api/moderation/hidden');
      if (!res.ok) return new Set<string>();
      return new Set(((await res.json()) as { listingIds: string[] }).listingIds);
    },
    staleTime: 60_000,
  });
}

/** USDC the address can withdraw from the escrow. */
export function usePendingWithdrawal(address: string) {
  return useQuery({
    queryKey: ['rentflow-pending', ESCROW_ADDRESS, address],
    queryFn: async () => usdc(await readClient.readContract({
      ...escrowContract, functionName: 'pendingWithdrawals', args: [address as Address],
    })),
    enabled: !!ESCROW_ADDRESS && !!address,
    refetchInterval: 15_000,
  });
}

/** Call after a write so every screen picks up the new state immediately. */
export function useRefreshChain() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: CHAIN_KEY }),
    qc.invalidateQueries({ queryKey: ['rentflow-pending'] }),
    qc.invalidateQueries({ queryKey: ['rentflow-verified'] }),
  ]);
}

type EscrowWrite =
  | { functionName: 'markHandover' | 'claimMoveIn' | 'approveDepositReturn' | 'claimDeposit' | 'dispute' | 'confirmMoveIn' | 'endTenancy'; args: [bigint] }
  | { functionName: 'resolveDispute'; args: [bigint, number] }
  | { functionName: 'withdraw'; args?: [] };

/** Send one escrow call as a gasless user operation and wait for it to land. */
export async function sendEscrowTx(account: SmartAccount, call: EscrowWrite) {
  if (!ESCROW_ADDRESS) throw new Error('Contract not deployed — set VITE_ESCROW_ADDRESS.');
  const data = encodeFunctionData({ abi: ESCROW_ABI, ...call });
  const hash = await bundlerClient.sendUserOperation({
    account,
    calls: [{ to: ESCROW_ADDRESS, data, value: 0n }],
    paymaster: true,
  });
  return bundlerClient.waitForUserOperationReceipt({ hash });
}

export const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Whether either party may open a dispute on this escrow right now. */
export function canDispute(e: ChainEscrow) {
  return e.status === EscrowStatus.Active
    || e.status === EscrowStatus.Ending
    || (e.status === EscrowStatus.Pending && e.handoverAt > 0);
}

export function formatCountdown(untilMs: number, now: number) {
  const left = untilMs - now;
  if (left <= 0) return 'now';
  const h = Math.ceil(left / 3_600_000);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''}`;
  const days = Math.ceil(h / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}

/** Admin = the escrow's onchain dispute arbiter (or VITE_ADMIN_ADDRESS for older deployments without one). */
export function useIsAdmin(address: string) {
  const arbiter = useChainState().data?.arbiter;
  return sameAddress(address, arbiter) || sameAddress(address, import.meta.env.VITE_ADMIN_ADDRESS as string | undefined);
}

/** Current time that re-renders every minute, for countdowns and deadline checks. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Unix ms when the address was verified as a landlord (0 = not verified). */
export function useVerifiedAt(address: string) {
  return useQuery({
    queryKey: ['rentflow-verified', ESCROW_ADDRESS, address],
    queryFn: async () => ms(await readClient.readContract({
      ...escrowContract, functionName: 'verifiedAt', args: [address as Address],
    })),
    enabled: !!ESCROW_ADDRESS && !!address,
    refetchInterval: 30_000,
  });
}
