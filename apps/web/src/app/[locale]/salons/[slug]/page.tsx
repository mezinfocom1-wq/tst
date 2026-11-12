import { CalendarCheck, Clock, Gift, Mail, MapPin, Phone, Scissors, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QueueStatus } from '@/components/QueueStatus';
import { SalonMap } from '@/components/SalonMap';
import { buttonClass } from '@/components/styles';
import { Badge, Card, Stars } from '@/components/ui';
import { SALON_TYPE } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { Locale, fmt, translate } from '@/lib/translate';
import type { SalonDetail } from '@/lib/types';

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const salon = await serverApi<SalonDetail>(`/salons/${slug}`);
  return salon ? { title: `${salon.name} — ${salon.city}`, description: salon.description.slice(0, 160) } : {};
}

export default async function SalonPage({ params }: Props) {
  const { locale, slug } = await params;
  const salon = await serverApi<SalonDetail>(`/salons/${slug}`);
  if (!salon) notFound();
  const t = translate(locale);
  const base = `/${locale}/salons/${salon.slug}`;
  const categories = [...new Set(salon.services.map((s) => s.category))];
  const accent = salon.brandColor ?? undefined;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'HairSalon', name: salon.name, description: salon.description,
    address: { '@type': 'PostalAddress', streetAddress: salon.address, addressLocality: salon.city, addressCountry: 'MA' },
    telephone: salon.phone ?? undefined,
    ...(salon.latitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: salon.latitude, longitude: salon.longitude } } : {}),
    ...(salon.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: salon.ratingAvg, reviewCount: salon.ratingCount } } : {}),
  };

  return (
    <div className="pb-24 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="h-44 bg-gradient-to-br from-ink to-ink-soft sm:h-64" style={accent ? { background: accent } : undefined}>
        {salon.coverUrl && <img src={salon.coverUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <div className="-mt-10 flex items-start gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-sand bg-brand-100 text-brand-700 shadow-card">
            {salon.logoUrl ? <img src={salon.logoUrl} alt="" className="size-full object-cover" /> : <Scissors className="size-9" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 pt-12">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold">{salon.name}</h1>
              <Badge>{t(SALON_TYPE[salon.type])}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              <span className="flex items-center gap-1.5"><Stars value={salon.ratingAvg} />{salon.ratingCount ? `${salon.ratingAvg.toFixed(1)} (${salon.ratingCount})` : t('Nouveau')}</span>
              <span className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{[salon.address, salon.city].filter(Boolean).join(', ')}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-10">
            {salon.description && <p className="whitespace-pre-line leading-relaxed text-ink-soft">{salon.description}</p>}

            {!!salon.photos.length && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {salon.photos.map((p) => <img key={p.id} src={p.url} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" loading="lazy" />)}
              </div>
            )}

            <section id="services">
              <h2 className="mb-4 text-2xl font-semibold">{t('Prestations et tarifs')}</h2>
              <div className="space-y-6">
                {categories.map((cat) => (
                  <div key={cat}>
                    <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{cat}</h3>
                    <Card className="divide-y divide-line">
                      {salon.services.filter((s) => s.category === cat).map((s) => (
                        <div key={s.id} className="flex items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{s.name}</p>
                            {s.description && <p className="text-sm text-muted">{s.description}</p>}
                            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Clock className="size-3.5" aria-hidden />{s.durationMin} min</p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums">{fmt.mad(s.priceMad, locale)}</p>
                          {salon.bookingEnabled && <Link href={`${base}/book?service=${s.id}`} className={buttonClass('outline', 'sm')}>{t('Réserver')}</Link>}
                        </div>
                      ))}
                    </Card>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold">{t('L’équipe')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {salon.staff.map((m) => (
                  <Card key={m.id} className="flex items-center gap-4 p-4">
                    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                      {m.photoUrl ? <img src={m.photoUrl} alt="" className="size-full object-cover" /> : m.displayName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{m.displayName}</p>
                      <p className="text-sm text-muted">{m.title ?? t('Coiffeur')} · {t('{n} prestation(s)', { n: m.serviceIds.length })}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold">{t('Avis')}</h2>
              {!salon.reviews.length ? <p className="text-sm text-muted">{t('Pas encore d’avis. Les avis sont publiés par des clients après leur prestation.')}</p> : (
                <div className="space-y-3">
                  {salon.reviews.map((r) => (
                    <Card key={r.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{r.author}</p>
                        <span className="text-xs text-muted">{fmt.shortDate(r.createdAt, locale)}</span>
                      </div>
                      <Stars value={r.rating} size={14} />
                      {r.comment && <p className="mt-2 text-sm text-ink-soft">{r.comment}</p>}
                      {r.reply && <p className="mt-3 rounded-xl bg-sand-deep p-3 text-sm text-ink-soft"><span className="font-medium text-ink">{t('Réponse du salon')} : </span>{r.reply}</p>}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-3 p-5">
              {salon.bookingEnabled && <Link href={`${base}/book`} className={`${buttonClass('primary', 'lg')} w-full`}><CalendarCheck className="size-5" aria-hidden />{t('Réserver un rendez-vous')}</Link>}
              {salon.queueEnabled && <Link href={`${base}/queue`} className={`${buttonClass('brand', 'lg')} w-full`}><Ticket className="size-5" aria-hidden />{t('Rejoindre la file d’attente')}</Link>}
              {salon.queueEnabled && <QueueStatus salonId={salon.id} />}
              {salon.loyaltyEnabled && <p className="flex items-center gap-2 text-sm text-ink-soft"><Gift className="size-4 text-brand-600" aria-hidden />{t('Programme de fidélité : cumulez des points à chaque visite.')}</p>}
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">{t('Horaires')}</h3>
              <ul className="space-y-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const h = salon.hours.find((x) => x.weekday === d);
                  return (
                    <li key={d} className="flex justify-between gap-4">
                      <span className="capitalize text-ink-soft">{fmt.weekday(d, locale)}</span>
                      <span className="tabular-nums">{h?.startMin != null ? `${fmt.minutes(h.startMin)} – ${fmt.minutes(h.endMin!)}` : t('Fermé')}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card className="space-y-3 p-5 text-sm">
              <h3 className="font-semibold">{t('Contact et accès')}</h3>
              {salon.phone && <a href={`tel:${salon.phone}`} className="flex items-center gap-2 text-ink-soft hover:text-ink"><Phone className="size-4" aria-hidden /><span dir="ltr">{salon.phone}</span></a>}
              {salon.email && <a href={`mailto:${salon.email}`} className="flex items-center gap-2 text-ink-soft hover:text-ink"><Mail className="size-4" aria-hidden />{salon.email}</a>}
              <p className="flex items-start gap-2 text-ink-soft"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[salon.address, salon.district, salon.city].filter(Boolean).join(', ')}</p>
              {salon.latitude != null && salon.longitude != null && (
                <>
                  <SalonMap points={[{ id: salon.id, lat: salon.latitude, lng: salon.longitude, label: salon.name }]} height={200} />
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">{t('Itinéraire')}</a>
                </>
              )}
            </Card>
          </aside>
        </div>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface p-3 lg:hidden">
        {salon.bookingEnabled && <Link href={`${base}/book`} className={`${buttonClass('primary', 'md')} flex-1`}>{t('Réserver')}</Link>}
        {salon.queueEnabled && <Link href={`${base}/queue`} className={`${buttonClass('brand', 'md')} flex-1`}>{t('File d’attente')}</Link>}
      </div>
    </div>
  );
}
