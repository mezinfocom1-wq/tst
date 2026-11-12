import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { buttonClass, cx } from '@/components/styles';
import { serverApi } from '@/lib/server-api';
import { Locale, fmt, translate } from '@/lib/translate';

interface Plan { id: string; code: string; name: string; description: string; priceMad: number; durationDays: number; features: Record<string, number | boolean> }

export default async function Pricing({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = translate(locale);
  const plans = (await serverApi<Plan[]>('/plans', 60)) ?? [];
  const rows: [string, (f: Plan['features']) => string | boolean][] = [
    [t('Page publique, prestations et tarifs'), () => true],
    [t('Rendez-vous en ligne et file d’attente avec QR Code'), () => true],
    [t('Professionnels'), (f) => String(f.maxStaff ?? 1)],
    [t('Photos du salon'), (f) => String(f.maxPhotos ?? 3)],
    [t('Couverture et couleur personnalisées'), (f) => !!f.customBranding],
    [t('Réservation de groupe'), (f) => !!f.groupBooking],
    [t('Programme de fidélité'), (f) => !!f.loyalty],
    [t('Statistiques'), (f) => !!f.statistics],
    [t('Statistiques avancées (équipe, affluence, attente)'), (f) => !!f.advancedStatistics],
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold">{t('Un espace complet pour votre salon')}</h1>
        <p className="mt-3 text-ink-soft">{t('Rendez-vous, file d’attente, clients fidèles et statistiques. Sans commission sur vos prestations.')}</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((p, i) => (
          <div key={p.id} className={cx('flex flex-col rounded-3xl border bg-surface p-7 shadow-card', i === 1 ? 'border-brand-500 ring-2 ring-brand-100' : 'border-line')}>
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-muted">{p.description}</p>
            <p className="mt-5"><span className="font-display text-4xl font-semibold tabular-nums">{fmt.mad(p.priceMad, locale)}</span> <span className="text-sm text-muted">/ {p.durationDays} {t('jours')}</span></p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {rows.map(([label, get]) => {
                const v = get(p.features);
                return (
                  <li key={label} className={cx('flex items-start gap-2', v === false && 'text-muted')}>
                    {v === false ? <X className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />}
                    <span>{label}{typeof v === 'string' ? ` : ${v}` : ''}</span>
                  </li>
                );
              })}
            </ul>
            <Link href={`/${locale}/become-pro`} className={cx(buttonClass(i === 1 ? 'brand' : 'primary', 'lg'), 'mt-7')}>{t('Demander un accès')}</Link>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
        {t('Paiement par virement bancaire. Votre abonnement est activé après vérification de votre paiement, et votre salon est publié après validation de votre dossier.')}
      </p>
    </div>
  );
}
