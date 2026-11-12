import { Clock, MapPin, Scissors, Star } from 'lucide-react';
import Link from 'next/link';
import { SALON_TYPE } from '@/lib/labels';
import { Locale, fmt, translate } from '@/lib/translate';
import type { SalonSummary } from '@/lib/types';
import { Badge } from './ui';

export function SalonCard({ salon, locale }: { salon: SalonSummary; locale: Locale }) {
  const t = translate(locale);
  return (
    <Link href={`/${locale}/salons/${salon.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-brand-300">
      <div className="relative h-36 bg-gradient-to-br from-ink to-ink-soft">
        {salon.coverUrl && <img src={salon.coverUrl} alt="" className="size-full object-cover" loading="lazy" />}
        <div className="absolute -bottom-6 start-4 flex size-14 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface bg-brand-100 text-brand-700">
          {salon.logoUrl ? <img src={salon.logoUrl} alt="" className="size-full object-cover" /> : <Scissors className="size-6" aria-hidden />}
        </div>
        <div className="absolute end-3 top-3 flex gap-1.5">
          {salon.openNow && <Badge tone="ok">{t('Ouvert')}</Badge>}
          <Badge>{t(SALON_TYPE[salon.type])}</Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 pt-9">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug group-hover:text-brand-700">{salon.name}</h3>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
            <Star className="size-4 fill-brand-500 text-brand-500" aria-hidden />
            {salon.ratingCount ? salon.ratingAvg.toFixed(1) : t('Nouveau')}
            {salon.ratingCount > 0 && <span className="font-normal text-muted">({salon.ratingCount})</span>}
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{[salon.district, salon.city].filter(Boolean).join(', ')}</span>
          {salon.distanceKm != null && <span className="shrink-0">· {salon.distanceKm} km</span>}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2 text-sm">
          <span className="text-ink-soft">{salon.minPrice != null ? t('À partir de {price}', { price: fmt.mad(salon.minPrice, locale) }) : ''}</span>
          {salon.queueEnabled && <span className="flex items-center gap-1 text-brand-700"><Clock className="size-4" aria-hidden />{t('File d’attente')}</span>}
        </div>
      </div>
    </Link>
  );
}
