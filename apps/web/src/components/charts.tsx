'use client';
import { useState } from 'react';
import { cx } from './styles';

export interface Datum { label: string; value: number; hint?: string }

/**
 * Histogramme à une seule série (une seule teinte, donc pas de légende : le titre nomme la série).
 * Barres fines à sommet arrondi, grille discrète, valeur au survol, et tableau accessible aux lecteurs d'écran.
 */
export function BarChart({ data, format = String, height = 180, title }: { data: Datum[]; format?: (n: number) => string; height?: number; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.max(1, Math.ceil(data.length / 8));
  return (
    <figure>
      <div className="relative" style={{ height }} role="img" aria-label={title}>
        {[0.5, 1].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }}>
            <span className="absolute -top-2 end-0 bg-surface ps-1 text-[10px] tabular-nums text-muted">{format(Math.round(max * g))}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5 border-b border-line pe-10">
          {data.map((d, i) => (
            <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={cx('w-full max-w-6 rounded-t transition-colors', hover === i ? 'bg-brand-700' : 'bg-brand-500')} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg">
                  <span className="font-semibold tabular-nums">{format(d.value)}</span> <span className="text-white/70">· {d.hint ?? d.label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-0.5 pe-10 text-[10px] text-muted">
        {data.map((d, i) => <span key={d.label} className="flex-1 truncate text-center">{i % step === 0 ? d.label : ''}</span>)}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.hint ?? d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Classement horizontal : la longueur de la barre porte la grandeur, la valeur est écrite en clair. */
export function BarList({ data, format = String }: { data: Datum[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-ink-soft">{d.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{format(d.value)}{d.hint ? <span className="font-normal text-muted"> · {d.hint}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-sand-deep"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
