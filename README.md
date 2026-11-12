# Salonat — réservation et gestion de salons de coiffure et barbershops (Maroc)

Marketplace pour les clients, espace de gestion pour les professionnels, back-office pour le Super Admin.
Rendez-vous individuels et de groupe, file d'attente virtuelle avec QR Code, fidélité, avis, abonnements à paiement manuel.
Français et arabe (RTL), dirham, fuseau horaire du Maroc.

| Partie | Technologie | Dossier |
|--------|-------------|---------|
| API | NestJS 11, PostgreSQL 16, Prisma 6 | `apps/api` |
| Site Web | Next.js 15, React 19, Tailwind CSS 4 | `apps/web` |
| Application mobile | Expo SDK 54 (Android, iOS) | `apps/mobile` |

Documentation : [cahier des charges et état de réalisation](docs/01-cahier-des-charges.md) · [architecture](docs/02-architecture.md) · [déploiement et exploitation](docs/03-exploitation.md).

## Démarrage en développement

Prérequis : Node.js 22, pnpm 10, PostgreSQL 16.

```bash
# 1. Base de données
createuser salon --pwprompt --createdb          # mot de passe : salon
createdb salon --owner salon

# 2. Dépendances et configuration
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Schéma et données initiales (SEED_DEMO=true ajoute 4 salons de démonstration)
pnpm db:migrate
SEED_DEMO=true pnpm db:seed

# 4. Lancement (deux terminaux)
pnpm dev:api        # http://localhost:4000/api — documentation : /api/docs
pnpm dev:web        # http://localhost:3000
```

Comptes créés par le seed :

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Super Admin | `admin@example.com` | `ChangeMe!12345` (variables `SUPER_ADMIN_*`) |
| Client (démonstration) | `client@demo.ma` | `Demo!12345` |
| Professionnels (démonstration) | `pro1@demo.ma` … `pro4@demo.ma` | `Demo!12345` |

Sans SMTP configuré, les emails (vérification, mot de passe oublié) sont écrits dans le journal de l'API.

Application mobile : voir [`docs/03-exploitation.md`](docs/03-exploitation.md#4-application-mobile).

## Tests

```bash
createdb salon_test --owner salon
pnpm --filter @salon/api test       # 44 tests : sécurité, isolation entre salons, réservations simultanées, file, abonnements
pnpm --filter @salon/web typecheck && pnpm --filter @salon/web build
cd apps/mobile && npm run typecheck
node apps/web/e2e/smoke.js          # parcours complets dans un navigateur (API et site démarrés, données de démonstration)
```

## Déploiement

`docker compose up -d --build` après avoir copié `deploy/.env.example` vers `.env`. Détail et liste de contrôle : [`docs/03-exploitation.md`](docs/03-exploitation.md).
