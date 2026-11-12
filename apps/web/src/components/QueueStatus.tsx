'use client';
import { Users } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

/** Affluence en direct de la file d'un salon. */
export function QueueStatus({ salonId, serviceId, staffId }: { salonId: string; serviceId?: string; staffId?: string }) {
  const { t } = useI18n();
  const qs = new URLSearchParams({ ...(serviceId ? { serviceId } : {}), ...(staffId ? { staffId } : {}) }).toString();
  const { data } = useApi<{ enabled: boolean; waiting: number; estimatedWaitMin: number | null }>(`/salons/${salonId}/queue?${qs}`, 20_000);
  if (!data?.enabled) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Users className="size-5" aria-hidden /></span>
      <div>
        <p className="font-medium text-ink">{t('{n} personne(s) en attente', { n: data.waiting })}</p>
        <p className="text-ink-soft">
          {data.estimatedWaitMin == null ? t('Plus de disponibilité aujourd’hui') : t('Attente estimée : environ {n} min', { n: data.estimatedWaitMin })}
        </p>
      </div>
    </div>
  );
}
