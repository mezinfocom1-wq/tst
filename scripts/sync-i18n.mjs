// Copie le dictionnaire arabe du site Web vers l'application mobile (source unique : apps/web/src/lib/ar.ts).
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'apps/web/src/lib/ar.ts'), join(root, 'apps/mobile/src/ar.ts'));
console.log('Dictionnaire arabe copié vers apps/mobile/src/ar.ts');
