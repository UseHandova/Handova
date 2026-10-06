/**
 * RolePicker — "Are you renting or letting?" after sign-in. Switchable any time from the header.
 */

import { motion } from 'framer-motion';
import { Home, Search, Building2, ChevronRight } from 'lucide-react';
import { useLang } from '@/lib/LangContext';
import LangSelector from '@/components/LangSelector';
import ThemeToggle from '@/components/ThemeToggle';

interface Props {
  onPick: (role: 'tenant' | 'landlord') => void;
}

export default function RolePicker({ onPick }: Props) {
  const { t } = useLang();

  const options = [
    { role: 'tenant' as const, icon: Search, title: t('iam_tenant'), desc: t('tenant_desc'),
      points: ['Browse homes with photos and video', 'Pay into escrow, not to a stranger', 'Get your caution fee back'] },
    { role: 'landlord' as const, icon: Building2, title: t('iam_landlord'), desc: t('landlord_desc'),
      points: ['List in minutes — or by WhatsApp voice note', 'Get rent the day your tenant moves in', 'No agent taking a cut'] },
  ];

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Home className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>RentFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <LangSelector compact showMic={false} />
          <ThemeToggle />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-center" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            How will you use RentFlow?
          </h1>
          <p className="text-sm text-center mt-2 mb-8" style={{ color: 'var(--muted)' }}>{t('switch_any_time')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {options.map(({ role, icon: Icon, title, desc, points }, i) => (
              <motion.button key={role}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onPick(role)}
                className="group text-left rounded-2xl p-5 flex flex-col transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                    <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--subtle)' }} />
                </div>
                <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>{title}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {points.map(p => (
                    <li key={p} className="text-sm flex gap-2" style={{ color: 'var(--ink-2)' }}>
                      <span className="mt-2 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />{p}
                    </li>
                  ))}
                </ul>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
