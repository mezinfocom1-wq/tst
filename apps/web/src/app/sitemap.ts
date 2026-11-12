import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/server-api';

export const revalidate = 3600;

/** Plan du site pour les moteurs de recherche : pages publiques et fiches des salons publiés, en français et en arabe. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const slugs: string[] = [];
  for (let page = 1; page <= 40; page++) {
    const data = await serverApi<{ total: number; items: { slug: string }[] }>(`/salons?pageSize=50&page=${page}`, 3600);
    if (!data?.items.length) break;
    slugs.push(...data.items.map((s) => s.slug));
    if (slugs.length >= data.total) break;
  }
  const paths = ['', '/salons', '/pricing', ...slugs.map((s) => `/salons/${s}`)];
  return ['fr', 'ar'].flatMap((locale) => paths.map((path) => ({ url: `${base}/${locale}${path}`, changeFrequency: 'daily' as const })));
}
