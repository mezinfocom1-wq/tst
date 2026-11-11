import { DateTime } from 'luxon';
import { config } from './config';

export const ZONE = config.timezone;

/** Jour local (Maroc) au format AAAA-MM-JJ. */
export const localDay = (d: Date | number = new Date()) =>
  DateTime.fromJSDate(new Date(d), { zone: ZONE }).toFormat('yyyy-LL-dd');

export const isValidDay = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && DateTime.fromISO(day, { zone: ZONE }).isValid;

/** Début et fin (exclus) d'un jour local, en millisecondes UTC. */
export function dayBounds(day: string): [number, number] {
  const start = DateTime.fromISO(day, { zone: ZONE }).startOf('day');
  return [start.toMillis(), start.plus({ days: 1 }).toMillis()];
}

/** Instant correspondant à `minutes` après minuit, heure locale, pour un jour donné. */
export const atLocalMinute = (day: string, minutes: number) =>
  DateTime.fromISO(day, { zone: ZONE }).startOf('day').plus({ minutes }).toMillis();

/** Jour de la semaine local : 0 = dimanche … 6 = samedi. */
export const weekdayOf = (day: string) => DateTime.fromISO(day, { zone: ZONE }).weekday % 7;

export const formatLocal = (d: Date, locale = 'fr') =>
  DateTime.fromJSDate(d, { zone: ZONE })
    .setLocale(locale === 'ar' ? 'ar-MA' : 'fr')
    .toFormat("cccc d LLLL 'à' HH:mm");
