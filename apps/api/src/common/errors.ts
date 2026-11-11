import { HttpException } from '@nestjs/common';

/** Erreur métier : `code` stable pour les clients (traduction), `message` lisible en français. */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
