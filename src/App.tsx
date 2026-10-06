import { useState, useCallback, useEffect } from 'react';
import type { SmartAccount } from 'viem/account-abstraction';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import AuthGate from '@/components/AuthGate';
import LanguageWelcome from '@/components/LanguageWelcome';
import RolePicker from '@/components/RolePicker';
import Header from '@/components/Header';
import TabBar, { type Tab } from '@/components/TabBar';
import BrowseListings from '@/components/BrowseListings';
import LandlordDashboard from '@/components/LandlordDashboard';
import MyLeases from '@/components/MyLeases';
import { ESCROW_ADDRESS } from '@/lib/contracts';
import { sendEscrowTx, usePendingWithdrawal, useRefreshChain } from '@/lib/chain';
import { applyTheme, getTheme } from '@/lib/theme';
import { useLang } from '@/lib/LangContext';
import OnboardingWalkthrough, { shouldShowOnboarding } from '@/components/OnboardingWalkthrough';
import AdminDashboard from '@/components/AdminDashboard';

type Role = 'tenant' | 'landlord';

export default function App() {
  const { chosen: langChosen } = useLang();
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [address, setAddress] = useState('');
  // WhatsApp claim links (?wa=…) and returns from identity verification (?kyc=…) are always landlord flows.
  const [role, setRole] = useState<Role | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.has('wa') || p.has('kyc') || /verificationSessionId=/.test(window.location.href) ? 'landlord' : null;
  });
  const [tab, setTab] = useState<Tab>('browse');
  const pendingUsdc = usePendingWithdrawal(address).data ?? 0;
  const refreshChain = useRefreshChain();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => { applyTheme(getTheme()); }, []);

  const handleAuth = useCallback((acc: SmartAccount, addr: string) => {
    setAccount(acc); setAddress(addr);
    // Show onboarding for first-time users
    if (shouldShowOnboarding()) setShowOnboarding(true);
  }, []);

  const handleSignOut = useCallback(() => {
    setAccount(null); setAddress(''); setRole(null);
  }, []);

  async function handleWithdraw() {
    if (!account || !ESCROW_ADDRESS) return;
    try {
      toast.promise(sendEscrowTx(account, { functionName: 'withdraw' }).then(refreshChain), {
        loading: 'Withdrawing USDC…',
        success: 'USDC withdrawn to your wallet!',
        error: 'Withdrawal failed.',
      });
    } catch { toast.error('Could not withdraw.'); }
  }

  // Dev-only: /?preview=tenant|leases|landlord|roles[&as=0x…] renders a screen without a passkey (for screenshots).
  // Stripped from production builds.
  const devPreview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null;
  if (devPreview) {
    const params = new URLSearchParams(window.location.search);
    const stub = { address: params.get('as') ?? '0x000000000000000000000000000000000000dEaD' } as SmartAccount;
    const previewRole: Role = devPreview === 'landlord' ? 'landlord' : 'tenant';
    if (devPreview === 'roles') return <RolePicker onPick={() => undefined} />;
    return (
      <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
        <Header address={stub.address} pendingUsdc={0} onSignOut={() => undefined} onWithdraw={() => undefined}
          role={previewRole} onSwitchRole={() => undefined} onOpenAdmin={() => undefined} />
        {devPreview === 'landlord' ? <LandlordDashboard account={stub} />
          : devPreview === 'leases' ? <MyLeases account={stub} address={stub.address} />
          : <BrowseListings account={stub} />}
        {previewRole === 'tenant' && <TabBar active={devPreview === 'leases' ? 'leases' : 'browse'} onChange={() => undefined} role="tenant" />}
      </div>
    );
  }

  if (!langChosen) return <LanguageWelcome />;
  if (!account) return <AuthGate onAuth={handleAuth} />;

  // ── Role picker ───────────────────────────────────────────────────────────────
  if (!role) return <RolePicker onPick={r => { setRole(r); setTab('browse'); }} />;

  // ── Main app ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header address={address} pendingUsdc={pendingUsdc}
        onSignOut={handleSignOut} onWithdraw={() => { void handleWithdraw(); }}
        role={role} onSwitchRole={() => setRole(null)}
        onOpenAdmin={() => setShowAdmin(true)} />
      <AnimatePresence mode="wait">
        <motion.div key={tab + role} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="relative z-10">
          {role === 'landlord' ? (
            <LandlordDashboard account={account} />
          ) : (
            <>
              {tab === 'browse' && <BrowseListings account={account} />}
              {tab === 'leases' && <MyLeases account={account} address={address} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {role === 'tenant' && <TabBar active={tab} onChange={setTab} role={role} />}

      {/* Onboarding walkthrough */}
      <AnimatePresence>
        {showOnboarding && role && (
          <OnboardingWalkthrough role={role} onDone={() => setShowOnboarding(false)} />
        )}
      </AnimatePresence>

      {/* Admin dashboard overlay */}
      <AnimatePresence>
        {showAdmin && (
          <AdminDashboard address={address} account={account} onClose={() => setShowAdmin(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
