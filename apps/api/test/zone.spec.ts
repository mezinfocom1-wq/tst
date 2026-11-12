import { DateTime } from 'luxon';
import { localToUtc, offsetMinAt, setZoneTable, toLocal } from '../../web/src/lib/zone';
import { zoneTransitions } from '../src/health.controller';

const ZONE = 'Africa/Casablanca';
const DAY = 86_400_000;
const from = Date.UTC(2025, 0, 1), to = Date.UTC(2028, 0, 1);

describe('heure du Maroc fournie par le serveur', () => {
  const transitions = zoneTransitions(from, to);

  it('publie des décalages identiques à la base de fuseaux du serveur, heure par heure', () => {
    setZoneTable(transitions);
    for (let ts = from; ts < to; ts += 3_600_000 * 7) {
      expect(offsetMinAt(ts)).toBe(DateTime.fromMillis(ts, { zone: ZONE }).offset);
    }
  });

  it('place chaque changement à la minute exacte', () => {
    expect(transitions.length).toBeGreaterThan(1);
    for (const t of transitions.slice(1)) {
      expect(DateTime.fromMillis(t.at, { zone: ZONE }).offset).toBe(t.offsetMin);
      expect(DateTime.fromMillis(t.at - 60_000, { zone: ZONE }).offset).not.toBe(t.offsetMin);
    }
  });

  it("affiche l'heure locale d'après la table, même si elle contredit la base de fuseaux de l'appareil", () => {
    // Un appareil « périmé » croit à UTC+1 ; la table du serveur dit UTC+0 : c'est la table qui gagne.
    setZoneTable([{ at: Date.UTC(2026, 0, 1), offsetMin: 0 }]);
    expect(toLocal('2026-11-13T09:45:00Z').toISOString()).toBe('2026-11-13T09:45:00.000Z');
    setZoneTable([{ at: Date.UTC(2026, 0, 1), offsetMin: 60 }]);
    expect(toLocal('2026-11-13T09:45:00Z').toISOString()).toBe('2026-11-13T10:45:00.000Z');
  });

  it("convertit une saisie locale en instant UTC, y compris autour d'un changement d'heure", () => {
    setZoneTable(transitions);
    for (let ts = from + DAY; ts < to - DAY; ts += 3_600_000 * 5) {
      const local = DateTime.fromMillis(ts, { zone: ZONE });
      const back = localToUtc(local.toFormat('yyyy-LL-dd'), local.toFormat('HH:mm')).getTime();
      // Égalité stricte, sauf pendant l'heure répétée d'un retour en arrière (ambiguë par nature).
      if (back !== Math.floor(ts / 60_000) * 60_000) {
        expect(DateTime.fromMillis(back, { zone: ZONE }).toFormat('yyyy-LL-dd HH:mm')).toBe(local.toFormat('yyyy-LL-dd HH:mm'));
      }
    }
  });

  it("retombe sur la base de fuseaux de l'appareil tant que la table n'est pas chargée", () => {
    setZoneTable([]);
    const ts = Date.UTC(2026, 6, 1, 12);
    expect(offsetMinAt(ts)).toBe(DateTime.fromMillis(ts, { zone: ZONE }).offset);
  });
});
