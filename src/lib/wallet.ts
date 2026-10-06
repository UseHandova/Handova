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

/** Persist / restore credential from sessionStorage (replace with httpOnly cookie in prod). */
export function saveCredential(cred: WebAuthnCredential) {
  sessionStorage.setItem('rentflow_cred', JSON.stringify(cred));
}

export function loadCredential(): WebAuthnCredential | null {
  try {
    const raw = sessionStorage.getItem('rentflow_cred');
    return raw ? (JSON.parse(raw) as WebAuthnCredential) : null;
  } catch {
    return null;
  }
}

export function clearCredential() {
  sessionStorage.removeItem('rentflow_cred');
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

/** Restore session from stored credential. */
export async function restoreSession(): Promise<SmartAccount | null> {
  const credential = loadCredential();
  if (!credential) return null;
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
