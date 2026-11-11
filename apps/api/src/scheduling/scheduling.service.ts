import { Injectable } from '@nestjs/common';
import type { Service, StaffMember } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { atLocalMinute, dayBounds, weekdayOf } from '../common/tz';
import { Interval, fits, slotStarts, subtract } from './intervals';

const MIN = 60_000;

export interface StaffDay {
  staff: StaffMember;
  serviceIds: Set<string>;
  work: Interval[];
  /** Tout ce qui occupe le professionnel : rendez-vous, absences, client en cours. */
  busy: Interval[];
  /** Rendez-vous actifs uniquement (utile pour la priorité au rendez-vous dans la file). */
  appointments: Interval[];
  free: Interval[];
}

export interface PlanItem {
  service: Service;
  staffId?: string | null;
}
export interface PlannedItem {
  service: Service;
  staffId: string;
  start: number;
  end: number;
}

export const ACTIVE_APPOINTMENT = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] as const;

@Injectable()
export class SchedulingService {
  constructor(private prisma: PrismaService) {}

  /** Charge, pour un jour donné, les horaires et les occupations de chaque professionnel actif du salon. */
  async loadDay(salonId: string, day: string, now = Date.now()): Promise<StaffDay[]> {
    const [dayStart, dayEnd] = dayBounds(day);
    const range = { lt: new Date(dayEnd) };
    const staff = await this.prisma.staffMember.findMany({
      where: { salonId, active: true },
      orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
      include: {
        services: true,
        workingHours: { where: { weekday: weekdayOf(day) } },
        timeOffs: { where: { startAt: range, endAt: { gt: new Date(dayStart) } } },
        appointments: {
          where: { status: { in: [...ACTIVE_APPOINTMENT] }, startAt: range, endAt: { gt: new Date(dayStart) } },
        },
        tickets: { where: { salonId, status: { in: ['CALLED', 'IN_SERVICE'] } }, include: { service: true } },
      },
    });
    return staff.map((s) => {
      const work = s.workingHours.map((w) => ({ start: atLocalMinute(day, w.startMin), end: atLocalMinute(day, w.endMin) }));
      const appointments = s.appointments.map((a) => ({
        start: a.startAt.getTime(),
        // Un rendez-vous en cours qui déborde occupe le professionnel jusqu'à maintenant au moins.
        end: a.status === 'IN_PROGRESS' ? Math.max(a.endAt.getTime(), now + MIN) : a.endAt.getTime(),
      }));
      const current = s.tickets.map((t) => {
        const from = (t.startedAt ?? t.calledAt ?? new Date(now)).getTime();
        return { start: from, end: Math.max(from + t.service.durationMin * MIN, now + MIN) };
      });
      const busy = [...appointments, ...current, ...s.timeOffs.map((t) => ({ start: t.startAt.getTime(), end: t.endAt.getTime() }))];
      const { services, workingHours, timeOffs, appointments: _a, tickets, ...member } = s;
      return {
        staff: member as StaffMember, serviceIds: new Set(services.map((x) => x.serviceId)),
        work, busy, appointments, free: subtract(work, busy),
      };
    });
  }

  /**
   * Planifie un groupe de prestations à partir d'une heure de début.
   * CONSECUTIVE : passages les uns après les autres. PARALLEL : tous en même temps, professionnels différents.
   * Retourne `null` si une seule prestation ne peut pas être placée (aucune réservation partielle).
   */
  plan(days: StaffDay[], items: PlanItem[], start: number, mode: 'CONSECUTIVE' | 'PARALLEL'): PlannedItem[] | null {
    const reserved = new Map<string, Interval[]>();
    const out: PlannedItem[] = [];
    let cursor = start;
    for (const item of items) {
      const from = mode === 'PARALLEL' ? start : cursor;
      const to = from + item.service.durationMin * MIN;
      const candidates = days
        .filter((d) => d.serviceIds.has(item.service.id) && (!item.staffId || d.staff.id === item.staffId))
        .filter((d) => fits(subtract(d.free, reserved.get(d.staff.id) ?? []), from, to))
        // À choix libre, on répartit la charge : le moins occupé d'abord.
        .sort((a, b) => a.busy.length + (reserved.get(a.staff.id)?.length ?? 0) - (b.busy.length + (reserved.get(b.staff.id)?.length ?? 0)));
      const chosen = candidates[0];
      if (!chosen) return null;
      reserved.set(chosen.staff.id, [...(reserved.get(chosen.staff.id) ?? []), { start: from, end: to }]);
      out.push({ service: item.service, staffId: chosen.staff.id, start: from, end: to });
      cursor = to;
    }
    return out;
  }

  /** Créneaux de début possibles pour une ou plusieurs prestations. */
  slots(days: StaffDay[], items: PlanItem[], mode: 'CONSECUTIVE' | 'PARALLEL', day: string, stepMin: number, notBefore: number) {
    const first = items[0];
    const [origin] = dayBounds(day);
    const candidates = new Set<number>();
    for (const d of days) {
      if (!d.serviceIds.has(first.service.id) || (first.staffId && d.staff.id !== first.staffId)) continue;
      for (const t of slotStarts(d.free, first.service.durationMin * MIN, stepMin * MIN, origin, notBefore)) candidates.add(t);
    }
    return [...candidates].sort((a, b) => a - b).flatMap((t) => {
      const planned = this.plan(days, items, t, mode);
      return planned ? [{ startAt: new Date(t).toISOString(), endAt: new Date(Math.max(...planned.map((p) => p.end))).toISOString() }] : [];
    });
  }
}
