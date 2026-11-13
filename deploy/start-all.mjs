// Démarre le site et l'API dans un même conteneur (hébergement « un seul service », par exemple Render).
//   1. applique les migrations et les données initiales (opérations idempotentes) ;
//   2. lance l'API sur un port interne ;
//   3. lance le site sur le port public (PORT), qui relaie /api et /uploads vers l'API.
// Si l'un des deux processus s'arrête, l'autre est arrêté aussi : l'hébergeur relance alors le conteneur.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const web = join(root, 'apps/web');
const bin = (dir, name) => join(dir, 'node_modules/.bin', name);
const publicPort = process.env.PORT ?? '3000';
const apiPort = process.env.API_PORT ?? '4000';

function step(label, command, args, cwd) {
  console.log(`[démarrage] ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error(`[démarrage] échec : ${label}`);
    process.exit(result.status ?? 1);
  }
}

step('migrations de la base', bin(api, 'prisma'), ['migrate', 'deploy'], api);
step('données initiales', bin(api, 'tsx'), ['prisma/seed.ts'], api);

const children = [
  spawn('node', ['dist/main.js'], { cwd: api, stdio: 'inherit', env: { ...process.env, PORT: apiPort } }),
  spawn(bin(web, 'next'), ['start', '-p', publicPort, '-H', '0.0.0.0'], { cwd: web, stdio: 'inherit', env: { ...process.env, PORT: publicPort } }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
