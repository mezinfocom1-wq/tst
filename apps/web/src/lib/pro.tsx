'use client';
import { createContext, useContext } from 'react';

export interface ProSalon {
  id: string; slug: string; name: string; description: string; type: string; phone: string | null; email: string | null;
  address: string; city: string; district: string | null; latitude: number | null; longitude: number | null;
  logoUrl: string | null; coverUrl: string | null; brandColor: string | null; status: string; reviewNote: string | null;
  bookingEnabled: boolean; queueEnabled: boolean; queueOnsiteOnly: boolean; allowRequeue: boolean;
  lateToleranceMin: number; cancelMinHours: number; bookingLeadMin: number; slotStepMin: number;
  ratingAvg: number; ratingCount: number; photos: { id: string; url: string }[]; isOwner: boolean; published: boolean; qrUrl: string;
  features: { maxStaff: number; maxPhotos: number; customBranding: boolean; statistics: boolean; advancedStatistics: boolean; loyalty: boolean; groupBooking: boolean };
  subscription: { status: string; endsAt: string; plan: string } | null;
  counts: { services: number; staff: number };
}

export const ProContext = createContext<{ salon: ProSalon; reload: () => Promise<void> }>(null as never);
export const usePro = () => useContext(ProContext);

/** Convertit une date et une heure saisies en heure du Maroc vers un instant ISO (UTC). */
export function casablancaToIso(day: string, time: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const shown = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', dateStyle: 'short', timeStyle: 'medium' }).format(guess);
  const offset = new Date(`${shown.replace(' ', 'T')}Z`).getTime() - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}
