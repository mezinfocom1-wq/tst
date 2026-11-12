/**
 * Heure du Maroc fournie par le serveur.
 *
 * Les règles du fuseau marocain changent (heure du Ramadan, décisions gouvernementales) et un navigateur ou
 * un téléphone dont la base de fuseaux n'est pas à jour afficherait un rendez-vous avec une heure d'écart.
 * L'API publie donc le décalage UTC applicable à chaque période ; l'affichage s'appuie sur cette table
 * et ne recourt à la base de fuseaux de l'appareil qu'en secours, avant son chargement.
 *
 * Ce fichier est copié à l'identique dans l'application mobile (scripts/sync-i18n.mjs).
 */
export interface ZoneTransition {
  /** Instant (ms UTC) à partir duquel le décalage s'applique. */
  at: number;
  offsetMin: number;
}

const ZONE = 'Africa/Casablanca';
let table: ZoneTransition[] = [];

export function setZoneTable(transitions: ZoneTransition[]) {
  table = [...transitions].sort((a, b) => a.at - b.at);
}

function deviceOffsetMin(ts: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60_000);
}

/** Décalage du Maroc par rapport à UTC, en minutes, à un instant donné. */
export function offsetMinAt(ts: number): number {
  if (!table.length || ts < table[0].at) return deviceOffsetMin(ts);
  let offset = table[0].offsetMin;
  for (const t of table) {
    if (t.at > ts) break;
    offset = t.offsetMin;
  }
  return offset;
}

/**
 * Date « décalée » : ses composantes UTC sont l'heure locale du Maroc.
 * À lire avec les accesseurs UTC ou à formater avec `timeZone: 'UTC'`.
 */
export function toLocal(d: string | number | Date): Date {
  const ts = new Date(d).getTime();
  return new Date(ts + offsetMinAt(ts) * 60_000);
}

/** Convertit une date (AAAA-MM-JJ) et une heure (HH:MM) saisies en heure du Maroc vers un instant UTC. */
export function localToUtc(day: string, time: string): Date {
  const wall = new Date(`${day}T${time}:00Z`).getTime();
  let ts = wall - offsetMinAt(wall) * 60_000;
  ts = wall - offsetMinAt(ts) * 60_000;
  return new Date(ts);
}
