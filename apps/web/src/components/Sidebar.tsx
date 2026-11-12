'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './styles';

export interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }

/** Navigation d'un espace de gestion : colonne sur grand écran, bandeau défilant sur mobile. */
export function Sidebar({ items, base }: { items: NavItem[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-e lg:p-4">
      {items.map((i) => {
        const active = i.href === base ? pathname === base : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href}
            className={cx('flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition', active ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:bg-sand-deep')}>
            <i.icon className="size-4.5 shrink-0" />
            <span className="flex-1">{i.label}</span>
            {i.badge ? <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-medium text-white">{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
