import type { Tone } from '@/components/ui';

/** Libellés français des statuts (clés de traduction) et couleur associée. */
export const SALON_TYPE: Record<string, string> = { MEN: 'Homme', WOMEN: 'Femme', MIXED: 'Mixte', KIDS: 'Enfants' };

export const SALON_STATUS: Record<string, [string, Tone]> = {
  DRAFT: ['Brouillon', 'neutral'], PENDING_REVIEW: ['En attente de vérification', 'warn'],
  INFO_REQUESTED: ['Informations complémentaires demandées', 'info'], APPROVED: ['Approuvé', 'ok'],
  REJECTED: ['Refusé', 'danger'], SUSPENDED: ['Suspendu', 'danger'],
};
export const APPOINTMENT_STATUS: Record<string, [string, Tone]> = {
  CONFIRMED: ['Confirmé', 'info'], CHECKED_IN: ['Arrivé', 'brand'], IN_PROGRESS: ['En cours', 'warn'],
  COMPLETED: ['Terminé', 'ok'], CANCELLED: ['Annulé', 'neutral'], NO_SHOW: ['Absent', 'danger'],
};
export const TICKET_STATUS: Record<string, [string, Tone]> = {
  WAITING: ['En attente', 'info'], CALLED: ['Appelé', 'brand'], IN_SERVICE: ['En cours', 'warn'],
  DONE: ['Terminé', 'ok'], CANCELLED: ['Annulé', 'neutral'], NO_SHOW: ['Absent', 'danger'],
};
export const PAYMENT_STATUS: Record<string, [string, Tone]> = {
  PENDING: ['En attente', 'neutral'], TO_VERIFY: ['À vérifier', 'warn'], VALIDATED: ['Validé', 'ok'], REJECTED: ['Refusé', 'danger'],
};
export const SUBSCRIPTION_STATUS: Record<string, [string, Tone]> = {
  PENDING: ['En attente', 'neutral'], ACTIVE: ['Actif', 'ok'], EXPIRED: ['Expiré', 'danger'],
  SUSPENDED: ['Suspendu', 'danger'], CANCELLED: ['Annulé', 'neutral'],
};
export const APPLICATION_STATUS: Record<string, [string, Tone]> = {
  PENDING: ['En attente', 'warn'], INFO_REQUESTED: ['Informations complémentaires demandées', 'info'],
  APPROVED: ['Acceptée', 'ok'], REJECTED: ['Refusée', 'danger'],
};
export const COMPLAINT_STATUS: Record<string, [string, Tone]> = {
  OPEN: ['Ouverte', 'warn'], IN_PROGRESS: ['En cours', 'info'], RESOLVED: ['Résolue', 'ok'],
};
export const CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Mohammedia', 'El Jadida', 'Nador', 'Béni Mellal', 'Safi'];
