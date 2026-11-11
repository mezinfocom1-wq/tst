import { Ctx, PASSWORD, PNG, Session, auth, ensurePlan, firstSlot, login, newAdmin, newPublishedSalon, newUser, startApp } from './helpers';

let ctx: Ctx;
let admin: Session;

beforeAll(async () => {
  ctx = await startApp();
  admin = await newAdmin(ctx);
});
afterAll(() => ctx.app.close());

describe('authentification et rôles', () => {
  it("refuse l'accès sans jeton", async () => {
    await ctx.http().get('/api/me').expect(401);
    await ctx.http().get('/api/pro/salon').expect(401);
    await ctx.http().get('/api/admin/stats').expect(401);
  });

  it('crée un compte client, sans aucun droit professionnel ni administrateur', async () => {
    const user = await newUser(ctx);
    const me = await ctx.http().get('/api/me').set(auth(user)).expect(200);
    expect(me.body.role).toBe('CLIENT');
    expect(me.body.passwordHash).toBeUndefined();
    await ctx.http().get('/api/pro/salon').set(auth(user)).expect(403);
    await ctx.http().post('/api/pro/salon').set(auth(user)).send({ name: 'Pirate', type: 'MEN', city: 'Rabat' }).expect(403);
    await ctx.http().get('/api/admin/users').set(auth(user)).expect(403);
  });

  it('rejette les champs inconnus (pas d’élévation de rôle par le corps de la requête)', async () => {
    await ctx.http().post('/api/auth/register')
      .send({ email: 'x@test.ma', password: PASSWORD, firstName: 'A', lastName: 'B', role: 'SUPER_ADMIN' }).expect(400);
    const user = await newUser(ctx);
    await ctx.http().patch('/api/me').set(auth(user)).send({ role: 'SUPER_ADMIN' }).expect(400);
  });

  it('verrouille le compte après cinq mots de passe erronés', async () => {
    const user = await newUser(ctx);
    for (let i = 0; i < 5; i++) {
      await ctx.http().post('/api/auth/login').send({ email: user.email, password: 'mauvais-mot-de-passe' }).expect(401);
    }
    const res = await ctx.http().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('fait tourner le jeton de rafraîchissement et révoque tout en cas de rejeu', async () => {
    const user = await newUser(ctx);
    const first = await ctx.http().post('/api/auth/refresh').set('x-client', 'mobile').send({ refreshToken: user.refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
  });

  it('place le jeton de rafraîchissement dans un cookie httpOnly pour le Web', async () => {
    const user = await newUser(ctx);
    const res = await ctx.http().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/rt=.*HttpOnly/);
  });

  it('vérifie l’email et réinitialise le mot de passe avec des liens à usage unique', async () => {
    const user = await newUser(ctx, { verified: false });
    const mail = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: user.id, type: 'verify_email' } });
    const token = /token=([\w-]+)/.exec(mail.body)![1];
    await ctx.http().post('/api/auth/verify-email').send({ token }).expect(200);
    await ctx.http().post('/api/auth/verify-email').send({ token }).expect(400);
    expect((await ctx.http().get('/api/me').set(auth(user))).body.emailVerified).toBe(true);

    await ctx.http().post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    await ctx.http().post('/api/auth/forgot-password').send({ email: 'inconnu@test.ma' }).expect(200);
    const reset = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: user.id, type: 'reset_password' } });
    const resetToken = /token=([\w-]+)/.exec(reset.body)![1];
    await ctx.http().post('/api/auth/reset-password').send({ token: resetToken, password: 'NouveauMotDePasse!1' }).expect(200);
    await ctx.http().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    await ctx.http().post('/api/auth/login').send({ email: user.email, password: 'NouveauMotDePasse!1' }).expect(200);
  });

  it('bloque immédiatement un compte suspendu', async () => {
    const user = await newUser(ctx);
    await ctx.http().post(`/api/admin/users/${user.id}/status`).set(auth(admin)).send({ status: 'SUSPENDED' }).expect(200);
    await ctx.http().get('/api/me').set(auth(user)).expect(403);
    await ctx.http().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(403);
  });
});

