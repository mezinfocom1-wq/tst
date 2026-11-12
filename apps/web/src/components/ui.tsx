'use client';
import { Loader2, Star, X } from 'lucide-react';
import { useEffect } from 'react';

import { SIZES, VARIANTS, buttonClass, cx } from './styles';
export { buttonClass, cx };

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  busy?: boolean;
};

export function Button({ variant = 'primary', size = 'md', busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={cx(buttonClass(variant, size), className)} disabled={disabled || busy} {...rest}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const inputClass = 'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none';

export function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export const Input = ({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={cx(inputClass, className)} {...rest} />;
export const Select = ({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(inputClass, className)} {...rest} />;
export const Textarea = ({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cx(inputClass, 'h-auto min-h-24 py-2.5', className)} {...rest} />
);

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm text-ink-soft">{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'start-[1.375rem]' : 'start-0.5')} />
      </button>
    </label>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>{children}</div>;
}

const TONES = {
  neutral: 'bg-sand-deep text-ink-soft', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info', brand: 'bg-brand-100 text-brand-700',
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>;
}

export function Alert({ tone = 'danger', children }: { tone?: Tone; children: React.ReactNode }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-sm', TONES[tone])}>{children}</div>;
}

export const Spinner = () => (
  <div className="flex justify-center py-16"><Loader2 className="size-7 animate-spin text-brand-600" aria-label="Chargement" /></div>
);

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} width={size} height={size} className={i <= Math.round(value) ? 'fill-brand-500 text-brand-500' : 'text-line'} aria-hidden />
      ))}
    </span>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="text-brand-600">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-sand-deep" aria-label="Fermer"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Tableau simple, défilant horizontalement sur petit écran. */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs uppercase tracking-wide text-muted">
            {head.map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">{children}</tbody>
      </table>
    </Card>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-sand-deep p-1" role="tablist">
      {items.map((i) => (
        <button
          key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition', value === i.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {i.label}
          {i.count ? <span className="ms-2 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
