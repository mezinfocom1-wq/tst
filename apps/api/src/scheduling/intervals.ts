/** Intervalle de temps [start, end[ en millisecondes UTC. Fonctions pures, testées unitairement. */
export interface Interval {
  start: number;
  end: number;
}

export function merge(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Retire les périodes occupées des périodes de travail. */
export function subtract(base: Interval[], busy: Interval[]): Interval[] {
  const blocks = merge(busy);
  const out: Interval[] = [];
  for (const b of merge(base)) {
    let cursor = b.start;
    for (const x of blocks) {
      if (x.end <= cursor) continue;
      if (x.start >= b.end) break;
      if (x.start > cursor) out.push({ start: cursor, end: x.start });
      cursor = Math.max(cursor, x.end);
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out;
}

export const fits = (free: Interval[], start: number, end: number) =>
  free.some((f) => f.start <= start && end <= f.end);

/** Premier instant ≥ `from` où une durée tient entièrement dans une période libre. */
export function earliestFit(free: Interval[], from: number, duration: number): number | null {
  for (const f of free) {
    const start = Math.max(f.start, from);
    if (start + duration <= f.end) return start;
  }
  return null;
}

/** Débuts de créneaux possibles, alignés sur une grille de `step` à partir de `origin`. */
export function slotStarts(free: Interval[], duration: number, step: number, origin: number, notBefore: number): number[] {
  const out: number[] = [];
  for (const f of free) {
    const from = Math.max(f.start, notBefore);
    let t = origin + Math.ceil((from - origin) / step) * step;
    for (; t + duration <= f.end; t += step) out.push(t);
  }
  return out;
}
