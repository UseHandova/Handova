/**
 * Circle Modular Wallets (passkey) setup for Arc Testnet.
 * Social / passkey login: each user registers once with a biometric passkey
 * (works on every phone with Face ID / fingerprint / PIN — no seed phrase).
 * Gas is sponsored (paymaster: true) so users never need separate gas tokens.
 */

import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  type WebAuthnCredential,
} from '@circle-fin/modular-wallets-core';
import {
  createBundlerClient,
  toWebAuthnAccount,
  type SmartAccount,
} from 'viem/account-abstraction';
import { createPublicClient } from 'viem';
import { arcTestnet } from 'viem/chains';

const clientKey = import.meta.env.VITE_CLIENT_KEY as string;
const clientUrl = import.meta.env.VITE_CLIENT_URL as string;

export const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);

export const modularTransport = toModularTransport(
  `${clientUrl}/arcTestnet`,
  clientKey,
);

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: modularTransport,
});

export const bundlerClient = createBundlerClient({
  chain: arcTestnet,
  transport: modularTransport,
});

/**
 * Persist the passkey credential (public key + id only — no secrets) so users stay signed in
 * across tabs and restarts. Storage can be unavailable (private mode), so every access is guarded.
 */
const CRED_KEY = 'rentflow_cred';

export function saveCredential(cred: WebAuthnCredential) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(cred)); } catch { /* storage unavailable */ }
}

export function loadCredential(): WebAuthnCredential | null {
  try {
    const raw = localStorage.getItem(CRED_KEY) ?? sessionStorage.getItem(CRED_KEY);
    return raw ? (JSON.parse(raw) as WebAuthnCredential) : null;
  } catch {
    return null;
  }
}

export function clearCredential() {
  try {
    localStorage.removeItem(CRED_KEY);
    sessionStorage.removeItem(CRED_KEY);
  } catch { /* storage unavailable */ }
  // Signing out also forgets a phone wallet kept on this device (its locked backup stays on the server).
  void import('@/lib/phone-wallet').then(m => m.clearDeviceKey());
}

/** Register a new passkey and create a Circle smart account. */
export async function registerPasskey(
  username: string,
): Promise<{ credential: WebAuthnCredential; account: SmartAccount }> {
  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    mode: WebAuthnMode.Register,
    username,
  });
  saveCredential(credential);
  const account = await toCircleSmartAccount({
    client: publicClient,
    owner: toWebAuthnAccount({ credential }),
  });
  return { credential, account };
}

/** Login with existing passkey (biometric prompt). */
export async function loginPasskey(): Promise<{
  credential: WebAuthnCredential;
  account: SmartAccount;
}> {
  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    mode: WebAuthnMode.Login,
  });
  saveCredential(credential);
  const account = await toCircleSmartAccount({
    client: publicClient,
    owner: toWebAuthnAccount({ credential }),
  });
  return { credential, account };
}

/** Restore session from the stored passkey credential, or a phone wallet kept on this device. */
export async function restoreSession(): Promise<SmartAccount | null> {
  const credential = loadCredential();
  if (!credential) {
    const { loadDeviceKey, smartAccountFor } = await import('@/lib/phone-wallet');
    const device = await loadDeviceKey();
    return device ? smartAccountFor(device.privateKey).catch(() => null) : null;
  }
  try {
    const account = await toCircleSmartAccount({
      client: publicClient,
      owner: toWebAuthnAccount({ credential }),
    });
    return account;
  } catch {
    clearCredential();
    return null;
  }
}
