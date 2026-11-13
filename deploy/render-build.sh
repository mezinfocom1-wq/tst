#!/usr/bin/env bash
# Construction pour un hébergement « un seul service » (site + API dans le même conteneur), par exemple Render.
# Les dépendances de développement sont nécessaires à la construction, d'où NODE_ENV=development pour l'installation.
set -euo pipefail
PNPM="npx --yes pnpm@10.28.0"
NODE_ENV=development $PNPM install --frozen-lockfile
$PNPM --filter @salon/api build
$PNPM --filter @salon/web build