describe('parcours professionnel : demande, salon, abonnement', () => {
  it('exige la validation du Super Admin pour devenir professionnel', async () => {
    const user = await newUser(ctx);
    const app = await ctx.http().post('/api/pro-application').set(auth(user))
      .send({ businessName: 'Chez Test', city: 'Fès', phone: '0612345678', profession: 'BARBER' }).expect(201);
    await ctx.http().post('/api/pro-application').set(auth(user))
      .send({ businessName: 'Chez Test', city: 'Fès', phone: '0612345678', profession: 'BARBER' }).expect(409);
    await ctx.http().post('/api/pro/salon').set(auth(user)).send({ name: 'Trop tôt', type: 'MEN', city: 'Fès' }).expect(403);

    await ctx.http().post(`/api/admin/pro-applications/${app.body.id}/decision`).set(auth(admin)).send({ decision: 'REJECT' }).expect(400);
    await ctx.http().post(`/api/admin/pro-applications/${app.body.id}/decision`).set(auth(admin)).send({ decision: 'REQUEST_INFO', note: 'Précisez votre adresse' }).expect(200);
    expect((await ctx.http().get('/api/pro-application').set(auth(user))).body.adminNote).toBe('Précisez votre adresse');
    await ctx.http().post(`/api/admin/pro-applications/${app.body.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
    expect((await ctx.http().get('/api/me').set(auth(user))).body.role).toBe('PROFESSIONAL');
  });

  it('ne publie un salon qu’après approbation ET paiement validé ; une preuve seule n’active rien', async () => {
    const applicant = await newUser(ctx);
    const application = await ctx.http().post('/api/pro-application').set(auth(applicant))
      .send({ businessName: 'Étapes', city: 'Tanger', phone: '0612345678', profession: 'BARBER' }).expect(201);
    await ctx.http().post(`/api/admin/pro-applications/${application.body.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' });
    const pro = await login(ctx, applicant.email);
    const salon = (await ctx.http().post('/api/pro/salon').set(auth(pro)).send({ name: 'Étapes', type: 'MEN', city: 'Tanger', address: '2 rue A' }).expect(201)).body;
    expect(salon.status).toBe('DRAFT');
    await ctx.http().post('/api/pro/salon').set(auth(pro)).send({ name: 'Deuxième', type: 'MEN', city: 'Tanger' }).expect(409);

    await ctx.http().post('/api/pro/salon/submit').set(auth(pro)).expect(400);
    await ctx.http().patch('/api/pro/salon').set(auth(pro)).send({ description: 'Description' }).expect(200);
    await ctx.http().post('/api/pro/services').set(auth(pro)).send({ name: 'Coupe', durationMin: 30, priceMad: 60 }).expect(201);
    await ctx.http().post('/api/pro/salon/submit').set(auth(pro)).expect(200);
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);

    await ctx.http().post(`/api/admin/salons/${salon.id}/decision`).set(auth(admin)).send({ decision: 'REJECT', note: 'Photos manquantes' }).expect(200);
    expect((await ctx.http().get('/api/pro/salon').set(auth(pro))).body.reviewNote).toBe('Photos manquantes');
    await ctx.http().post('/api/pro/salon/submit').set(auth(pro)).expect(200);
    await ctx.http().post(`/api/admin/salons/${salon.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
    // Approuvé mais sans abonnement : toujours invisible.
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);

    const plan = await ensurePlan(ctx, 'STARTER');
    const sub = (await ctx.http().post('/api/pro/billing/subscribe').set(auth(pro)).send({ planId: plan.id }).expect(201)).body;
    expect(sub.status).toBe('PENDING');
    const paymentId = sub.payments[0].id;
    await ctx.http().post(`/api/pro/billing/payments/${paymentId}/proof`).set(auth(pro))
      .field('reference', 'VIR-1').attach('file', Buffer.from('ceci est un texte, pas une image'), 'preuve.png').expect(400);
    const proof = await ctx.http().post(`/api/pro/billing/payments/${paymentId}/proof`).set(auth(pro))
      .field('reference', 'VIR-1').attach('file', PNG, 'preuve.png').expect(200);
    expect(proof.body.status).toBe('TO_VERIFY');
    // La preuve est déposée : l'abonnement reste inactif et le salon invisible.
    expect((await ctx.http().get('/api/pro/billing').set(auth(pro))).body.active).toBeNull();
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);

    await ctx.http().post(`/api/admin/payments/${paymentId}/reject`).set(auth(admin)).send({ note: 'Montant incorrect' }).expect(200);
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);
    await ctx.http().post(`/api/pro/billing/payments/${paymentId}/proof`).set(auth(pro)).field('reference', 'VIR-2').attach('file', PNG, 'preuve.png').expect(200);
    const validated = await ctx.http().post(`/api/admin/payments/${paymentId}/validate`).set(auth(admin)).expect(200);
    expect(validated.body.receiptNumber).toMatch(/^R-\d{4}-\d{5}$/);
    await ctx.http().post(`/api/admin/payments/${paymentId}/validate`).set(auth(admin)).expect(409);

    await ctx.http().get(`/api/salons/${salon.slug}`).expect(200);
    const billing = (await ctx.http().get('/api/pro/billing').set(auth(pro))).body;
    expect(billing.active.status).toBe('ACTIVE');
    expect(JSON.stringify(billing)).not.toContain('proofKey');
    const receipt = await ctx.http().get(`/api/pro/billing/payments/${paymentId}/receipt`).set(auth(pro)).expect(200);
    expect(receipt.body.amountMad).toBe(plan.priceMad);

    // Suspension administrative : le salon disparaît de la marketplace.
    await ctx.http().post(`/api/admin/salons/${salon.id}/decision`).set(auth(admin)).send({ decision: 'SUSPEND', note: 'Signalement' }).expect(200);
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);
  });

  it('applique les limites de la formule (équipe, fidélité, statistiques)', async () => {
    const { pro } = await newPublishedSalon(ctx, admin, 'STARTER');
    const res = await ctx.http().post('/api/pro/staff').set(auth(pro)).send({ displayName: 'Deuxième' }).expect(403);
    expect(res.body.code).toBe('PLAN_LIMIT');
    await ctx.http().put('/api/pro/loyalty').set(auth(pro)).send({ enabled: true, pointsPerVisit: 10, pointsPer10Mad: 0 }).expect(403);
    await ctx.http().get('/api/pro/stats').set(auth(pro)).expect(403);
  });

  it('expire un abonnement arrivé à échéance et retire le salon de la marketplace', async () => {
    const { salon } = await newPublishedSalon(ctx, admin, 'STARTER');
    await ctx.prisma.subscription.updateMany({ where: { salonId: salon.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await ctx.http().get(`/api/salons/${salon.slug}`).expect(404);
    const { BillingService } = await import('../src/billing/billing.service');
    await ctx.app.get(BillingService).runExpiry();
    expect((await ctx.prisma.subscription.findFirstOrThrow({ where: { salonId: salon.id } })).status).toBe('EXPIRED');
  });
});

describe('isolation entre salons', () => {
  it("empêche un professionnel d'accéder aux données d'un autre salon", async () => {
    const a = await newPublishedSalon(ctx, admin);
    const b = await newPublishedSalon(ctx, admin);
    const client = await newUser(ctx);
    const [slot] = await firstSlot(ctx, a.salon.id, [{ serviceId: a.service.id }]);
    const booking = (await ctx.http().post(`/api/salons/${a.salon.id}/bookings`).set(auth(client))
      .send({ items: [{ serviceId: a.service.id }], startAt: slot.startAt }).expect(201)).body;
    const appointmentId = booking.appointments[0].id;
    const ticket = (await ctx.http().post(`/api/salons/${a.salon.id}/queue/join`).set(auth(client)).send({ serviceId: a.service.id }).expect(201)).body;

    // Le professionnel B ne voit que son salon…
    expect((await ctx.http().get('/api/pro/salon').set(auth(b.pro))).body.id).toBe(b.salon.id);
    expect((await ctx.http().get('/api/pro/services').set(auth(b.pro))).body.every((s: { salonId: string }) => s.salonId === b.salon.id)).toBe(true);
    const day = slot.startAt.slice(0, 10);
    expect((await ctx.http().get(`/api/pro/appointments?from=${day}&to=${day}`).set(auth(b.pro))).body).toHaveLength(0);
    expect((await ctx.http().get('/api/pro/queue').set(auth(b.pro))).body.waiting).toHaveLength(0);
    expect((await ctx.http().get('/api/pro/clients').set(auth(b.pro))).body).toHaveLength(0);

    // …et ne peut ni lire ni modifier les ressources du salon A, même en connaissant leurs identifiants.
    await ctx.http().patch(`/api/pro/services/${a.service.id}`).set(auth(b.pro)).send({ priceMad: 1 }).expect(404);
    await ctx.http().delete(`/api/pro/services/${a.service.id}`).set(auth(b.pro)).expect(404);
    await ctx.http().patch(`/api/pro/staff/${a.owner.id}`).set(auth(b.pro)).send({ displayName: 'Piraté' }).expect(404);
    await ctx.http().put(`/api/pro/staff/${a.owner.id}/hours`).set(auth(b.pro)).send({ hours: [] }).expect(404);
    await ctx.http().post(`/api/pro/appointments/${appointmentId}/status`).set(auth(b.pro)).send({ status: 'CANCELLED' }).expect(404);
    await ctx.http().get(`/api/pro/appointments/${appointmentId}/history`).set(auth(b.pro)).expect(200).expect((r) => expect(r.body).toHaveLength(0));
    await ctx.http().post(`/api/pro/queue/${ticket.id}/cancel`).set(auth(b.pro)).expect(404);
    await ctx.http().post('/api/pro/queue/call').set(auth(b.pro)).send({ staffId: a.owner.id }).expect(404);
    await ctx.http().get(`/api/pro/billing/payments/${a.paymentId}/proof`).set(auth(b.pro)).expect(404);
    await ctx.http().get(`/api/pro/billing/payments/${a.paymentId}/receipt`).set(auth(b.pro)).expect(404);
    // Un rendez-vous de B ne peut pas viser une prestation de A.
    await ctx.http().post('/api/pro/appointments').set(auth(b.pro))
      .send({ guestName: 'X', items: [{ serviceId: a.service.id }], startAt: slot.startAt }).expect(400);

    expect((await ctx.prisma.service.findUniqueOrThrow({ where: { id: a.service.id } })).priceMad).toBe(50);
    expect((await ctx.prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe('CONFIRMED');
  });

  it("empêche un client de voir ou d'annuler la réservation ou le ticket d'un autre client", async () => {
    const a = await newPublishedSalon(ctx, admin);
    const owner = await newUser(ctx), intruder = await newUser(ctx);
    const [slot] = await firstSlot(ctx, a.salon.id, [{ serviceId: a.service.id }]);
    const booking = (await ctx.http().post(`/api/salons/${a.salon.id}/bookings`).set(auth(owner))
      .send({ items: [{ serviceId: a.service.id }], startAt: slot.startAt }).expect(201)).body;
    const ticket = (await ctx.http().post(`/api/salons/${a.salon.id}/queue/join`).set(auth(owner)).send({ serviceId: a.service.id }).expect(201)).body;
    await ctx.http().post(`/api/appointments/${booking.appointments[0].id}/cancel`).set(auth(intruder)).expect(404);
    await ctx.http().get(`/api/queue/tickets/${ticket.id}`).set(auth(intruder)).expect(404);
    await ctx.http().post(`/api/queue/tickets/${ticket.id}/cancel`).set(auth(intruder)).expect(404);
    expect((await ctx.http().get('/api/me/appointments').set(auth(intruder))).body).toHaveLength(0);
  });
});

describe('réservations', () => {
  it('réserve un créneau, le retire des disponibilités et refuse la double réservation', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const c1 = await newUser(ctx), c2 = await newUser(ctx);
    const slots = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    expect(slots.length).toBeGreaterThan(10);
    const startAt = slots[4].startAt;
    await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(c1)).send({ items: [{ serviceId: service.id }], startAt }).expect(201);
    const again = await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(c2)).send({ items: [{ serviceId: service.id }], startAt }).expect(409);
    expect(again.body.code).toMatch(/SLOT_/);
    const after = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    expect(after.map((s) => s.startAt)).not.toContain(startAt);
  });

  it('exige un email vérifié et interdit de réserver dans son propre salon', async () => {
    const { salon, service, pro } = await newPublishedSalon(ctx, admin);
    const unverified = await newUser(ctx, { verified: false });
    const [slot] = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    const body = { items: [{ serviceId: service.id }], startAt: slot.startAt };
    expect((await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(unverified)).send(body).expect(403)).body.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(pro)).send(body).expect(403)).body.code).toBe('OWN_SALON');
    // Un professionnel garde les capacités d'un client dans les autres salons.
    const other = await newPublishedSalon(ctx, admin);
    const [otherSlot] = await firstSlot(ctx, other.salon.id, [{ serviceId: other.service.id }]);
    await ctx.http().post(`/api/salons/${other.salon.id}/bookings`).set(auth(pro)).send({ items: [{ serviceId: other.service.id }], startAt: otherSlot.startAt }).expect(201);
  });

  it('n’accepte qu’une seule réservation quand vingt demandes visent le même créneau en même temps', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const clients = await Promise.all(Array.from({ length: 20 }, () => newUser(ctx)));
    const [, , slot] = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    const results = await Promise.all(clients.map((c) =>
      ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(c)).send({ items: [{ serviceId: service.id }], startAt: slot.startAt })));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(await ctx.prisma.appointment.count({ where: { salonId: salon.id } })).toBe(1);
    expect(await ctx.prisma.booking.count({ where: { salonId: salon.id } })).toBe(1);
  });

  it('refuse aussi les créneaux qui se chevauchent partiellement, en concurrence', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const clients = await Promise.all(Array.from({ length: 6 }, () => newUser(ctx)));
    const slots = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    // Créneaux décalés de 15 minutes pour une prestation de 30 minutes : ils se recouvrent deux à deux.
    const results = await Promise.all(clients.map((c, i) =>
      ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(c)).send({ items: [{ serviceId: service.id }], startAt: slots[i].startAt })));
    const created = await ctx.prisma.appointment.findMany({ where: { salonId: salon.id }, orderBy: { startAt: 'asc' } });
    expect(created.length).toBe(results.filter((r) => r.status === 201).length);
    for (let i = 1; i < created.length; i++) expect(created[i].startAt.getTime()).toBeGreaterThanOrEqual(created[i - 1].endAt.getTime());
  });

  it('rend la création idempotente (double clic, nouvelle tentative réseau)', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const client = await newUser(ctx);
    const [slot] = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    const body = { items: [{ serviceId: service.id }], startAt: slot.startAt, idempotencyKey: 'cle-unique-123456' };
    const first = await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send(body).expect(201);
    const second = await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send(body).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await ctx.prisma.booking.count({ where: { salonId: salon.id } })).toBe(1);
  });

  it('réserve un groupe de façon atomique : tout ou rien', async () => {
    const { salon, service, pro } = await newPublishedSalon(ctx, admin);
    const client = await newUser(ctx);
    const items = [{ serviceId: service.id, personName: 'Moi' }, { serviceId: service.id, personName: 'Mon fils' }];

    // Un seul professionnel : deux passages en parallèle sont impossibles → rien n'est créé.
    const [slot] = await firstSlot(ctx, salon.id, [{ serviceId: service.id }]);
    const parallel = await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send({ items, startAt: slot.startAt, mode: 'PARALLEL' }).expect(409);
    expect(parallel.body.code).toBe('SLOT_UNAVAILABLE');
    expect(await ctx.prisma.appointment.count({ where: { salonId: salon.id } })).toBe(0);
    expect(await ctx.prisma.booking.count({ where: { salonId: salon.id } })).toBe(0);

    // En passages consécutifs, le groupe tient : prix et durée totaux calculés.
    const group = (await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send({ items, startAt: slot.startAt, mode: 'CONSECUTIVE' }).expect(201)).body;
    expect(group.isGroup).toBe(true);
    expect(group.totalPriceMad).toBe(100);
    expect(group.totalDurationMin).toBe(60);
    expect(group.appointments[1].startAt).toBe(group.appointments[0].endAt);

    // Avec un deuxième professionnel, le mode parallèle devient possible.
    await ctx.http().post('/api/pro/staff').set(auth(pro)).send({ displayName: 'Youssef' }).expect(201);
    const second = (await ctx.prisma.staffMember.findFirstOrThrow({ where: { salonId: salon.id, isOwner: false } })).id;
    await ctx.http().put(`/api/pro/staff/${second}/hours`).set(auth(pro)).send({ hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 0, endMin: 1440 })) }).expect(200);
    const slots2 = await firstSlot(ctx, salon.id, items.map(({ serviceId }) => ({ serviceId })), 'PARALLEL');
    const free = slots2.find((s) => new Date(s.startAt) > new Date(group.appointments[1].endAt))!;
    const both = (await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send({ items, startAt: free.startAt, mode: 'PARALLEL' }).expect(201)).body;
    expect(new Set(both.appointments.map((a: { staffId: string }) => a.staffId)).size).toBe(2);

    // Si une seule des deux prestations entre en conflit dans la transaction, aucune n'est conservée.
    const before = await ctx.prisma.appointment.count({ where: { salonId: salon.id } });
    const [target] = await firstSlot(ctx, salon.id, [{ serviceId: service.id, staffId: second }], undefined, 2);
    const racers = await Promise.all(Array.from({ length: 5 }, () => newUser(ctx)));
    const race = await Promise.all(racers.map((c) => ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(c)).send({ items, startAt: target.startAt, mode: 'PARALLEL' })));
    expect(race.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await ctx.prisma.appointment.count({ where: { salonId: salon.id } })).toBe(before + 2);
  });

  it('respecte le délai d’annulation et conserve l’historique des statuts', async () => {
    const { salon, service, pro } = await newPublishedSalon(ctx, admin);
    const client = await newUser(ctx);
    const [slot] = await firstSlot(ctx, salon.id, [{ serviceId: service.id }], undefined, 2);
    const booking = (await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send({ items: [{ serviceId: service.id }], startAt: slot.startAt }).expect(201)).body;
    const id = booking.appointments[0].id;
    await ctx.http().post(`/api/appointments/${id}/cancel`).set(auth(client)).expect(200);
    await ctx.http().post(`/api/appointments/${id}/cancel`).set(auth(client)).expect(409);
    const history = (await ctx.http().get(`/api/pro/appointments/${id}/history`).set(auth(pro))).body;
    expect(history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['CONFIRMED', 'CANCELLED']);
    // Le créneau annulé redevient disponible.
    expect((await firstSlot(ctx, salon.id, [{ serviceId: service.id }], undefined, 2)).map((s) => s.startAt)).toContain(slot.startAt);

    // Trop tard pour annuler : rendez-vous dans moins de deux heures (saisi par le professionnel pour un client).
    await ctx.prisma.salon.update({ where: { id: salon.id }, data: { bookingLeadMin: 0 } });
    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    const near = (await ctx.http().post(`/api/salons/${salon.id}/bookings`).set(auth(client)).send({ items: [{ serviceId: service.id }], startAt: soon })).body;
    if (near.appointments) {
      const res = await ctx.http().post(`/api/appointments/${near.appointments[0].id}/cancel`).set(auth(client)).expect(400);
      expect(res.body.code).toBe('TOO_LATE_TO_CANCEL');
    }
  });
});

describe("file d'attente", () => {
  it('délivre un ticket numéroté, estime l’attente et notifie le client', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const c1 = await newUser(ctx), c2 = await newUser(ctx);
    await ctx.http().post(`/api/salons/${salon.id}/queue/join`).send({ serviceId: service.id }).expect(401);
    const t1 = (await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c1)).send({ serviceId: service.id }).expect(201)).body;
    const t2 = (await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c2)).send({ serviceId: service.id }).expect(201)).body;
    expect([t1.number, t2.number]).toEqual([1, 2]);
    expect(t1.estimate).toMatchObject({ position: 1, peopleAhead: 0, estimatedWaitMin: 0 });
    expect(t2.estimate).toMatchObject({ position: 2, peopleAhead: 1, estimatedWaitMin: 30 });
    expect((await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c1)).send({ serviceId: service.id }).expect(409)).body.code).toBe('ALREADY_IN_QUEUE');
    const status = (await ctx.http().get(`/api/salons/${salon.id}/queue`).expect(200)).body;
    expect(status).toMatchObject({ enabled: true, waiting: 2, estimatedWaitMin: 60 });
    expect(await ctx.prisma.notification.count({ where: { userId: c1.id, type: 'queue_joined' } })).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: c2.id, type: 'queue_near' } })).toBe(1);
  });

  it('numérote sans doublon quand quinze clients rejoignent la file en même temps', async () => {
    const { salon, service } = await newPublishedSalon(ctx, admin);
    const clients = await Promise.all(Array.from({ length: 15 }, () => newUser(ctx)));
    const results = await Promise.all(clients.map((c) => ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c)).send({ serviceId: service.id })));
    const numbers = results.filter((r) => r.status === 201).map((r) => r.body.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    expect(numbers.length).toBe(15);
  });

  it('impose le QR Code quand le salon réserve la file aux clients sur place', async () => {
    const { salon, service, pro } = await newPublishedSalon(ctx, admin);
    await ctx.http().patch('/api/pro/salon').set(auth(pro)).send({ queueOnsiteOnly: true }).expect(200);
    const client = await newUser(ctx);
    const refused = await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(client)).send({ serviceId: service.id }).expect(403);
    expect(refused.body.code).toBe('QUEUE_ONSITE_ONLY');
    const { qrUrl } = (await ctx.http().get('/api/pro/salon').set(auth(pro))).body;
    const qrToken = new URL(qrUrl).searchParams.get('qr')!;
    await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(client)).send({ serviceId: service.id, qrToken }).expect(201);
    // Le jeton du QR Code n'est jamais exposé publiquement.
    expect(JSON.stringify((await ctx.http().get(`/api/salons/${salon.slug}`)).body)).not.toContain(qrToken);
  });

  it('déroule un passage complet avec priorité au rendez-vous, fidélité et avis', async () => {
    const { salon, service, pro, owner } = await newPublishedSalon(ctx, admin);
    await ctx.http().put('/api/pro/loyalty').set(auth(pro)).send({ enabled: true, pointsPerVisit: 10, pointsPer10Mad: 1 }).expect(200);
    const reward = (await ctx.http().post('/api/pro/loyalty/rewards').set(auth(pro)).send({ name: 'Réduction 10 DH', pointsCost: 15, type: 'DISCOUNT_AMOUNT', value: 10 }).expect(201)).body;
    const client = await newUser(ctx);

    // Un rendez-vous dans 20 minutes : une coupe de 30 minutes empiéterait dessus.
    await ctx.http().post('/api/pro/appointments').set(auth(pro))
      .send({ guestName: 'Client téléphone', items: [{ serviceId: service.id }], startAt: new Date(Date.now() + 20 * 60_000).toISOString() }).expect(201);
    const ticket = (await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(client)).send({ serviceId: service.id }).expect(201)).body;
    expect(ticket.estimate.estimatedWaitMin).toBeGreaterThanOrEqual(49);
    const walkIn = (await ctx.http().post('/api/pro/queue').set(auth(pro)).send({ guestName: 'Client de passage', serviceId: service.id }).expect(201)).body;
    expect(walkIn.number).toBe(2);

    const blocked = await ctx.http().post('/api/pro/queue/call').set(auth(pro)).send({ staffId: owner.id }).expect(409);
    expect(blocked.body.code).toBe('WOULD_OVERLAP_APPOINTMENT');
    const called = (await ctx.http().post('/api/pro/queue/call').set(auth(pro)).send({ staffId: owner.id, force: true }).expect(200)).body;
    expect(called).toMatchObject({ id: ticket.id, status: 'CALLED' });
    expect(await ctx.prisma.notification.count({ where: { userId: client.id, type: 'queue_called' } })).toBe(1);
    // Un professionnel ne peut pas avoir deux clients en cours.
    expect((await ctx.http().post('/api/pro/queue/call').set(auth(pro)).send({ staffId: owner.id, force: true }).expect(409)).body.code).toBe('STAFF_BUSY');

    // Avis impossible tant que la prestation n'est pas terminée.
    await ctx.http().post('/api/reviews').set(auth(client)).send({ ticketId: ticket.id, rating: 5 }).expect(404);
    await ctx.http().post(`/api/pro/queue/${ticket.id}/finish`).set(auth(pro)).expect(409);
    await ctx.http().post(`/api/pro/queue/${ticket.id}/start`).set(auth(pro)).expect(200);
    const done = (await ctx.http().post(`/api/pro/queue/${ticket.id}/finish`).set(auth(pro)).expect(200)).body;
    expect(done.status).toBe('DONE');
    expect(done.pointsAwarded).toBe(15);
    await ctx.http().post(`/api/pro/queue/${ticket.id}/finish`).set(auth(pro)).expect(409);

    // Fidélité : solde, échange, bon validé en salon.
    const loyalty = (await ctx.http().get('/api/me/loyalty').set(auth(client))).body;
    expect(loyalty[0].balance).toBe(15);
    const redemption = (await ctx.http().post(`/api/loyalty/rewards/${reward.id}/redeem`).set(auth(client)).expect(200)).body;
    await ctx.http().post(`/api/loyalty/rewards/${reward.id}/redeem`).set(auth(client)).expect(400);
    await ctx.http().post(`/api/pro/loyalty/redemptions/${redemption.code}/use`).set(auth(pro)).expect(200);
    await ctx.http().post(`/api/pro/loyalty/redemptions/${redemption.code}/use`).set(auth(pro)).expect(404);
    expect((await ctx.http().get('/api/me/loyalty').set(auth(client))).body[0].balance).toBe(0);

    // Avis : un seul par prestation, note visible sur la fiche, réponse du salon.
    const review = (await ctx.http().post('/api/reviews').set(auth(client)).send({ ticketId: ticket.id, rating: 4, comment: 'Très bien' }).expect(201)).body;
    await ctx.http().post('/api/reviews').set(auth(client)).send({ ticketId: ticket.id, rating: 1 }).expect(409);
    await ctx.http().post(`/api/pro/reviews/${review.id}/reply`).set(auth(pro)).send({ reply: 'Merci !' }).expect(200);
    const page = (await ctx.http().get(`/api/salons/${salon.slug}`)).body;
    expect(page).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    expect(page.reviews[0]).toMatchObject({ comment: 'Très bien', reply: 'Merci !' });
    await ctx.http().post(`/api/admin/reviews/${review.id}/hide`).set(auth(admin)).send({ hidden: true }).expect(200);
    expect((await ctx.http().get(`/api/salons/${salon.slug}`)).body.ratingCount).toBe(0);

    // Statistiques et fichier clients du salon.
    const stats = (await ctx.http().get('/api/pro/stats').set(auth(pro)).expect(200)).body;
    expect(stats.totals).toMatchObject({ visits: 1, revenueMad: 50, queueTickets: 1 });
    expect((await ctx.http().get('/api/pro/clients').set(auth(pro))).body[0]).toMatchObject({ visits: 1, spentMad: 50 });
    expect((await ctx.http().get('/api/pro/dashboard').set(auth(pro))).body).toMatchObject({ servedToday: 1, revenueToday: 50, waiting: 1 });
  });

  it('gère l’absence à l’appel et la réintégration en fin de file', async () => {
    const { salon, service, pro, owner } = await newPublishedSalon(ctx, admin);
    const c1 = await newUser(ctx), c2 = await newUser(ctx);
    const t1 = (await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c1)).send({ serviceId: service.id }).expect(201)).body;
    const t2 = (await ctx.http().post(`/api/salons/${salon.id}/queue/join`).set(auth(c2)).send({ serviceId: service.id }).expect(201)).body;
    await ctx.http().post('/api/pro/queue/call').set(auth(pro)).send({ staffId: owner.id }).expect(200);
    await ctx.http().post(`/api/pro/queue/${t1.id}/no-show`).set(auth(pro)).expect(200);
    await ctx.http().post(`/api/pro/queue/${t1.id}/requeue`).set(auth(pro)).expect(200);
    const board = (await ctx.http().get('/api/pro/queue').set(auth(pro))).body;
    expect(board.waiting.map((t: { id: string }) => t.id)).toEqual([t2.id, t1.id]);
    const events = await ctx.prisma.statusEvent.findMany({ where: { entityId: t1.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.toStatus)).toEqual(['WAITING', 'CALLED', 'NO_SHOW', 'WAITING']);
    await ctx.http().post(`/api/queue/tickets/${t1.id}/cancel`).set(auth(c1)).expect(200);
    expect((await ctx.http().get('/api/pro/queue').set(auth(pro))).body.waiting).toHaveLength(1);
  });

  it('replace dans la file un client arrivé après le délai de tolérance de son rendez-vous', async () => {
    const { salon, service, pro } = await newPublishedSalon(ctx, admin);
    const appt = (await ctx.http().post('/api/pro/appointments').set(auth(pro))
      .send({ guestName: 'Retardataire', items: [{ serviceId: service.id }], startAt: new Date(Date.now() - 60_000).toISOString() }).expect(201)).body.appointments[0];
    const early = await ctx.http().post(`/api/pro/appointments/${appt.id}/status`).set(auth(pro)).send({ status: 'NO_SHOW' }).expect(400);
    expect(early.body.code).toBe('TOLERANCE_NOT_ELAPSED');
    await ctx.prisma.salon.update({ where: { id: salon.id }, data: { lateToleranceMin: 0 } });
    await ctx.http().post(`/api/pro/appointments/${appt.id}/status`).set(auth(pro)).send({ status: 'NO_SHOW' }).expect(200);
    const ticket = (await ctx.http().post(`/api/pro/appointments/${appt.id}/to-queue`).set(auth(pro)).expect(200)).body;
    expect(ticket).toMatchObject({ status: 'WAITING', guestName: 'Retardataire' });
  });
});

describe('marketplace', () => {
  it('filtre par ville, prix, type et distance, et applique le classement configurable', async () => {
    const near = await newPublishedSalon(ctx, admin);
    const far = await newPublishedSalon(ctx, admin);
    await ctx.http().patch('/api/pro/salon').set(auth(far.pro)).send({ city: 'Agadir', latitude: 30.42, longitude: -9.6 }).expect(200);
    await ctx.http().patch(`/api/pro/services/${far.service.id}`).set(auth(far.pro)).send({ priceMad: 400 }).expect(200);

    const all = (await ctx.http().get('/api/salons?pageSize=50')).body;
    expect(all.items.every((s: Record<string, unknown>) => !('qrToken' in s) && !('ownerId' in s))).toBe(true);
    const agadir = (await ctx.http().get('/api/salons?city=agadir')).body.items;
    expect(agadir.map((s: { id: string }) => s.id)).toEqual([far.salon.id]);
    const cheap = (await ctx.http().get('/api/salons?maxPrice=100&pageSize=50')).body.items.map((s: { id: string }) => s.id);
    expect(cheap).toContain(near.salon.id);
    expect(cheap).not.toContain(far.salon.id);
    const around = (await ctx.http().get('/api/salons?lat=33.58&lng=-7.63&radiusKm=10&sort=distance&pageSize=50')).body.items;
    expect(around.map((s: { id: string }) => s.id)).toContain(near.salon.id);
    expect(around.map((s: { id: string }) => s.id)).not.toContain(far.salon.id);
    expect(around[0].distanceKm).toBeLessThan(1);

    await ctx.http().put('/api/admin/settings/ranking').set(auth(admin)).send({ value: { distance: 2 } }).expect(400);
    await ctx.http().put('/api/admin/settings/ranking').set(auth(admin)).send({ value: { distance: 1, rating: 0, popularity: 0, queueOpen: 0 } }).expect(200);
    const ranked = (await ctx.http().get('/api/salons?lat=30.42&lng=-9.6&pageSize=50')).body.items;
    expect(ranked[0].id).toBe(far.salon.id);
    expect((await ctx.http().get('/api/salons/cities')).body.map((c: { city: string }) => c.city)).toContain('Agadir');
  });
});

describe('administration', () => {
  it('gère les formules sans intervention sur le code et journalise les actions sensibles', async () => {
    const plan = (await ctx.http().post('/api/admin/plans').set(auth(admin))
      .send({ code: 'PREMIUM_TEST', name: 'Premium', priceMad: 799, durationDays: 30, features: { maxStaff: 30, loyalty: true } }).expect(201)).body;
    expect((await ctx.http().get('/api/plans')).body.map((p: { code: string }) => p.code)).toContain('PREMIUM_TEST');
    await ctx.http().patch(`/api/admin/plans/${plan.id}`).set(auth(admin)).send({ priceMad: 699 }).expect(200);
    await ctx.http().delete(`/api/admin/plans/${plan.id}`).set(auth(admin)).expect(200);
    expect((await ctx.http().get('/api/plans')).body.map((p: { code: string }) => p.code)).not.toContain('PREMIUM_TEST');

    const logs = (await ctx.http().get('/api/admin/audit-logs').set(auth(admin)).expect(200)).body;
    const actions = logs.items.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['plan.created', 'plan.updated', 'plan.deleted']));
    const stats = (await ctx.http().get('/api/admin/stats').set(auth(admin)).expect(200)).body;
    expect(stats.subscriptions.active).toBeGreaterThan(0);
    expect(stats.users.CLIENT).toBeGreaterThan(0);
  });

  it('personnalise un modèle de notification et traite une réclamation', async () => {
    await ctx.http().put('/api/admin/templates/queue_called/fr').set(auth(admin)).send({ title: 'À vous !', body: 'Ticket {{number}} chez {{salon}}' }).expect(200);
    const templates = (await ctx.http().get('/api/admin/templates').set(auth(admin))).body;
    expect(templates.find((t: { key: string; locale: string }) => t.key === 'queue_called' && t.locale === 'fr')).toMatchObject({ title: 'À vous !', customized: true });
    await ctx.http().delete('/api/admin/templates/queue_called/fr').set(auth(admin)).expect(200);

    const user = await newUser(ctx);
    const complaint = (await ctx.http().post('/api/complaints').set(auth(user)).send({ subject: 'Problème', message: 'Mon rendez-vous a été annulé sans prévenir.' }).expect(201)).body;
    await ctx.http().post(`/api/admin/complaints/${complaint.id}`).set(auth(admin)).send({ status: 'RESOLVED', adminReply: 'Nous avons contacté le salon.' }).expect(200);
    expect((await ctx.http().get('/api/me/complaints').set(auth(user))).body[0]).toMatchObject({ status: 'RESOLVED', adminReply: 'Nous avons contacté le salon.' });
  });
});

describe('fichiers', () => {
  it("valide le contenu réel des fichiers envoyés et ne sert pas les preuves de paiement publiquement", async () => {
    const { pro, paymentId } = await newPublishedSalon(ctx, admin);
    await ctx.http().post('/api/pro/salon/logo').set(auth(pro)).attach('file', Buffer.from('<script>alert(1)</script>'), 'logo.png').expect(400);
    await ctx.http().post('/api/pro/salon/logo').set(auth(pro)).attach('file', Buffer.from('%PDF-1.4 faux document'), 'logo.pdf').expect(400);
    const ok = (await ctx.http().post('/api/pro/salon/logo').set(auth(pro)).attach('file', PNG, 'logo.png').expect(201)).body;
    expect(ok.logoUrl).toMatch(/^\/uploads\/public\/logos\/[\w-]+\.png$/);
    await ctx.http().get(ok.logoUrl).expect(200);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await ctx.http().get(`/uploads/${payment.proofKey}`).expect(404);
    await ctx.http().get(`/api/pro/billing/payments/${paymentId}/proof`).expect(401);
    await ctx.http().get(`/api/pro/billing/payments/${paymentId}/proof`).set(auth(pro)).expect(200).expect('content-type', /image\/png/);
    await ctx.http().get(`/api/admin/payments/${paymentId}/proof`).set(auth(admin)).expect(200);
  });
});
