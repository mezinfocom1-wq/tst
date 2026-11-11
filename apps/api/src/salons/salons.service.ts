import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { atLocalMinute, isValidDay, localDay, weekdayOf } from '../common/tz';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AvailabilityDto } from './salons.dto';

/** Un salon n'est public que s'il est approuvé ET que son abonnement est actif. */
export const publicSalonWhere = (now = new Date()): Prisma.SalonWhereInput => ({
  status: 'APPROVED',
  subscriptions: { some: { status: 'ACTIVE', endsAt: { gt: now } } },
});

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

export interface SearchQuery {
  q?: string; city?: string; district?: string; type?: string; category?: string;
  maxPrice?: string; minRating?: string; lat?: string; lng?: string; radiusKm?: string;
  openNow?: string; sort?: string; page?: string; pageSize?: string;
}

@Injectable()
export class SalonsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private scheduling: SchedulingService,
  ) {}

  async search(query: SearchQuery) {
    const now = Date.now();
    const today = localDay(now);
    const num = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const lat = num(query.lat), lng = num(query.lng), radius = num(query.radiusKm);
    const maxPrice = num(query.maxPrice), minRating = num(query.minRating);
    const q = query.q?.trim();
    const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });

    const serviceFilter: Prisma.ServiceWhereInput = {
      active: true,
      ...(query.category ? { category: contains(query.category) } : {}),
      ...(maxPrice !== undefined ? { priceMad: { lte: maxPrice } } : {}),
    };
    const where: Prisma.SalonWhereInput = {
      ...publicSalonWhere(new Date(now)),
      ...(query.city ? { city: contains(query.city) } : {}),
      ...(query.district ? { district: contains(query.district) } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(minRating !== undefined ? { ratingAvg: { gte: minRating } } : {}),
      ...(query.category || maxPrice !== undefined ? { services: { some: serviceFilter } } : {}),
      ...(q
        ? {
            OR: [
              { name: contains(q) }, { district: contains(q) }, { city: contains(q) },
              { services: { some: { active: true, name: contains(q) } } },
              { staff: { some: { active: true, displayName: contains(q) } } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.salon.findMany({
      where, take: 500,
      include: {
        services: { where: { active: true }, select: { priceMad: true, category: true } },
        staff: { where: { active: true }, select: { workingHours: { where: { weekday: weekdayOf(today) } } } },
      },
    });
    const weights = await this.settings.get('ranking');
    const scale = radius ?? 20;

    let items = rows.map((s) => {
      const distanceKm = lat !== undefined && lng !== undefined && s.latitude != null && s.longitude != null
        ? haversineKm(lat, lng, s.latitude, s.longitude) : null;
      const openNow = s.staff.some((m) => m.workingHours.some((w) => atLocalMinute(today, w.startMin) <= now && now < atLocalMinute(today, w.endMin)));
      const score =
        weights.distance * (distanceKm === null ? 0.5 : 1 - Math.min(distanceKm / scale, 1)) +
        weights.rating * (s.ratingAvg / 5) +
        weights.popularity * Math.min(s.ratingCount / 50, 1) +
        weights.queueOpen * (openNow ? 1 : 0);
      return {
        id: s.id, slug: s.slug, name: s.name, type: s.type, city: s.city, district: s.district, address: s.address,
        latitude: s.latitude, longitude: s.longitude, logoUrl: s.logoUrl, coverUrl: s.coverUrl,
        ratingAvg: s.ratingAvg, ratingCount: s.ratingCount, bookingEnabled: s.bookingEnabled, queueEnabled: s.queueEnabled,
        minPrice: s.services.length ? Math.min(...s.services.map((x) => x.priceMad)) : null,
        categories: [...new Set(s.services.map((x) => x.category))].slice(0, 4),
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10, openNow, score,
      };
    });
    if (radius !== undefined && lat !== undefined) items = items.filter((i) => i.distanceKm !== null && i.distanceKm <= radius);
    if (query.openNow === 'true') items = items.filter((i) => i.openNow);

    const sorters: Record<string, (a: (typeof items)[0], b: (typeof items)[0]) => number> = {
      distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
      rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
      price: (a, b) => (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9),
      recommended: (a, b) => b.score - a.score,
    };
    items.sort(sorters[query.sort ?? ''] ?? sorters.recommended);

    const pageSize = Math.min(Math.max(num(query.pageSize) ?? 20, 1), 50);
    const page = Math.max(num(query.page) ?? 1, 1);
    return {
      total: items.length, page, pageSize,
      items: items.slice((page - 1) * pageSize, page * pageSize).map(({ score, ...rest }) => rest),
    };
  }

  async cities() {
    const rows = await this.prisma.salon.groupBy({ by: ['city'], where: publicSalonWhere(), _count: true, orderBy: { _count: { city: 'desc' } } });
    return rows.map((r) => ({ city: r.city, count: r._count }));
  }

  /** Fiche publique. Un salon non publié reste consultable par son propriétaire et par le Super Admin (aperçu). */
  async detail(slugOrId: string, viewer?: { id: string; role: string }) {
    const isId = /^[0-9a-f-]{36}$/.test(slugOrId);
    const salon = await this.prisma.salon.findFirst({
      where: isId ? { id: slugOrId } : { slug: slugOrId },
      include: {
        photos: { orderBy: { position: 'asc' } },
        services: { where: { active: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        staff: {
          where: { active: true }, orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
          include: { services: { select: { serviceId: true } }, workingHours: true },
        },
        loyalty: true,
        reviews: { where: { hidden: false }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!salon) throw notFound('Salon');
    const published = !!(await this.prisma.salon.findFirst({ where: { id: salon.id, ...publicSalonWhere() }, select: { id: true } }));
    if (!published && !(viewer && (viewer.role === 'SUPER_ADMIN' || viewer.id === salon.ownerId))) throw notFound('Salon');

    const authors = await this.prisma.user.findMany({
      where: { id: { in: salon.reviews.map((r) => r.clientId) } }, select: { id: true, firstName: true },
    });
    const hours = Array.from({ length: 7 }, (_, weekday) => {
      const all = salon.staff.flatMap((s) => s.workingHours.filter((w) => w.weekday === weekday));
      return all.length ? { weekday, startMin: Math.min(...all.map((w) => w.startMin)), endMin: Math.max(...all.map((w) => w.endMin)) } : { weekday, startMin: null, endMin: null };
    });
    const { ownerId, qrToken, reviewNote, loyalty, staff, reviews, ...pub } = salon;
    return {
      ...pub, published, hours,
      loyaltyEnabled: !!loyalty?.enabled,
      staff: staff.map((s) => ({ id: s.id, displayName: s.displayName, title: s.title, photoUrl: s.photoUrl, serviceIds: s.services.map((x) => x.serviceId) })),
      reviews: reviews.map((r) => ({
        id: r.id, rating: r.rating, comment: r.comment, reply: r.reply, createdAt: r.createdAt,
        author: authors.find((a) => a.id === r.clientId)?.firstName ?? 'Client',
      })),
    };
  }

  async availability(salonId: string, dto: AvailabilityDto) {
    if (!isValidDay(dto.date)) throw badRequest('BAD_DATE', 'Date invalide');
    if (!dto.items.length) throw badRequest('NO_ITEMS', 'Choisissez au moins une prestation');
    const salon = await this.prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw notFound('Salon');
    if (!salon.bookingEnabled) return { slots: [] };
    if (dto.date < localDay() || dto.date > localDay(Date.now() + 60 * 86_400_000)) return { slots: [] };
    const services = await this.prisma.service.findMany({ where: { salonId, active: true, id: { in: dto.items.map((i) => i.serviceId) } } });
    const items = dto.items.map((i) => {
      const service = services.find((s) => s.id === i.serviceId);
      if (!service) throw badRequest('BAD_SERVICE', 'Prestation indisponible');
      return { service, staffId: i.staffId };
    });
    const days = await this.scheduling.loadDay(salonId, dto.date);
    const notBefore = Date.now() + salon.bookingLeadMin * 60_000;
    return { slots: this.scheduling.slots(days, items, dto.mode ?? 'CONSECUTIVE', dto.date, salon.slotStepMin, notBefore) };
  }
}
