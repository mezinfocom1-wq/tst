# Architecture cible préliminaire

> Statut global : **PROPOSITION**. Rien n'est figé avant la Phase 2.
> Les versions exactes et la compatibilité entre outils seront vérifiées dans les documentations officielles au moment du choix définitif (décision D-18). Aucun élément ci-dessous n'a été installé ni testé.

## 1. Vue d'ensemble

```
        Web (Next.js)                     Mobile (React Native / Expo)
 marketplace · client · pro · admin        client · professionnel
             │                                      │
             └──────────────┬───────────────────────┘
                            │ HTTPS — API REST (OpenAPI) + temps réel
                 ┌──────────▼──────────┐
                 │  API — monolithe    │
                 │  modulaire (NestJS) │
                 └───┬─────┬─────┬─────┘
                     │     │     │
        ┌────────────▼┐ ┌──▼───┐ ┌▼──────────────────┐
        │ PostgreSQL  │ │Redis │ │ Stockage objet S3 │
        │ + PostGIS   │ │      │ │ (images, preuves) │
        └─────────────┘ └──┬───┘ └───────────────────┘
                           │ tâches différées
                 ┌─────────▼──────────┐
                 │ Worker (même code) │──► Push (FCM / APNs) · Email
                 └────────────────────┘
```

Un seul dépôt (monorepo) contenant l'API, le Web, le mobile et des paquets partagés (types, client d'API généré depuis OpenAPI, traductions).

## 2. Modules de l'API

| Module | Responsabilité |
|--------|----------------|
| `auth` | Inscription, connexion, Google OAuth, sessions, vérification email, reset |
| `users` | Profils client et professionnel |
| `organizations` / `salons` | Locataire, salon, membres, statuts de validation |
| `catalog` | Services, tarifs, durées, compétences par professionnel |
| `scheduling` | Horaires, pauses, absences, calcul des disponibilités |
| `booking` | Rendez-vous individuels et de groupe, statuts, historique |
| `queue` | Tickets, attribution automatique, positions, estimation |
| `marketplace` | Recherche, filtres, géolocalisation, classement |
| `loyalty` | Règles, points, récompenses |
| `reviews` | Avis, notes, modération |
| `notifications` | Push, email, modèles, préférences, historique |
| `billing` | Plans, abonnements, paiements manuels, reçus |
| `admin` | Validation, suspension, configuration, statistiques globales |
| `audit` | Journal des actions sensibles |
| `files` | Envoi et validation des fichiers |

Chaque module expose une interface publique ; les autres modules ne lisent pas ses tables directement. Cette discipline permet d'extraire un module plus tard si nécessaire, sans microservices aujourd'hui.

## 3. Multi-tenant

