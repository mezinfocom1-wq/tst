import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import { AR } from './ar';

export type Locale = 'fr' | 'ar';
type Vars = Record<string, string | number | null | undefined>;
const TZ = 'Africa/Casablanca';

const translate = (locale: Locale) => (text: string, vars?: Vars) => {
  const out = (locale === 'ar' ? AR[text] : undefined) ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out;
};

export const fmt = {
  mad: (n: number | null | undefined, locale: Locale) => (n == null ? '—' : `${n} ${locale === 'ar' ? 'درهم' : 'DH'}`),
  time: (d: string | number | Date) => new Intl.DateTimeFormat('fr-MA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(d)),
  date: (d: string | number | Date, locale: Locale) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(d)),
  day: (d: number | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)),
};

const Ctx = createContext<{ locale: Locale; t: ReturnType<typeof translate>; setLocale: (l: Locale) => Promise<boolean> }>(null as never);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'fr');

  useEffect(() => {
    SecureStore.getItemAsync('locale').then((stored) => {
      if (stored === 'fr' || stored === 'ar') setLocaleState(stored);
    });
  }, []);

  /** Change la langue. Retourne `true` si un redémarrage est nécessaire pour inverser le sens d'affichage. */
  const setLocale = useCallback(async (next: Locale) => {
    await SecureStore.setItemAsync('locale', next);
    setLocaleState(next);
    const rtl = next === 'ar';
    if (I18nManager.isRTL === rtl) return false;
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return true;
  }, []);

  const value = useMemo(() => ({ locale, t: translate(locale), setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
