/**
 * Which Arc network Handova runs on — one switch for the whole app (browser and server).
 *   Browser: VITE_ARC_NETWORK=mainnet   Server: ARC_NETWORK=mainnet (or VITE_ARC_NETWORK)   Default: testnet.
 * Everything chain-specific comes from here: chain, RPC endpoints, Circle wallet path, explorer, gas sponsorship.
 */

import { arc, arcTestnet, type Chain } from 'viem/chains';

const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
const nodeEnv: Record<string, string | undefined> = typeof process !== 'undefined' && process.env ? process.env : {};
const pick = (...keys: string[]) => keys.map(k => viteEnv[k] ?? nodeEnv[k]).find(v => v !== undefined && v !== '');

export type ArcNetwork = 'mainnet' | 'testnet';
export const NETWORK: ArcNetwork = pick('VITE_ARC_NETWORK', 'ARC_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet';
export const IS_MAINNET = NETWORK === 'mainnet';

export const CHAIN: Chain = IS_MAINNET ? arc : arcTestnet;
export const CHAIN_ID = CHAIN.id; // 5042 mainnet, 5042002 testnet
export const NETWORK_LABEL = IS_MAINNET ? 'Arc' : 'Arc Testnet';

/** Arc's official RPC endpoints (https://docs.arc.io/arc/references/connect-to-arc). */
export const ARC_RPCS: string[] = IS_MAINNET
  ? ['https://rpc.mainnet.arc.io', 'https://rpc.blockdaemon.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io']
  : ['https://rpc.testnet.arc.io', 'https://rpc.blockdaemon.testnet.arc.io', 'https://rpc.quicknode.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'];

/** Path segment for Circle's Modular Wallets RPC (needs a LIVE client key on mainnet, TEST key on testnet). */
export const CIRCLE_CHAIN_PATH = IS_MAINNET ? 'arc' : 'arcTestnet';

export const EXPLORER = IS_MAINNET ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io';
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;

/**
 * Gas sponsorship through Circle's paymaster. Free on testnet; on mainnet it needs Circle Gas Station set up and paid
 * for, so it is off unless VITE_PAYMASTER=true — users then pay the (tiny, USDC) gas from their own wallet.
 */
export const SPONSOR_GAS = (pick('VITE_PAYMASTER') ?? (IS_MAINNET ? 'false' : 'true')) === 'true';
/** Pass as `paymaster` to sendUserOperation: `true` = Circle sponsors gas, `undefined` = the wallet pays its own. */
export const USE_PAYMASTER: true | undefined = SPONSOR_GAS ? true : undefined;

/**
 * When the wallet pays its own gas, a new wallet with no USDC can't send anything. Returns a plain message for that
 * case (the error text from the bundler/RPC varies), or null for other errors.
 */
export function gasProblem(e: unknown): string | null {
  const m = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ''}` : String(e);
  if (!/AA21|prefund|insufficient funds|exceeds balance|gas required exceeds|InsufficientFunds/i.test(m)) return null;
  return SPONSOR_GAS
    ? 'The network fee couldn\'t be covered right now. Please try again in a minute.'
    : 'Your wallet needs a little USDC to pay the network fee (a fraction of a cent on Arc). Add USDC to your wallet address (top right) and try again.';
}
