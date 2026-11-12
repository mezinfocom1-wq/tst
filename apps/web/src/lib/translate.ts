import { AR } from './ar';

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
const TZ = 'Africa/Casablanca';

export const fmt = {
  mad: (n: number | null | undefined, locale: Locale) => (n == null ? '—' : `${n.toLocaleString(intl(locale))} ${locale === 'ar' ? 'درهم' : 'DH'}`),
  date: (d: string | Date, locale: Locale) =>
    new Intl.DateTimeFormat(intl(locale), { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(d)),
  shortDate: (d: string | Date, locale: Locale) =>
    new Intl.DateTimeFormat(intl(locale), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(new Date(d)),
  time: (d: string | Date | number) =>
    new Intl.DateTimeFormat('fr-MA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(d)),
  dateTime: (d: string | Date, locale: Locale) => `${fmt.shortDate(d, locale)} ${fmt.time(d)}`,
  /** Jour local (Maroc) au format AAAA-MM-JJ. */
  day: (d: Date | number = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)),
  minutes: (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  weekday: (index: number, locale: Locale) =>
    new Intl.DateTimeFormat(intl(locale), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + index))),
};
