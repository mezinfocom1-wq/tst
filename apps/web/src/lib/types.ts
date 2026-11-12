export interface SalonSummary {
  id: string; slug: string; name: string; type: string; city: string; district: string | null; address: string;
  latitude: number | null; longitude: number | null; logoUrl: string | null; coverUrl: string | null;
  ratingAvg: number; ratingCount: number; bookingEnabled: boolean; queueEnabled: boolean;
  minPrice: number | null; categories: string[]; distanceKm: number | null; openNow: boolean;
}
export interface Service { id: string; name: string; description: string | null; category: string; durationMin: number; priceMad: number; active: boolean }
export interface Staff { id: string; displayName: string; title: string | null; photoUrl: string | null; serviceIds: string[] }
export interface Review { id: string; rating: number; comment: string | null; reply: string | null; createdAt: string; author: string }
export interface SalonDetail extends Omit<SalonSummary, 'minPrice' | 'categories' | 'distanceKm' | 'openNow'> {
  description: string; phone: string | null; email: string | null; brandColor: string | null; published: boolean;
  queueOnsiteOnly: boolean; cancelMinHours: number; loyaltyEnabled: boolean;
  photos: { id: string; url: string }[]; services: Service[]; staff: Staff[]; reviews: Review[];
  hours: { weekday: number; startMin: number | null; endMin: number | null }[];
}
