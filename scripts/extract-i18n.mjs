// Liste les textes français passés à t('…') dans le code Web et mobile, et signale ceux
// qui n'ont pas encore de traduction arabe. Usage : node scripts/extract-i18n.mjs [--missing]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps/web/src', 'apps/mobile/src', 'apps/mobile/app'];
const files = [];
const walk = (dir) => {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name) && !/(^|\/)ar\.ts$/.test(path)) files.push(path);
  }
};
roots.forEach(walk);

const found = new Set();
const pattern = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
// Tableaux de libellés traduits indirectement : t(LABELS[x]).
const labelPattern = /\[\s*'([^']+)'\s*,\s*'(?:neutral|ok|warn|danger|info|brand)'\s*\]/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(pattern)) found.add((m[1] ?? m[2]).replace(/\\'/g, "'"));
  if (/labels\.ts$/.test(file) || /loyalty\/page\.tsx$/.test(file)) {
    for (const m of text.matchAll(labelPattern)) found.add(m[1]);
    for (const m of text.matchAll(/:\s*'([A-ZÀ-Ý][^']+)'/g)) found.add(m[1]);
  }
}
const dict = readFileSync('apps/web/src/lib/ar.ts', 'utf8');
const all = [...found].sort((a, b) => a.localeCompare(b, 'fr'));
const missing = all.filter((s) => !dict.includes(JSON.stringify(s) + ':') );
const out = process.argv.includes('--missing') ? missing : all;
console.log(JSON.stringify(out, null, 0));
console.error(`${all.length} textes, ${missing.length} sans traduction arabe`);
