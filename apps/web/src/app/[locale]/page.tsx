import { CalendarCheck, MapPin, QrCode, Search, Sparkles, Ticket } from 'lucide-react';
import Link from 'next/link';
import { SalonCard } from '@/components/SalonCard';
import { buttonClass } from '@/components/styles';
import { CITIES } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { Locale, translate } from '@/lib/translate';
import type { SalonSummary } from '@/lib/types';

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = translate(locale);
  const [featured, cities] = await Promise.all([
    serverApi<{ items: SalonSummary[] }>('/salons?pageSize=6'),
    serverApi<{ city: string; count: number }[]>('/salons/cities'),
  ]);
  const steps = [
    { icon: Search, title: t('Trouvez'), text: t('Comparez les salons par quartier, prix, avis et disponibilité.') },
    { icon: CalendarCheck, title: t('Réservez'), text: t('Choisissez votre prestation, votre coiffeur et votre créneau en quelques secondes.') },
    { icon: Ticket, title: t('Ou prenez un ticket'), text: t('Rejoignez la file d’attente à distance et suivez votre tour en direct.') },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60rem_30rem_at_80%_-10%,#c58a2b,transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-brand-300">
            <Sparkles className="size-3.5" aria-hidden /> {t('Coiffeurs et barbiers au Maroc')}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">{t('Votre coiffeur, sans attendre.')}</h1>
          <p className="mt-4 max-w-xl text-lg text-white/70">{t('Réservez un rendez-vous ou prenez un ticket de file d’attente dans les meilleurs salons du Maroc.')}</p>
          <form action={`/${locale}/salons`} className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 sm:flex-row">
            <label className="flex flex-1 items-center gap-2 rounded-xl px-3 text-ink">
              <Search className="size-5 text-muted" aria-hidden />
              <input name="q" placeholder={t('Salon, prestation, coiffeur…')} className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted" aria-label={t('Rechercher')} />
            </label>
            <label className="flex items-center gap-2 rounded-xl border-line px-3 text-ink sm:border-s">
              <MapPin className="size-5 text-muted" aria-hidden />
              <select name="city" className="h-11 bg-transparent text-sm outline-none" aria-label={t('Ville')} defaultValue="">
                <option value="">{t('Toutes les villes')}</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button className={buttonClass('brand', 'md')}>{t('Rechercher')}</button>
          </form>
          {!!cities?.length && (
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              {cities.slice(0, 6).map((c) => (
                <Link key={c.city} href={`/${locale}/salons?city=${encodeURIComponent(c.city)}`} className="rounded-full border border-white/15 px-3 py-1 text-white/80 hover:bg-white/10">
                  {c.city} <span className="text-white/50">({c.count})</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><s.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {!!featured?.items.length && (
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold">{t('Salons recommandés')}</h2>
            <Link href={`/${locale}/salons`} className="text-sm font-medium text-brand-700 hover:underline">{t('Tout voir')}</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((s) => <SalonCard key={s.id} salon={s} locale={locale} />)}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-brand-50 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-brand-300"><QrCode className="size-6" aria-hidden /></span>
            <div>
              <h2 className="text-xl font-semibold">{t('Vous êtes coiffeur ou barbier ?')}</h2>
              <p className="mt-1 max-w-xl text-sm text-ink-soft">{t('Gérez vos rendez-vous, votre file d’attente et vos clients fidèles depuis un seul espace.')}</p>
            </div>
          </div>
          <Link href={`/${locale}/pricing`} className={buttonClass('primary', 'lg')}>{t('Découvrir les offres')}</Link>
        </div>
      </section>
    </>
  );
}
