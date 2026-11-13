import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './common/config';
import type { NextFunction, Request, Response } from 'express';
import { StorageService, UPLOAD_ROOT } from './common/storage.service';
import { join } from 'path';

/** Configuration commune à l'application réelle et aux tests. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', config.trustProxy);
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: [config.webUrl], credentials: true });
  // Les propriétés inconnues sont rejetées : aucune donnée non prévue n'atteint le code métier.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Pilote de stockage « db » : les fichiers publics sont lus dans la base (identifiants aléatoires, donc cache long).
  express.use('/uploads/public', async (req: Request, res: Response, next: NextFunction) => {
    if (config.storage.driver !== 'db' || req.method !== 'GET') return next();
    const file = await app.get(StorageService).readPublicFromDb(`public${req.path}`).catch(() => null);
    if (!file) return next();
    res.set({ 'content-type': file.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }).send(file.buffer);
  });
  // Seul le dossier public est servi ; les preuves de paiement passent par une route authentifiée.
  express.useStaticAssets(join(UPLOAD_ROOT, 'public'), {
    prefix: '/uploads/public', setHeaders: (res) => res.setHeader('x-content-type-options', 'nosniff'),
  });
  return app;
}
