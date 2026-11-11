/**
 * Données initiales : compte Super Admin, formules d'abonnement, et (avec SEED_DEMO=true)
 * quelques salons de démonstration déjà approuvés et abonnés.
 * Idempotent : peut être relancé sans créer de doublons.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

// Tarifs indicatifs (hypothèses à valider), modifiables depuis le back-office.
const PLANS = [
  {
    code: 'STARTER', name: 'Starter', priceMad: 149, position: 1,
    description: 'Gestion de base : salon, prestations, réservations, file d\'attente.',
    features: { maxStaff: 1, maxPhotos: 3, customBranding: false, statistics: false, advancedStatistics: false, loyalty: false, groupBooking: false },
  },
  {
    code: 'PRO', name: 'Pro', priceMad: 299, position: 2,
    description: 'Page personnalisée, photos, statistiques, fidélité, réservation de groupe.',
    features: { maxStaff: 4, maxPhotos: 12, customBranding: true, statistics: true, advancedStatistics: false, loyalty: true, groupBooking: true },
  },
  {
    code: 'BUSINESS', name: 'Business', priceMad: 499, position: 3,
    description: 'Équipe étendue et statistiques avancées.',
    features: { maxStaff: 15, maxPhotos: 30, customBranding: true, statistics: true, advancedStatistics: true, loyalty: true, groupBooking: true },
  },
];

const DEMO = [
  { name: 'Barber Atlas', type: 'MEN', city: 'Casablanca', district: 'Maârif', address: '12 rue Jura, Maârif', lat: 33.5822, lng: -7.6325, plan: 'PRO', team: ['Karim', 'Youssef', 'Hamza'] },
  { name: 'Salon Yasmine', type: 'WOMEN', city: 'Casablanca', district: 'Gauthier', address: '45 boulevard Moulay Youssef', lat: 33.5935, lng: -7.6287, plan: 'BUSINESS', team: ['Yasmine', 'Salma'] },
  { name: 'Le Rasoir', type: 'MEN', city: 'Rabat', district: 'Agdal', address: '8 avenue Fal Ould Oumeir, Agdal', lat: 33.9981, lng: -6.8498, plan: 'STARTER', team: ['Omar'] },
  { name: 'Studio Majorelle', type: 'MIXED', city: 'Marrakech', district: 'Guéliz', address: '27 rue de la Liberté, Guéliz', lat: 31.6349, lng: -8.0101, plan: 'PRO', team: ['Nadia', 'Mehdi'] },
];
const SERVICES: Record<string, [string, string, number, number][]> = {
  MEN: [['Coupe homme', 'Coupe', 30, 50], ['Barbe', 'Barbe', 20, 30], ['Coupe + barbe', 'Coupe', 45, 70], ['Coupe enfant', 'Enfant', 20, 35]],
  WOMEN: [['Brushing', 'Coiffage', 40, 80], ['Coupe femme', 'Coupe', 45, 120], ['Coloration', 'Couleur', 90, 300], ['Soin kératine', 'Soin', 120, 500]],
  MIXED: [['Coupe homme', 'Coupe', 30, 60], ['Coupe femme', 'Coupe', 45, 130], ['Brushing', 'Coiffage', 40, 90], ['Barbe', 'Barbe', 20, 35]],
};

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe!12345';
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await hash(password), role: 'SUPER_ADMIN', firstName: 'Super', lastName: 'Admin', emailVerifiedAt: new Date() },
    update: { role: 'SUPER_ADMIN' },
  });
  console.log(`Super Admin : ${email}`);

  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: {} });
  }
  console.log(`Formules : ${PLANS.map((p) => p.code).join(', ')}`);

  if (process.env.SEED_DEMO !== 'true') return;
  const demoHash = await hash('Demo!12345');
  const client = await prisma.user.upsert({
    where: { email: 'client@demo.ma' },
    create: { email: 'client@demo.ma', passwordHash: demoHash, firstName: 'Amine', lastName: 'Client', phone: '0612345678', emailVerifiedAt: new Date() },
    update: {},
  });

  for (const [i, d] of DEMO.entries()) {
    const ownerEmail = `pro${i + 1}@demo.ma`;
    if (await prisma.user.findUnique({ where: { email: ownerEmail } })) continue;
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash: demoHash, role: 'PROFESSIONAL', firstName: d.team[0], lastName: 'Demo', phone: `06000000${10 + i}`, emailVerifiedAt: new Date() },
    });
    await prisma.proApplication.create({
      data: { userId: owner.id, status: 'APPROVED', businessName: d.name, city: d.city, phone: owner.phone!, profession: 'BARBER', reviewedAt: new Date() },
    });
    const slug = d.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    const salon = await prisma.salon.create({
      data: {
        ownerId: owner.id, slug, name: d.name, type: d.type as never, city: d.city, district: d.district, address: d.address,
        latitude: d.lat, longitude: d.lng, phone: owner.phone, status: 'APPROVED', qrToken: randomBytes(16).toString('base64url'),
        description: `${d.name} vous accueille à ${d.district}, ${d.city}. Équipe expérimentée, sur rendez-vous ou sans rendez-vous.`,
        loyalty: { create: { enabled: d.plan !== 'STARTER', pointsPerVisit: 10, pointsPer10Mad: 1 } },
      },
    });
    const services = await Promise.all(SERVICES[d.type].map(([name, category, durationMin, priceMad], position) =>
      prisma.service.create({ data: { salonId: salon.id, name, category, durationMin, priceMad, position } })));
    for (const [j, name] of d.team.entries()) {
      await prisma.staffMember.create({
        data: {
          salonId: salon.id, displayName: name, isOwner: j === 0, userId: j === 0 ? owner.id : null, title: j === 0 ? 'Gérant' : 'Coiffeur',
          services: { create: services.map((s) => ({ serviceId: s.id })) },
          // Tous les jours, 9 h – 13 h et 14 h – 21 h.
          workingHours: {
            create: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
              { salonId: salon.id, weekday, startMin: 540, endMin: 780 }, { salonId: salon.id, weekday, startMin: 840, endMin: 1260 },
            ]),
          },
        },
      });
    }
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: d.plan } });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        salonId: salon.id, planId: plan.id, status: 'ACTIVE', startsAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000),
        payments: { create: { salonId: salon.id, amountMad: plan.priceMad, status: 'VALIDATED', reference: `DEMO-${i + 1}`, reviewedAt: now, receiptNumber: `R-DEMO-${String(i + 1).padStart(5, '0')}` } },
      },
    });
    if (d.plan !== 'STARTER') {
      await prisma.loyaltyReward.createMany({
        data: [
          { salonId: salon.id, name: 'Réduction de 20 DH', pointsCost: 50, type: 'DISCOUNT_AMOUNT', value: 20 },
          { salonId: salon.id, name: 'Une prestation offerte', pointsCost: 150, type: 'FREE_SERVICE' },
        ],
      });
    }
    console.log(`Salon de démonstration : ${d.name} (${ownerEmail})`);
  }
  console.log(`Comptes de démonstration : client@demo.ma et pro1..4@demo.ma — mot de passe Demo!12345 (client ${client.id.slice(0, 8)})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
