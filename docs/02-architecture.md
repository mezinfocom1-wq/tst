# Architecture

> Décrit ce qui est réellement développé. Les écarts par rapport à la proposition initiale sont listés en section 9.

## 1. Vue d'ensemble

```
        Web (Next.js 15)                    Mobile (Expo SDK 54 / React Native)
 marketplace · client · pro · admin           client · professionnel
             │  même origine (/api)                   │  HTTPS
             └──────────────┬─────────────────────────┘
                 ┌──────────▼──────────┐
                 │  API NestJS 11      │  REST + OpenAPI (/api/docs), SSE pour la file
                 │  monolithe modulaire│  tâches planifiées intégrées
                 └───┬────────────┬────┘
        ┌────────────▼┐      ┌────▼──────────────────────┐
        │ PostgreSQL  │      │ Fichiers : disque local   │
        │ 16 (Prisma) │      │ ou stockage compatible S3 │
        └─────────────┘      └───────────────────────────┘
                      Email : SMTP · Push : service Expo (relais FCM / APNs)
```

| Dossier | Contenu |
|---------|---------|
| `apps/api` | API NestJS, schéma et migrations Prisma, tests |
| `apps/web` | Site Next.js (App Router), français et arabe |
| `apps/mobile` | Application Expo (projet npm indépendant) |
| `deploy`, `docker-compose.yml` | Déploiement et sauvegarde |
| `scripts` | Outils de traduction |

## 2. Modules de l'API

| Dossier | Responsabilité |
|---------|----------------|
| `auth` | Inscription, connexion, Google, sessions, vérification email, demande professionnelle |
| `salons` | Marketplace (recherche, fiche, disponibilités), gestion du salon, équipe, horaires, tableau de bord, clients, statistiques |
| `scheduling` | Calcul des créneaux libres et planification de groupe (fonctions pures testées) |
| `booking` | Rendez-vous individuels et de groupe, statuts, rappels |
| `queue` | Tickets, estimation, appel, temps réel |
| `loyalty` | Programme, points, récompenses, bons |
| `reviews` | Avis et réponses |
| `notifications` | Modèles, envoi email et push, historique, appareils |
| `billing` | Formules, abonnements, paiements manuels, droits par formule |
| `admin` | Back-office, réclamations |
| `common` | Garde d'authentification, stockage, paramètres, journal d'audit, fuseau horaire |

## 3. Isolation entre salons

- Chaque table métier porte `salonId`.
- Sur les routes de l'espace professionnel, le salon est **déduit du compte connecté** par la garde d'authentification (`@ProSalon`), jamais lu dans un paramètre de la requête.
- Toute lecture ou modification par identifiant ajoute `salonId` au filtre : une ressource d'un autre salon répond « introuvable ».
- Les tests `isolation entre salons` vérifient qu'un professionnel ne peut ni lire ni modifier les prestations, l'équipe, les rendez-vous, les tickets, les paiements et les preuves d'un autre salon.

### Rôles dans un salon

| Action | Propriétaire | Membre invité |
|--------|:---:|:---:|
| Planning, file d'attente, ajout d'un client de passage | ✔ | ✔ |
| Ses propres horaires et absences | ✔ | ✔ |
| Horaires des autres, prestations, équipe, fiche et réglages du salon | ✔ | — |
| Fidélité (réglages), réponses aux avis | ✔ | — |
| Clients, statistiques, abonnement et paiements | ✔ | — |

