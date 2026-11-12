// Copie vers l'application mobile les fichiers partagés dont le site Web est la source unique :
// le dictionnaire arabe (ar.ts) et le calcul de l'heure du Maroc (zone.ts).
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'apps/web/src/lib/ar.ts'), join(root, 'apps/mobile/src/ar.ts'));
copyFileSync(join(root, 'apps/web/src/lib/zone.ts'), join(root, 'apps/mobile/src/zone.ts'));
console.log('ar.ts et zone.ts copiés vers apps/mobile/src');
