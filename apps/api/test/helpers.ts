import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

export interface Ctx {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function startApp(): Promise<Ctx> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const prisma = app.get(PrismaService);
  // Aucun appel réseau pendant les tests : l'envoi push est neutralisé.
  app.get(NotificationsService).push = { send: async () => undefined };
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

let counter = 0;
export const PASSWORD = 'Password!123';

export interface Session {
  token: string;
  refreshToken: string;
  id: string;
  email: string;
}

/** Crée un compte client dont l'email est déjà vérifié. */
export async function newUser(ctx: Ctx, opts: { verified?: boolean } = {}): Promise<Session> {
  const email = `user${++counter}-${Date.now()}@test.ma`;
  const res = await ctx.http().post('/api/auth/register').set('x-client', 'mobile')
    .send({ email, password: PASSWORD, firstName: 'Test', lastName: `User${counter}` }).expect(201);
  if (opts.verified !== false) await ctx.prisma.user.update({ where: { id: res.body.user.id }, data: { emailVerifiedAt: new Date() } });
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, id: res.body.user.id, email };
}

export async function newAdmin(ctx: Ctx): Promise<Session> {
  const user = await newUser(ctx);
  await ctx.prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } });
  return login(ctx, user.email);
}

export async function login(ctx: Ctx, email: string): Promise<Session> {
  const res = await ctx.http().post('/api/auth/login').set('x-client', 'mobile').send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, id: res.body.user.id, email };
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

/** Petit fichier PNG valide (1 × 1 pixel). */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Parcours complet : demande professionnelle acceptée, salon créé, prestation, validation, abonnement actif. */
export async function newPublishedSalon(ctx: Ctx, admin: Session, planCode: 'STARTER' | 'PRO' | 'BUSINESS' = 'PRO') {
  const applicant = await newUser(ctx);
  const application = await ctx.http().post('/api/pro-application').set(auth(applicant))
    .send({ businessName: 'Salon Test', city: 'Casablanca', phone: '0612345678', profession: 'BARBER' }).expect(201);
  await ctx.http().post(`/api/admin/pro-applications/${application.body.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
  const pro = await login(ctx, applicant.email);

  const salon = (await ctx.http().post('/api/pro/salon').set(auth(pro)).send({ name: `Salon ${counter}`, type: 'MEN', city: 'Casablanca', address: '1 rue Test' }).expect(201)).body;
  await ctx.http().patch('/api/pro/salon').set(auth(pro)).send({ description: 'Un salon de test', latitude: 33.58, longitude: -7.63, bookingLeadMin: 0 }).expect(200);
  const service = (await ctx.http().post('/api/pro/services').set(auth(pro)).send({ name: 'Coupe', durationMin: 30, priceMad: 50 }).expect(201)).body;
  const [owner] = (await ctx.http().get('/api/pro/staff').set(auth(pro)).expect(200)).body;
  // Ouvert en continu : les tests ne dépendent pas de l'heure à laquelle ils tournent.
  await ctx.http().put(`/api/pro/staff/${owner.id}/hours`).set(auth(pro))
    .send({ hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 0, endMin: 1440 })) }).expect(200);

  await ctx.http().post('/api/pro/salon/submit').set(auth(pro)).expect(200);
  await ctx.http().post(`/api/admin/salons/${salon.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);

  const plan = await ensurePlan(ctx, planCode);
  const sub = (await ctx.http().post('/api/pro/billing/subscribe').set(auth(pro)).send({ planId: plan.id }).expect(201)).body;
  const paymentId = sub.payments[0].id;
  await ctx.http().post(`/api/pro/billing/payments/${paymentId}/proof`).set(auth(pro))
    .field('reference', 'VIR-TEST-001').attach('file', PNG, 'preuve.png').expect(200);
  await ctx.http().post(`/api/admin/payments/${paymentId}/validate`).set(auth(admin)).expect(200);

  return { pro, salon, service, owner, paymentId };
}

const FEATURES = {
  STARTER: { maxStaff: 1, maxPhotos: 3, customBranding: false, statistics: false, advancedStatistics: false, loyalty: false, groupBooking: false },
  PRO: { maxStaff: 4, maxPhotos: 12, customBranding: true, statistics: true, advancedStatistics: false, loyalty: true, groupBooking: true },
  BUSINESS: { maxStaff: 15, maxPhotos: 30, customBranding: true, statistics: true, advancedStatistics: true, loyalty: true, groupBooking: true },
};

export const ensurePlan = (ctx: Ctx, code: keyof typeof FEATURES) =>
  ctx.prisma.plan.upsert({ where: { code }, update: {}, create: { code, name: code, priceMad: 100, features: FEATURES[code] } });

/** Prochain créneau proposé pour une prestation, demain. */
export async function firstSlot(ctx: Ctx, salonId: string, items: { serviceId: string; staffId?: string }[], mode?: string, dayOffset = 1) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date(Date.now() + dayOffset * 86_400_000));
  const res = await ctx.http().post(`/api/salons/${salonId}/availability`).send({ date, items, mode }).expect(200);
  return res.body.slots as { startAt: string; endAt: string }[];
}
