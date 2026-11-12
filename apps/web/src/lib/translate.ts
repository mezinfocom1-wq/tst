import { AR } from './ar';
import { toLocal } from './zone';

export const LOCALES = ['fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);
export const dirOf = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');

export type Vars = Record<string, string | number | null | undefined>;

/**
 * Traduction de type « gettext » : le texte français sert de clé.
 * Ajouter une langue = ajouter un dictionnaire ; un texte non traduit reste affiché en français.
 */
export function translate(locale: Locale) {
  const dict: Record<string, string> = locale === 'ar' ? AR : {};
  return (text: string, vars?: Vars) => {
    const out = dict[text] ?? text;
    return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out;
  };
}

const intl = (locale: Locale) => (locale === 'ar' ? 'ar-MA' : 'fr-MA');
const format = (locale: string, options: Intl.DateTimeFormatOptions, d: string | number | Date) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toLocal(d));

/** Formats d'affichage. Toutes les heures sont celles du Maroc, d'après la table fournie par le serveur (voir zone.ts). */
export const fmt = {
  mad: (n: number | null | undefined, locale: Locale) => (n == null ? '—' : `${n.toLocaleString(intl(locale))} ${locale === 'ar' ? 'درهم' : 'DH'}`),
  date: (d: string | Date | number, locale: Locale) => format(intl(locale), { weekday: 'long', day: 'numeric', month: 'long' }, d),
  shortDate: (d: string | Date | number, locale: Locale) => format(intl(locale), { day: '2-digit', month: '2-digit', year: 'numeric' }, d),
  time: (d: string | Date | number) => format('fr-MA', { hour: '2-digit', minute: '2-digit', hour12: false }, d),
  dateTime: (d: string | Date | number, locale: Locale) => `${fmt.shortDate(d, locale)} ${fmt.time(d)}`,
  monthShort: (d: string | Date | number, locale: Locale) => format(intl(locale), { month: 'short' }, d),
  dayOfMonth: (d: string | Date | number) => toLocal(d).getUTCDate(),
  /** Jour local (Maroc) au format AAAA-MM-JJ. */
  day: (d: Date | number = new Date()) => toLocal(d).toISOString().slice(0, 10),
  minutes: (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  weekday: (index: number, locale: Locale) =>
    new Intl.DateTimeFormat(intl(locale), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + index))),
};
