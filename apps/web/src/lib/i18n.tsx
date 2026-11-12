'use client';
import { createContext, useContext, useMemo } from 'react';
import { Locale, translate } from './translate';

const Ctx = createContext<{ locale: Locale; t: ReturnType<typeof translate> }>({ locale: 'fr', t: translate('fr') });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: translate(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
