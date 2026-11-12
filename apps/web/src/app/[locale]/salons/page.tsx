'use client';
import { LocateFixed, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SalonCard } from '@/components/SalonCard';
import { SalonMap } from '@/components/SalonMap';
import { Button, Empty, Field, Input, Select, Spinner, cx } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { CITIES, SALON_TYPE } from '@/lib/labels';
import type { SalonSummary } from '@/lib/types';

const KEYS = ['q', 'city', 'district', 'type', 'category', 'maxPrice', 'minRating', 'openNow', 'sort', 'lat', 'lng', 'radiusKm', 'page'] as const;
type Filters = Partial<Record<(typeof KEYS)[number], string>>;

function SearchPage() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const filters: Filters = Object.fromEntries(KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])));
  const [q, setQ] = useState(filters.q ?? '');
  const [showMap, setShowMap] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const query = new URLSearchParams(filters as Record<string, string>).toString();
  const { data, loading } = useApi<{ total: number; page: number; pageSize: number; items: SalonSummary[] }>(`/salons?${query}`);

  useEffect(() => setQ(filters.q ?? ''), [filters.q]);

  const update = (patch: Filters) => {
    const next = { ...filters, page: undefined, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    router.replace(`/${locale}/salons${qs ? `?${qs}` : ''}`, { scroll: false });
  };
  const nearMe = () => {
    if (filters.lat) return update({ lat: undefined, lng: undefined, radiusKm: undefined, sort: undefined });
    navigator.geolocation?.getCurrentPosition(
      (pos) => update({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), radiusKm: '10', sort: 'distance' }),
      () => setGeoError(true),
    );
  };
  const points = (data?.items ?? []).filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ id: s.id, lat: s.latitude!, lng: s.longitude!, label: s.name, href: `/${locale}/salons/${s.slug}` }));
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold">{t('Trouver un salon')}</h1>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-3 size-5 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Salon, prestation, coiffeur…')} className="ps-10" aria-label={t('Rechercher')} />
        </div>
        <Select value={filters.city ?? ''} onChange={(e) => update({ city: e.target.value })} className="sm:w-48" aria-label={t('Ville')}>
          <option value="">{t('Toutes les villes')}</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Button type="submit" variant="brand">{t('Rechercher')}</Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={filters.lat ? 'primary' : 'outline'} size="sm" onClick={nearMe}><LocateFixed className="size-4" />{t('Autour de moi')}</Button>
        <Button variant={filters.openNow ? 'primary' : 'outline'} size="sm" onClick={() => update({ openNow: filters.openNow ? undefined : 'true' })}>{t('Ouvert maintenant')}</Button>
        <Button variant={showFilters ? 'primary' : 'outline'} size="sm" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal className="size-4" />{t('Filtres')}</Button>
        <Button variant={showMap ? 'primary' : 'outline'} size="sm" onClick={() => setShowMap(!showMap)}><MapIcon className="size-4" />{t('Carte')}</Button>
        <Select value={filters.sort ?? 'recommended'} onChange={(e) => update({ sort: e.target.value })} className="ms-auto h-9 w-auto" aria-label={t('Trier')}>
          <option value="recommended">{t('Recommandés')}</option>
          <option value="rating">{t('Mieux notés')}</option>
          <option value="price">{t('Prix croissant')}</option>
          {filters.lat && <option value="distance">{t('Plus proches')}</option>}
        </Select>
      </div>
      {geoError && <p className="mt-2 text-sm text-danger">{t('Localisation indisponible. Autorisez l’accès à votre position ou choisissez une ville.')}</p>}

      {showFilters && (
        <div className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('Quartier')}><Input defaultValue={filters.district} onBlur={(e) => update({ district: e.target.value })} placeholder="Maârif, Agdal…" /></Field>
          <Field label={t('Type de salon')}>
            <Select value={filters.type ?? ''} onChange={(e) => update({ type: e.target.value })}>
              <option value="">{t('Tous')}</option>
              {Object.entries(SALON_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </Select>
          </Field>
          <Field label={t('Prestation')}><Input defaultValue={filters.category} onBlur={(e) => update({ category: e.target.value })} placeholder={t('Coupe, Barbe, Couleur…')} /></Field>
          <Field label={t('Prix maximum (DH)')}><Input type="number" min={0} defaultValue={filters.maxPrice} onBlur={(e) => update({ maxPrice: e.target.value })} /></Field>
          <Field label={t('Note minimale')}>
            <Select value={filters.minRating ?? ''} onChange={(e) => update({ minRating: e.target.value })}>
              <option value="">{t('Toutes')}</option>
              {[3, 4, 4.5].map((n) => <option key={n} value={n}>{n}+ ★</option>)}
            </Select>
          </Field>
          {filters.lat && (
            <Field label={t('Distance maximale')}>
              <Select value={filters.radiusKm ?? '10'} onChange={(e) => update({ radiusKm: e.target.value })}>
                {[2, 5, 10, 25, 50].map((n) => <option key={n} value={n}>{n} km</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {showMap && <div className="mt-5"><SalonMap points={points} height={380} /></div>}

      <div className="mt-6">
        {loading ? <Spinner /> : !data?.items.length ? (
          <Empty icon={<Search className="size-8" />} title={t('Aucun salon ne correspond à votre recherche')}>{t('Essayez une autre ville ou retirez des filtres.')}</Empty>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">{t('{n} salon(s) trouvé(s)', { n: data.total })}</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((s) => <SalonCard key={s.id} salon={s} locale={locale} />)}
            </div>
            {pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => update({ page: String(p) })}
                    className={cx('size-10 rounded-xl text-sm font-medium', p === data.page ? 'bg-ink text-white' : 'border border-line bg-surface hover:bg-sand-deep')}>{p}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Spinner />}><SearchPage /></Suspense>;
}
