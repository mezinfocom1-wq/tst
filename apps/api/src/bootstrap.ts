import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './common/config';
import { UPLOAD_ROOT } from './common/storage.service';
import { join } from 'path';

/** Configuration commune à l'application réelle et aux tests. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: [config.webUrl], credentials: true });
  // Les propriétés inconnues sont rejetées : aucune donnée non prévue n'atteint le code métier.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Seul le dossier public est servi ; les preuves de paiement passent par une route authentifiée.
  express.useStaticAssets(join(UPLOAD_ROOT, 'public'), {
    prefix: '/uploads/public', setHeaders: (res) => res.setHeader('x-content-type-options', 'nosniff'),
  });
  return app;
}
