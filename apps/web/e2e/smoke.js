// Test de bout en bout dans un navigateur réel (Playwright).
// Prérequis : API et site démarrés, base initialisée avec SEED_DEMO=true, salons ouverts à l'heure du test.
// Usage : node apps/web/e2e/smoke.js
const { chromium } = require('playwright');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
    return page;
  };
  const login = async (page, email, password) => {
    await page.goto(`${BASE}/fr/login`);
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/(account|pro|admin)/);
  };

  // 1. Pages publiques
  let page = await newPage();
  await page.goto(`${BASE}/`);
  log('redirect →', page.url());
  await page.waitForSelector('text=Salons recommandés');
  await page.screenshot({ path: `${S}/01-home-fr.png` });
  await page.goto(`${BASE}/ar`);
  log('dir ar =', await page.getAttribute('html', 'dir'), '| h1 =', await page.textContent('h1'));
  await page.screenshot({ path: `${S}/02-home-ar.png` });
  await page.goto(`${BASE}/fr/salons?city=Casablanca`);
  await page.waitForSelector('text=Barber Atlas');
  log('résultats Casablanca =', await page.locator('a[href*="/salons/"] h3').count());
  await page.screenshot({ path: `${S}/03-search.png` });
  await page.goto(`${BASE}/fr/salons/barber-atlas`);
  await page.waitForSelector('text=Prestations et tarifs');
  await page.waitForSelector('text=en attente');
  await page.screenshot({ path: `${S}/04-salon.png`, fullPage: true });

  // 2. Client : réservation de groupe
  await page.goto(`${BASE}/fr/salons/barber-atlas/book`);
  await page.waitForSelector('text=Connectez-vous pour réserver');
  await page.click('text=Connexion >> nth=-1');
  await page.fill('input[type=email]', 'client@demo.ma');
  await page.fill('input[type=password]', 'Demo!12345');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/book/);
  log('retour après connexion →', page.url());
  await page.waitForSelector('text=1. Prestations');
  await page.locator('select').nth(0).selectOption({ index: 1 });
  await page.click('text=Ajouter une personne');
  await page.locator('input[placeholder*="Prénom"]').fill('Yanis');
  await page.locator('select').nth(2).selectOption({ index: 2 });
  await page.locator('button:has-text("' + new Date(Date.now() + 86400000).getUTCDate() + '")').first().click();
  await page.waitForSelector('.grid button.tabular-nums');
  await page.locator('.grid button.tabular-nums').nth(3).click();
  await page.screenshot({ path: `${S}/05-booking.png`, fullPage: true });
  await page.click('text=Confirmer la réservation');
  await page.waitForSelector('text=Réservation confirmée');
  log('réservation de groupe : confirmée');
  await page.screenshot({ path: `${S}/06-booked.png` });

  // 3. Client : file d'attente
  await page.goto(`${BASE}/fr/salons/barber-atlas/queue`);
  const already = await page.locator('text=Quitter la file').count();
  if (!already) {
    await page.waitForSelector('text=Prendre mon ticket');
    await page.locator('select').nth(0).selectOption({ index: 1 });
    await page.click('text=Prendre mon ticket');
  }
  await page.waitForSelector('text=Quitter la file');
  log('ticket :', (await page.locator('.font-display.text-5xl').textContent()).trim());
  await page.screenshot({ path: `${S}/07-ticket.png` });
  await page.goto(`${BASE}/fr/account`);
  await page.waitForSelector('text=À venir');
  await page.screenshot({ path: `${S}/08-account.png`, fullPage: true });

  // 4. Professionnel
  const pro = await newPage();
  await login(pro, 'pro1@demo.ma', 'Demo!12345');
  await pro.waitForSelector('text=Rendez-vous aujourd’hui');
  await pro.screenshot({ path: `${S}/09-pro-dashboard.png`, fullPage: true });
  await pro.goto(`${BASE}/fr/pro/queue`);
  await pro.waitForSelector('text=Appeler le suivant');
  await pro.screenshot({ path: `${S}/10-pro-queue.png`, fullPage: true });
  await pro.locator('button:has-text("Appeler le suivant")').first().click();
  await pro.waitForSelector('button:has-text("Démarrer")');
  // Le ticket du client passe à « appelé » en direct.
  await page.goto(`${BASE}/fr/salons/barber-atlas/queue`);
  await page.waitForSelector('text=C’est votre tour');
  log('client notifié : c’est votre tour');
  await page.screenshot({ path: `${S}/11-ticket-called.png` });
  await pro.locator('button:has-text("Démarrer")').first().click();
  await pro.waitForSelector('button:has-text("Terminer")');
  await pro.locator('button:has-text("Terminer")').first().click();
  await pro.waitForSelector('text=Tickets traités aujourd’hui');
  log('file : appelé → démarré → terminé');
  for (const [path, marker] of [['agenda', 'Nouveau rendez-vous'], ['services', 'Coupe homme'], ['team', 'Horaires'], ['salon', 'QR Code du salon'], ['clients', 'Clients'], ['reviews', 'Avis'], ['loyalty', 'Règles du programme'], ['stats', 'Chiffre d’affaires'], ['billing', 'Formules']]) {
    await pro.goto(`${BASE}/fr/pro/${path}`);
    await pro.waitForSelector(`text=${marker}`);
    await pro.waitForTimeout(600);
    await pro.screenshot({ path: `${S}/12-pro-${path}.png`, fullPage: true });
  }
  await pro.goto(`${BASE}/ar/pro`);
  await pro.waitForSelector('text=لوحة القيادة');
  await pro.screenshot({ path: `${S}/13-pro-ar.png` });

  // 5. Super Admin
  const admin = await newPage();
  await login(admin, 'admin@example.com', 'ChangeMe!12345');
  await admin.waitForSelector('text=Abonnements actifs');
  await admin.screenshot({ path: `${S}/14-admin.png`, fullPage: true });
  for (const [path, marker] of [['applications', 'Demandes d’accès'], ['salons', 'Un salon n’est publié'], ['payments', 'Paiements et abonnements'], ['plans', 'Starter'], ['users', 'compte(s)'], ['settings', 'Nom de la plateforme'], ['audit', 'Journal d’activité'], ['complaints', 'Modération des avis']]) {
    await admin.goto(`${BASE}/fr/admin/${path}`);
    await admin.waitForSelector(`text=${marker}`);
    await admin.waitForTimeout(500);
    await admin.screenshot({ path: `${S}/15-admin-${path}.png`, fullPage: true });
  }
  // Cloisonnement des espaces côté interface
  await page.goto(`${BASE}/fr/admin`);
  await page.waitForSelector('text=Vous n’avez pas accès à cet espace');
  log('client → /admin : accès refusé');

  // 6. Mobile
  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`${BASE}/fr/salons/barber-atlas`);
  await mobile.waitForSelector('text=Prestations et tarifs');
  await mobile.screenshot({ path: `${S}/16-mobile-salon.png` });
  await mobile.goto(`${BASE}/ar/salons`);
  await mobile.waitForSelector('h3');
  await mobile.screenshot({ path: `${S}/17-mobile-search-ar.png` });

  log('erreurs navigateur :', errors.length ? errors : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