- **Base partagée, schéma partagé** : chaque table métier porte un identifiant de locataire.
- **Double barrière** :
  1. contrôle applicatif (le locataire est déduit de la session, jamais d'un paramètre envoyé par le client) ;
  2. *Row-Level Security* PostgreSQL : même en cas d'oubli d'un filtre dans le code, la base refuse de renvoyer les lignes d'un autre salon.
- Les données de la marketplace (lecture publique) passent par des vues ou requêtes dédiées limitées aux salons approuvés.

Exemple : si un développeur oublie `WHERE salon_id = …` dans une requête de rendez-vous, la RLS renvoie uniquement les lignes du salon courant au lieu de celles de tous les salons.

Alternatives écartées à ce stade : une base par salon (coût et exploitation lourds pour des milliers de petits salons) ; un schéma par salon (migrations complexes).

## 4. Protection contre les doubles réservations

- Chaque créneau occupé est un intervalle de temps rattaché à un professionnel.
- **Contrainte d'exclusion PostgreSQL** : la base interdit physiquement deux intervalles qui se chevauchent pour le même professionnel.
- Réservation de groupe : toutes les lignes sont insérées dans **une seule transaction** ; si une seule échoue, tout est annulé (atomicité).
- Requêtes de création **idempotentes** (clé d'idempotence) pour neutraliser les doubles clics et les ré-essais réseau.

Exemple : deux clients valident le créneau de 15 h au même instant. La première insertion réussit, la seconde est rejetée par la base et le client reçoit « ce créneau vient d'être pris ».

Point de vigilance : les contraintes d'exclusion et les types géographiques ne sont pas décrits nativement dans le schéma Prisma ; ils devront être écrits en SQL dans les migrations. À vérifier avant de confirmer l'ORM.

## 5. File d'attente et temps réel

- État de référence dans PostgreSQL (tickets, statuts, historique).
- Diffusion des positions et estimations en temps réel (WebSocket ou SSE — à comparer en Phase 2).
- Service d'estimation derrière une interface unique : implémentation par calcul au départ, remplaçable par un modèle prédictif sans modifier les appelants.

## 6. Comparaison préliminaire des technologies

| Domaine | Options | Recommandation préliminaire | Raison principale |
|---------|---------|-----------------------------|-------------------|
| Web | Next.js · Remix · Nuxt | Next.js | Rendu serveur pour le référencement de la marketplace, écosystème React partagé avec le mobile |
| Mobile | React Native + Expo · Flutter · natif | React Native + Expo | Une seule base de code Android / iOS, même langage que le Web et l'API |
| Backend | NestJS · Fastify seul · Django · Laravel | NestJS | Structure modulaire imposée, TypeScript de bout en bout, OpenAPI intégré |
| API | REST + OpenAPI · GraphQL · tRPC | REST + OpenAPI | Simple, documentable, client généré pour Web et mobile |
| Base de données | PostgreSQL · MySQL · MongoDB | PostgreSQL + PostGIS | Transactions, contraintes d'exclusion, RLS, recherche géographique |
| ORM | Prisma · Drizzle · TypeORM | Prisma ou Drizzle — À CONFIRMER | Prisma : productivité ; Drizzle : plus proche du SQL (RLS, contraintes) |
| Authentification | Interne (NestJS) · Auth0 / Clerk · Keycloak · Supabase Auth | Interne — À CONFIRMER | Maîtrise des rôles et de la validation professionnelle, pas de coût par utilisateur |
| Tâches différées | BullMQ (Redis) · pg-boss | BullMQ ou pg-boss — À CONFIRMER | Rappels, expirations d'abonnement, envois |
| Push | FCM (+ APNs) · Expo Push · OneSignal | FCM | Demandé, gratuit, couvre Android et iOS |
| Email | Service transactionnel (Resend, Brevo, Amazon SES…) | À CONFIRMER | Délivrabilité, coût, localisation |
| Stockage | S3 · Cloudflare R2 · MinIO | Compatible S3 — fournisseur À CONFIRMER | URL signées, pas de fichiers sur le serveur d'API |
| Cartographie | Google Maps · Mapbox · OpenStreetMap (MapLibre) | À CONFIRMER | Arbitrage coût / qualité des données au Maroc |
| Hébergement | Cloud public · VPS · hébergeur marocain | À CONFIRMER (D-16) | Dépend des exigences CNDP et du budget |
| CI/CD | GitHub Actions | GitHub Actions | Dépôt déjà sur GitHub |
| Monitoring | Sentry + métriques / journaux | À CONFIRMER | Erreurs applicatives et supervision |

## 7. Sécurité (principes)

- Mots de passe hachés (Argon2id), jetons d'accès courts, jetons de rafraîchissement rotatifs et révocables.
- RBAC + contrôle d'appartenance au salon sur chaque requête.
- Validation systématique des entrées, requêtes paramétrées, limitation de débit sur l'authentification.
- Fichiers : type réel vérifié, taille limitée, stockage privé pour les preuves de paiement, accès par URL signée.
- Secrets hors du dépôt, sauvegardes chiffrées et testées, journal d'audit non modifiable.
- Dates stockées en UTC, affichées en `Africa/Casablanca` (gère le changement d'heure pendant le Ramadan).

## 8. Environnements

Développement → test (préproduction) → production, déployés par CI/CD, avec migrations de base versionnées.
