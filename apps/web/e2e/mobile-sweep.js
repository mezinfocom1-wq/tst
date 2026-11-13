// Vérifie qu'aucune page ne déborde en largeur sur un téléphone (390 px par défaut ; WIDTH=360 pour un petit écran).
// Prérequis : API et site démarrés avec les données de démonstration.
// Usage : node apps/web/e2e/mobile-sweep.js
// Parcourt les pages à la taille d'un téléphone et signale tout débordement horizontal.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const bad = [];
  const visit = async (page, path, prepare) => {
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle').catch(() => {});
    if (prepare) await prepare(page).catch((e) => console.log('  (préparation impossible sur', path, ':', e.message.split('\n')[0], ')'));
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.right <= doc.clientWidth + 1) return false;
        // Un élément qui dépasse à l'intérieur d'une zone défilante voulue (tableau, bandeau) n'est pas un défaut.
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden') return false;
        }
        return true;
      }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')}`);
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
    });
    const overflow = r.scrollWidth > r.clientWidth + 1;
    if (overflow) bad.push(`${path} : ${r.scrollWidth}px pour ${r.clientWidth}px → ${r.wide.join(' ; ')}`);
    console.log(overflow ? 'DÉBORDE ' : 'ok      ', path);
  };
  const session = async (email, password, start) => {
    const page = await (await browser.newContext({ viewport: { width: Number(process.env.WIDTH || 390), height: 800 }, isMobile: true, hasTouch: true })).newPage();
    if (email) {
      await page.goto(BASE + '/fr/login');
      await page.fill('input[type=email]', email); await page.fill('input[type=password]', password); await page.click('button[type=submit]');
      await page.waitForURL(start);
    }
    return page;
  };
  const pickService = async (p) => { await p.locator('select').first().selectOption({ index: 1 }); await p.waitForSelector('.grid button.tabular-nums', { timeout: 8000 }); };

  let page = await session();
  for (const path of ['/fr', '/ar', '/fr/salons', '/ar/salons', '/fr/salons/barber-atlas', '/ar/salons/barber-atlas', '/fr/pricing', '/fr/login', '/fr/register', '/fr/legal/privacy']) await visit(page, path);
  await visit(page, '/fr/salons', async (p) => { await p.click('button:has-text("Filtres")'); await p.click('button:has-text("Carte")'); });

  page = await session('client@demo.ma', 'Demo!12345', /\/account/);
  for (const tab of ['appointments', 'tickets', 'loyalty', 'notifications', 'profile']) await visit(page, `/fr/account?tab=${tab}`);
  await visit(page, '/ar/account?tab=appointments');
  await visit(page, '/fr/salons/barber-atlas/book', pickService);
  await visit(page, '/ar/salons/barber-atlas/book', pickService);
  await visit(page, '/fr/salons/barber-atlas/queue');
  await visit(page, '/fr/support');
  await visit(page, '/fr/become-pro');

  page = await session('pro1@demo.ma', 'Demo!12345', /\/pro/);
  for (const path of ['', '/agenda', '/queue', '/services', '/team', '/clients', '/reviews', '/loyalty', '/stats', '/salon', '/billing']) await visit(page, `/fr/pro${path}`);
  await visit(page, '/ar/pro/queue');
  await visit(page, '/fr/pro/team', async (p) => { await p.locator('button:has-text("Horaires")').first().click(); await p.waitForSelector('[role=dialog]'); });

  page = await session(process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD || 'ChangeMe!12345', /\/admin/);
  for (const path of ['', '/applications', '/salons', '/payments', '/plans', '/users', '/settings', '/audit', '/complaints']) await visit(page, `/fr/admin${path}`);

  console.log(bad.length ? `\n${bad.length} page(s) qui débordent :\n` + bad.join('\n') : '\nAucun débordement horizontal.');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC', e.message.split('\n').slice(0, 4).join('\n')); process.exit(2); });
