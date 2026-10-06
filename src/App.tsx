import { useState, useCallback, useEffect } from 'react';
import type { SmartAccount } from 'viem/account-abstraction';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Search, Home } from 'lucide-react';
import AuthGate from '@/components/AuthGate';
import Header from '@/components/Header';
import TabBar, { type Tab } from '@/components/TabBar';
import BrowseListings from '@/components/BrowseListings';
import LandlordDashboard from '@/components/LandlordDashboard';
import MyLeases from '@/components/MyLeases';
import ThemeToggle from '@/components/ThemeToggle';
import { ESCROW_ADDRESS } from '@/lib/contracts';
import { sendEscrowTx, usePendingWithdrawal, useRefreshChain } from '@/lib/chain';
import { applyTheme, getTheme } from '@/lib/theme';
import { useLang } from '@/lib/LangContext';
import LangSelector from '@/components/LangSelector';
import OnboardingWalkthrough, { shouldShowOnboarding } from '@/components/OnboardingWalkthrough';
import AdminDashboard from '@/components/AdminDashboard';

type Role = 'tenant' | 'landlord';
const springs = { gentle: { type: 'spring', stiffness: 280, damping: 26 } as const };

export default function App() {
  const { t } = useLang();
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<Role | null>(null);
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

  if (!account) return <AuthGate onAuth={handleAuth} />;

  // ── Role picker ───────────────────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <motion.div className="orb-green"
            style={{ width: 340, height: 340, top: '-5%', right: '-5%' }}
            animate={{ x: [0, -14, 0], y: [0, 16, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.div className="orb-gold"
            style={{ width: 280, height: 280, bottom: '10%', left: '-4%' }}
            animate={{ x: [0, 12, 0], y: [0, -10, 0] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }} />
        </div>

        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <LangSelector compact showMic={false} />
          <ThemeToggle />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-dvh px-5">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle }} className="w-full max-w-sm">
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #14a85a 100%)', boxShadow: '0 12px 36px var(--accent-glow)' }}>
                <Home className="w-7 h-7 text-white" />
              </div>
              <h2 className="display text-2xl font-bold text-center" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                {t('choose_role')}
              </h2>
              <h2 className="display text-2xl font-bold text-center mb-1" style={{ color: 'var(--accent)', letterSpacing: '-0.03em' }}>
                RentFlow?
              </h2>
              <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>{t('switch_any_time')}</p>
            </div>

            <div className="space-y-3">
              {/* Tenant */}
              <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
                onClick={() => { setRole('tenant'); setTab('browse'); }}
                className="w-full rounded-3xl p-5 text-left flex items-start gap-4 transition-shadow"
                style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(91,184,138,0.15)', border: '1px solid rgba(91,184,138,0.25)' }}>
                  <Search className="w-7 h-7" style={{ color: 'var(--success)' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-base mb-0.5" style={{ color: 'var(--ink)' }}>{t('iam_tenant')}</div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{t('tenant_desc')}</div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {([t('browse_homes'), t('pay_escrow'), t('nft_cert')] as string[]).map((tag: string) => (
                      <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(91,184,138,0.12)', color: 'var(--success)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.button>

              {/* Landlord */}
              <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
                onClick={() => { setRole('landlord'); setTab('browse'); }}
                className="w-full rounded-3xl p-5 text-left flex items-start gap-4 transition-shadow"
                style={{ background: 'var(--glass-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-card)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-soft)', border: '1px solid rgba(10,102,56,0.2)' }}>
                  <Building2 className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-base mb-0.5" style={{ color: 'var(--ink)' }}>{t('iam_landlord')}</div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{t('landlord_desc')}</div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {([t('list_prop_tag'), t('photo_video_tag'), t('zero_agent_tag')] as string[]).map((tag: string) => (
                      <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.button>
            </div>

            <p className="text-xs text-center mt-5" style={{ color: 'var(--subtle)' }}>
              {t('wallet_label')}: <span className="mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb-green" style={{ width: 300, height: 300, top: '15%', right: '-8%', opacity: 0.5 }} />
        <div className="orb-gold" style={{ width: 260, height: 260, bottom: '20%', left: '-6%', opacity: 0.45 }} />
      </div>
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
