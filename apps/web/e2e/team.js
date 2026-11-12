// Test navigateur : invitation d'un membre d'équipe, droits limités, retrait d'accès, suppression de compte.
// Prérequis : API et site démarrés, données de démonstration, accès psql à la base de développement (lecture du lien d'invitation).
// Usage : node apps/web/e2e/team.js
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const sql = (q) => execSync(`PGPASSWORD=salon psql -h localhost -U salon -d salon -tAc "${q}"`).toString().trim();
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    return page;
  };
  const stamp = Date.now();
  const email = `membre${stamp}@test.ma`;

  // Le futur membre crée son compte (email vérifié directement en base pour le test).
  const member = await newPage();
  await member.goto(`${BASE}/fr/register`);
  await member.fill('input[autocomplete=given-name]', 'Youssef');
  await member.fill('input[autocomplete=family-name]', 'Test');
  await member.fill('input[type=email]', email);
  await member.fill('input[type=password]', 'Demo!12345');
  await member.click('button[type=submit]');
  await member.waitForURL(/\/account/);
  sql(`update \\"User\\" set \\"emailVerifiedAt\\" = now() where email = '${email}'`);

  // Le propriétaire invite Youssef.
  const owner = await newPage();
  await owner.goto(`${BASE}/fr/login`);
  await owner.fill('input[type=email]', 'pro1@demo.ma'); await owner.fill('input[type=password]', 'Demo!12345'); await owner.click('button[type=submit]');
  await owner.waitForURL(/\/pro/);
  await owner.goto(`${BASE}/fr/pro/team`);
  await owner.waitForSelector('text=Inviter à se connecter');
  await owner.locator('button:has-text("Inviter à se connecter")').first().click();
  await owner.fill('input[type=email]', email);
  await owner.click('text=Envoyer l’invitation');
  await owner.waitForSelector(`text=Invitation envoyée à ${email}`);
  await owner.screenshot({ path: `${S}/20-team-invited.png`, fullPage: true });
  console.log('invitation envoyée');

  // Le lien de l'email (lu dans l'historique des notifications).
  const body = sql(`select body from \\"Notification\\" n join \\"User\\" u on u.id = n.\\"userId\\" where u.email = '${email}' and n.type = 'team_invite' order by n.\\"createdAt\\" desc limit 1`);
  const token = /token=([\w-]+)/.exec(body)[1];
  await member.goto(`${BASE}/fr/join-team?token=${token}`);
  await member.waitForSelector('text=Rejoindre Barber Atlas');
  await member.screenshot({ path: `${S}/21-join-team.png` });
  await member.click('text=Accepter l’invitation');
  await member.waitForURL(/\/fr\/pro$/);
  await member.waitForSelector('text=Rendez-vous aujourd’hui');
  const menu = await member.locator('nav a').allTextContents();
  console.log('menu du membre :', menu.filter((x) => /Statistiques|Abonnement|Clients|Planning|File/.test(x)).join(' | '));
  await member.screenshot({ path: `${S}/22-member-dashboard.png` });
  await member.goto(`${BASE}/fr/pro/queue`);
  await member.waitForSelector('text=Appeler le suivant');
  console.log('membre : accès à la file confirmé');

  // Retrait de l'accès par le propriétaire.
  await owner.reload();
  await owner.waitForSelector(`text=Compte de connexion : ${email}`);
  await owner.click('text=Retirer l’accès');
  await owner.waitForSelector('text=Inviter à se connecter');
  await member.goto(`${BASE}/fr/pro`);
  await member.waitForSelector('text=Vous n’avez pas accès à cet espace');
  console.log('accès retiré : espace professionnel refusé');

  // Suppression du compte par son titulaire.
  await member.goto(`${BASE}/fr/account?tab=profile`);
  await member.waitForSelector('text=Mes données');
  await member.screenshot({ path: `${S}/23-profile-data.png`, fullPage: true });
  await member.click('text=Supprimer mon compte');
  await member.locator('[role=dialog] input[type=password]').fill('Demo!12345');
  await member.click('button:has-text("Supprimer définitivement")');
  await member.waitForURL(/\/fr$/);
  console.log('compte supprimé → email en base :', sql(`select count(*) from \\"User\\" where email = '${email}'`), 'ligne(s) avec l’ancienne adresse');
  console.log('erreurs navigateur :', errors.length ? errors : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e.message.split('\n').slice(0, 5).join('\n')); process.exit(1); });
