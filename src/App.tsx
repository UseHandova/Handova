import { useState, useCallback, useEffect } from 'react';
import type { SmartAccount } from 'viem/account-abstraction';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import AuthGate from '@/components/AuthGate';
import LanguageWelcome from '@/components/LanguageWelcome';
import RolePicker from '@/components/RolePicker';
import Header from '@/components/Header';
import TabBar from '@/components/TabBar';
import { navigate as go, rememberRole, rememberedRole, roleFromPath, usePath, type Role } from '@/lib/router';
import BrowseListings from '@/components/BrowseListings';
import LandlordDashboard from '@/components/LandlordDashboard';
import MyLeases from '@/components/MyLeases';
import { ESCROW_ADDRESS } from '@/lib/contracts';
import { sendEscrowTx, usePendingWithdrawal, useRefreshChain } from '@/lib/chain';
import { applyTheme, getTheme } from '@/lib/theme';
import { useLang } from '@/lib/LangContext';
import OnboardingWalkthrough, { shouldShowOnboarding } from '@/components/OnboardingWalkthrough';
import AdminDashboard from '@/components/AdminDashboard';


export default function App() {
  const { chosen: langChosen } = useLang();
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [address, setAddress] = useState('');
  // The screen lives in the URL: /tenant, /tenant/leases, /landlord, /landlord/new, …
  const [path, navigate] = usePath();
  const role = roleFromPath(path);
  const tab = path === '/tenant/leases' ? 'leases' : 'browse';

  // Land on the right screen: old-style links (/?wa=…, Didit returns) go to the landlord area;
  // '/' goes to the role you used last; unknown paths fall back to '/'.
  useEffect(() => {
    const search = window.location.search;
    const landlordLink = /[?&](wa|kyc)=|verificationSessionId=/.test(window.location.href);
    if (path === '/' && landlordLink) {
      go(`/landlord${/[?&]wa=/.test(search) ? '/whatsapp' : ''}${search}`, { replace: true });
    } else if (path === '/' && rememberedRole() && [null, 'app'].includes(new URLSearchParams(search).get('preview'))) {
      go(`/${rememberedRole()}${search}`, { replace: true });
    } else if (path !== '/' && !role) {
      go(`/${search}`, { replace: true });
    }
  }, [path, role]);
  useEffect(() => { if (role) rememberRole(role); }, [role]);
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
    setAccount(null); setAddress('');
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
  if (devPreview === 'app') {
    // Full routed app with a stub account (no passkey), for testing navigation.
    const stub = { address: new URLSearchParams(window.location.search).get('as') ?? '0x000000000000000000000000000000000000dEaD' } as SmartAccount;
    return <MainApp account={stub} address={stub.address} role={role} tab={tab} navigate={navigate}
      pendingUsdc={0} onSignOut={() => undefined} onWithdraw={() => undefined}
      showOnboarding={false} onOnboardingDone={() => undefined} showAdmin={false} setShowAdmin={() => undefined} />;
  }
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
  return <MainApp account={account} address={address} role={role} tab={tab} navigate={navigate}
    pendingUsdc={pendingUsdc} onSignOut={handleSignOut} onWithdraw={() => { void handleWithdraw(); }}
    showOnboarding={showOnboarding} onOnboardingDone={() => setShowOnboarding(false)}
    showAdmin={showAdmin} setShowAdmin={setShowAdmin} />;
}

interface MainProps {
  account: SmartAccount; address: string; role: Role | null; tab: 'browse' | 'leases'; navigate: (to: string) => void;
  pendingUsdc: number; onSignOut: () => void; onWithdraw: () => void;
  showOnboarding: boolean; onOnboardingDone: () => void; showAdmin: boolean; setShowAdmin: (v: boolean) => void;
}

/** Signed-in shell: role picker, header, the current screen, tab bar and overlays. */
function MainApp({ account, address, role, tab, navigate, pendingUsdc, onSignOut, onWithdraw, showOnboarding, onOnboardingDone, showAdmin, setShowAdmin }: MainProps) {

  // ── Role picker ───────────────────────────────────────────────────────────────
  if (!role) return <RolePicker onPick={r => navigate(`/${r}`)} />;

  // ── Main app ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header address={address} pendingUsdc={pendingUsdc}
        onSignOut={onSignOut} onWithdraw={onWithdraw}
        role={role} onSwitchRole={() => { rememberRole(null); navigate('/'); }}
        onOpenAdmin={() => setShowAdmin(true)} />
      <AnimatePresence mode="wait">
        <motion.div key={role === 'tenant' ? tab : role} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
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
      {role === 'tenant' && <TabBar active={tab} onChange={t => navigate(t === 'leases' ? '/tenant/leases' : '/tenant')} role={role} />}

      {/* Onboarding walkthrough */}
      <AnimatePresence>
        {showOnboarding && role && (
          <OnboardingWalkthrough role={role} onDone={onOnboardingDone} />
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