Un membre est invité par email (lien à usage unique, valable 7 jours, lié à l'adresse invitée). Un compte n'appartient qu'à un seul salon.
Le retrait d'accès est immédiat : les droits sont relus en base à chaque requête.

## 4. Double réservation et atomicité

- Contrainte d'exclusion PostgreSQL sur `Appointment` (`staffId`, intervalle `startAt`–`endAt`) pour les statuts actifs : deux rendez-vous d'un même professionnel ne peuvent pas se chevaucher, quelle que soit la concurrence. Écrite en SQL dans la migration, car Prisma ne l'exprime pas.
- Une réservation (1 à 6 prestations) est insérée dans **une seule transaction** : si un créneau manque, rien n'est créé.
- Verrou consultatif par professionnel, pris dans un ordre fixe, pour éviter les interblocages entre demandes simultanées.
- Clé d'idempotence facultative : un double clic ou une nouvelle tentative réseau renvoie la réservation déjà créée.
- Numérotation des tickets sous verrou par salon ; un seul ticket actif par client et par salon (index unique partiel).

## 5. Mode hybride rendez-vous / file

- Pour chaque professionnel : temps libre = horaires − absences − rendez-vous − client en cours.
- La file est simulée dans ce temps libre : un ticket n'est placé que si sa durée tient avant le prochain rendez-vous ; un ticket court peut remplir un trou.
- « Peu importe » : le ticket prend le professionnel qualifié qui se libère le plus tôt.
- À l'appel, une prestation qui empiéterait sur un rendez-vous est refusée ; le professionnel peut forcer.
- Durées : moyenne réellement constatée par professionnel et par prestation sur 90 jours (à partir de 3 passages), sinon durée déclarée. Le calcul est derrière l'interface `DurationEstimator`, remplaçable par un modèle prédictif.
- Temps réel : flux SSE par salon (`/api/salons/:id/queue/stream`) ; le Web relit aussi toutes les 20 s, le mobile toutes les 10 s.

## 6. Authentification et sécurité

- Mots de passe hachés avec Argon2id ; verrouillage 15 minutes après 5 échecs.
- Jeton d'accès de 15 minutes ; jeton de rafraîchissement à usage unique, stocké haché, révoqué en cascade si rejoué.
- Web : jeton de rafraîchissement en cookie `httpOnly` `SameSite=Lax` limité à `/api/auth` ; jeton d'accès en mémoire uniquement. Mobile : stockage sécurisé du téléphone.
- Rôles vérifiés côté serveur à chaque requête ; un compte suspendu est bloqué immédiatement.
- Entrées validées et propriétés inconnues rejetées ; requêtes SQL paramétrées.
- Limitation de débit globale et renforcée sur l'authentification ; en-têtes de sécurité (Helmet, en-têtes Next.js).
- Fichiers : type vérifié sur le contenu, taille limitée ; preuves de paiement privées, servies par une route authentifiée et journalisée.
- Actions sensibles journalisées (`AuditLog`), consultables dans le back-office.
- Données personnelles : export complet (`GET /api/me/export`) et suppression du compte (`POST /api/me/delete`) — identité effacée, réservations futures annulées, historique des salons conservé sous forme anonyme.

## 7. Abonnements

- Formules en base, fonctionnalités et limites en JSON (`maxStaff`, `maxPhotos`, `loyalty`, `statistics`…) : une formule se crée ou se modifie depuis le back-office.
- Deux cycles distincts : paiement (en attente, à vérifier, validé, refusé) et abonnement (en attente, actif, expiré, suspendu, annulé).
- Seule la validation par le Super Admin active un abonnement. Renouvellement de la même formule : la période s'ajoute à la suite. Changement de formule : remplacement immédiat.
- Tâche horaire : expiration et avertissement 7 jours avant l'échéance.

## 8. Internationalisation

- Le texte français sert de clé ; `apps/web/src/lib/ar.ts` est le dictionnaire arabe unique, copié vers le mobile par `node scripts/sync-i18n.mjs`.
- `node scripts/extract-i18n.mjs --missing` liste les textes non traduits.
- Dates stockées en UTC, affichées et calculées en `Africa/Casablanca`.
- Ajouter une langue : un dictionnaire de plus et son code dans `LOCALES`.

## 9. Écarts par rapport à la proposition initiale

| Proposition | Réalisé | Raison |
|-------------|---------|--------|
| Row-Level Security PostgreSQL en seconde barrière | Non réalisé ; isolation applicative centralisée et testée | À ajouter comme durcissement avant une forte montée en charge |
| PostGIS | Distance calculée par formule de Haversine | Aucune extension à installer ; suffisant à cette échelle |
| Redis et file de tâches | Tâches planifiées dans l'API, diffusion temps réel en mémoire | Moins de composants à exploiter ; voir limites dans `03-exploitation.md` |
| FCM direct | Service Expo Push, qui relaie vers FCM et APNs | Fonctionne avec l'application Expo sans code natif Firebase ; l'interface `PushProvider` permet un envoi FCM direct |
| Organisation → salons | Un salon par propriétaire | Le multi-salons reste une évolution |
| Versions les plus récentes | NestJS 11, Prisma 6, Next.js 15, Expo SDK 54 | Versions stables connues ; des versions majeures plus récentes existent et pourront être adoptées par une montée de version dédiée |
