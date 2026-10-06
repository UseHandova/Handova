/**
 * LangContext — provides the active language throughout the app.
 * Persists to localStorage under key 'rf-lang'.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { LangCode } from '@/lib/i18n';
import { t as translate } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';

interface LangContextValue {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

function getSavedLang(): LangCode {
  const saved = localStorage.getItem('rf-lang') as LangCode | null;
  const valid: LangCode[] = ['en', 'yo', 'pcm', 'ig', 'ha'];
  return valid.includes(saved as LangCode) ? (saved as LangCode) : 'en';
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(getSavedLang);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    localStorage.setItem('rf-lang', l);
  }, []);

  const tFn = useCallback((key: TranslationKey) => translate(lang, key), [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t: tFn }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
