import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import { API_URL } from './api';
import { AR } from './ar';
import { setZoneTable, toLocal } from './zone';

export type Locale = 'fr' | 'ar';
type Vars = Record<string, string | number | null | undefined>;

const translate = (locale: Locale) => (text: string, vars?: Vars) => {
  const out = (locale === 'ar' ? AR[text] : undefined) ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out;
};

const format = (locale: string, options: Intl.DateTimeFormatOptions, d: string | number | Date) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toLocal(d));

/** Toutes les heures sont celles du Maroc, d'après la table fournie par le serveur (voir zone.ts). */
export const fmt = {
  mad: (n: number | null | undefined, locale: Locale) => (n == null ? '—' : `${n} ${locale === 'ar' ? 'درهم' : 'DH'}`),
  time: (d: string | number | Date) => format('fr-MA', { hour: '2-digit', minute: '2-digit', hour12: false }, d),
  date: (d: string | number | Date, locale: Locale) => format(locale === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'long', day: 'numeric', month: 'long' }, d),
  day: (d: number | Date = new Date()) => toLocal(d).toISOString().slice(0, 10),
};

const Ctx = createContext<{ locale: Locale; t: ReturnType<typeof translate>; setLocale: (l: Locale) => Promise<boolean>; zoneReady: boolean }>(null as never);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'fr');

  useEffect(() => {
    SecureStore.getItemAsync('locale').then((stored) => {
      if (stored === 'fr' || stored === 'ar') setLocaleState(stored);
    });
  }, []);

  // Table des décalages horaires du Maroc, fournie par le serveur : l'affichage ne dépend pas de la base de fuseaux du téléphone.
  const [zoneReady, setZoneReady] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/api/meta/timezone`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { setZoneTable(data.transitions); setZoneReady(true); })
      .catch(() => {});
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

  const value = useMemo(() => ({ locale, t: translate(locale), setLocale, zoneReady }), [locale, setLocale, zoneReady]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
