# Cahier des charges — Plateforme de réservation et de gestion de salons de coiffure / barbershops (Maroc)

> Document vivant. Mis à jour à chaque décision.
> Légende : **VALIDÉ** = décidé par le porteur du projet · **PROPOSITION** = recommandation en attente de validation · **À CONFIRMER** = décision ouverte.

Version : 0.3 — Phase 1 (finalisation des exigences) — aucun code écrit à ce stade.

---

## 1. Synthèse du projet

Plateforme hybride destinée au marché marocain :

- **Marketplace** : les clients découvrent, comparent et réservent des salons / barbershops.
- **SaaS** : chaque professionnel gère son activité dans un espace isolé (multi-tenant).
- **Réservation** de rendez-vous (individuelle et de groupe).
- **File d'attente virtuelle** avec QR Code, ticket numérique et estimation du temps d'attente.
- **Canaux** : Web (public, client, professionnel, Super Admin) + application mobile Android/iOS (client et professionnel).

## 2. Exigences validées (issues du cahier des charges initial)

| # | Exigence | Statut |
|---|----------|--------|
| V-01 | Trois catégories d'utilisateurs : Super Admin, Professionnel, Client | VALIDÉ |
| V-02 | Le propriétaire est lui-même un professionnel (pas d'entité « propriétaire » séparée) | VALIDÉ |
| V-03 | Un compte = un seul rôle principal | VALIDÉ (portée précisée par V-26) |
| V-04 | Accès professionnel soumis à validation du Super Admin | VALIDÉ |
| V-05 | Client : inscription email + mot de passe ou Google OAuth 2.0, vérification email, reset mot de passe | VALIDÉ |
| V-06 | Compte obligatoire pour réserver ou rejoindre une file ; consultation publique sans connexion | VALIDÉ |
| V-07 | Page publique par salon (infos, carte, photos, services, tarifs, avis, boutons réserver / file) | VALIDÉ |
| V-08 | Recherche avec filtres + recherche géographique sur carte | VALIDÉ |
| V-09 | Classement des salons configurable, non figé avant validation | VALIDÉ |
| V-10 | Réservation classique avec vérification temps réel, sans double réservation | VALIDÉ |
| V-11 | Réservation de groupe avec confirmation atomique (tout ou rien) | VALIDÉ |
| V-12 | Tolérance de retard et gestion des absences configurables par salon, avec historique des statuts | VALIDÉ |
| V-13 | File d'attente : QR Code unique par salon, ticket, position, estimation, option « Peu importe » | VALIDÉ |
| V-14 | Estimation d'attente d'abord par calcul (durées réelles, historique), architecture ouverte à un modèle prédictif | VALIDÉ |
| V-15 | Chaque professionnel gère ses horaires, pauses, absences, congés | VALIDÉ |
| V-16 | Programme de fidélité configurable par salon | VALIDÉ |
| V-17 | Notifications V1 : Push + Email uniquement (SMS / WhatsApp reportés) | VALIDÉ |
| V-18 | Abonnements payants, pas de formule gratuite au lancement, plans modifiables sans toucher au code | VALIDÉ |
| V-19 | Paiement manuel (virement + preuve + validation Super Admin). Une preuve n'active jamais automatiquement un abonnement | VALIDÉ |
| V-20 | Validation administrative du salon obligatoire avant publication, indépendante du paiement | VALIDÉ |
| V-21 | Web + Android + iOS dès la première version ; Super Admin sur le Web uniquement | VALIDÉ (voir risque R-01) |
| V-22 | Français + Arabe (RTL), devise MAD, fuseau horaire Maroc, i18n extensible | VALIDÉ |
| V-23 | Architecture modulaire (pas de microservices), multi-tenant avec isolation stricte, RBAC, journalisation | VALIDÉ |
| V-24 | Conformité à la réglementation marocaine sur les données personnelles | VALIDÉ |
| V-25 | Rendez-vous et file d'attente cohabitent en **mode hybride avec priorité au rendez-vous** : la file remplit les intervalles libres entre les rendez-vous ; un client de la file n'est pas lancé si sa prestation empiète sur un rendez-vous ; chaque salon peut désactiver l'un des deux modes (D-01) | VALIDÉ |
| V-26 | Le rôle professionnel **inclut les capacités client** : un professionnel peut réserver, rejoindre une file et cumuler des points dans d'autres salons avec son compte unique. Garde-fous : ni réservation ni avis dans son propre salon. Un client n'obtient jamais de droits professionnels sans validation du Super Admin (D-02) | VALIDÉ |

## 3. Contradictions et tensions identifiées

| # | Sujet | Constat | Piste de résolution |
|---|-------|---------|---------------------|
| C-01 | Propriétaire vs membres d'équipe | « Pas de distinction propriétaire / professionnel » mais aussi « vue globale du propriétaire », « permissions des membres », « abonnement géré par le propriétaire ». | Une seule entité *Professionnel* ; la différence est portée par l'*appartenance au salon* (rôle `OWNER` ou `MEMBER`), pas par le type de compte. |
| C-02 | Un seul rôle par compte | Un coiffeur ne pourrait pas réserver chez un confrère avec son compte professionnel. | **Résolu** : le rôle professionnel inclut les capacités client (V-26) |
| C-03 | Rendez-vous + file d'attente sur le même professionnel | Les deux modes consomment le même temps de travail ; aucune règle de priorité n'est définie. C'est le cœur du moteur de planification. | **Résolu** : mode hybride, priorité au rendez-vous (V-25) |
| C-04 | Compte obligatoire vs clients sans smartphone | Un client qui entre sans téléphone n'apparaît pas dans la file : les positions et estimations deviennent fausses. | Permettre au professionnel d'ajouter un « client de passage » manuellement. → D-05 |
| C-05 | Paiement vs validation du salon | Les deux validations sont indépendantes mais l'ordre n'est pas défini : que se passe-t-il si le paiement est validé et le salon refusé (remboursement ? date de début de l'abonnement ?). | → D-06 |
| C-06 | Statuts de paiement | « Expiré » et « Suspendu » sont des états d'abonnement, pas de paiement. | Deux machines à états distinctes : *Paiement* (en attente, à vérifier, validé, refusé) et *Abonnement* (en attente, actif, expiré, suspendu, annulé). PROPOSITION |
| C-07 | « Espace indépendant par professionnel » vs multi-salons | Le locataire (tenant) est-il le salon ou l'entreprise qui possède plusieurs salons ? | Modèle *Organisation → Salon(s)* dès le départ, avec un seul salon par organisation au MVP. → D-03 |
| C-08 | File d'attente à distance | Le bouton « rejoindre la file » sur la page publique permet de s'inscrire sans être sur place : risque de tickets fantômes. | Règle de présence / distance / confirmation. → D-04 |
| C-09 | Périmètre V1 très large | Toutes les fonctionnalités + 3 plateformes en « première version » est incompatible avec la notion de MVP. | Découpage en lots, section 6. → D-07 |
| C-10 | Email seul comme canal hors application | Au Maroc l'usage du téléphone / WhatsApp domine ; une vérification email bloquante peut réduire fortement la conversion, surtout devant le salon (QR Code). | À arbitrer : vérification email différée ou non bloquante pour la file. → D-08 |

## 4. Informations manquantes

**Métier**
- Politique d'annulation et de modification côté client (délai minimum, nombre maximum d'absences avant blocage).
- Prise de rendez-vous par le professionnel pour un client (téléphone, passage).
- Types de salons (homme / femme / mixte / enfants) et prestations à domicile éventuelles.
- Règles des avis : uniquement après une prestation réalisée ? modération ? droit de réponse du salon ?
- Fidélité : points propres à chaque salon (hypothèse) ou communs à la plateforme ? expiration des points ?
- Granularité des créneaux (5 / 10 / 15 min) et temps tampon entre prestations.
- Horaires spéciaux (Ramadan, jours fériés marocains).
- Limites par plan (nombre de membres, photos, salons) et tarifs.
- Période d'essai éventuelle (compatible avec « pas de formule gratuite » ?).
- Sous-comptes administrateurs (support, validation) ou Super Admin unique.

**Juridique et administratif**
- Statut juridique de l'éditeur (ICE, assujettissement à la TVA) → conditionne les factures.
- Démarches CNDP (loi 09-08) et localisation de l'hébergement (transfert de données hors Maroc soumis à formalités).
- CGU, CGV, politique de confidentialité, procédure de suppression de compte.

**Projet**
- Villes de lancement, volumétrie cible (salons, clients, réservations / jour).
- Budget d'infrastructure mensuel, calendrier souhaité.
- Nom de la marque, domaine, comptes développeur Apple et Google.

## 5. Décisions restantes (ordre de traitement proposé)

| # | Décision | Impact | Statut |
|---|----------|--------|--------|
| D-01 | Cohabitation rendez-vous / file d'attente pour un même professionnel | Moteur de planification, estimation, UX | **VALIDÉ** — option C, hybride avec priorité au rendez-vous |
| D-01b | Paramètres du mode hybride : débordement toléré ou non sur un rendez-vous, comportement si le client du rendez-vous est en retard | Moteur de planification | À CONFIRMER (traité avec D-09) |
| D-02 | Portée de « un seul rôle par compte » (un professionnel peut-il réserver comme client ?) | Modèle de comptes, application mobile | **VALIDÉ** — option B, le rôle professionnel inclut les capacités client |
| D-03 | Modèle Organisation / Salon / Membres et rôles d'équipe (les membres ont-ils leur propre connexion ?) | Multi-tenant, modèle de données | À CONFIRMER — **question en cours** |
| D-04 | File d'attente à distance : autorisée, limitée par distance, ou sur place uniquement | Anti-abus, géolocalisation | À CONFIRMER |
| D-05 | Clients de passage ajoutés par le professionnel (file et rendez-vous) | Fiabilité de la file, modèle client | À CONFIRMER |
| D-06 | Enchaînement inscription → validation salon → paiement → publication ; essai ; remboursement | Parcours professionnel, abonnements | À CONFIRMER |
| D-07 | Découpage MVP / V1.1 / V2 | Planning, charge | À CONFIRMER |
| D-08 | Vérification email bloquante ou non ; téléphone obligatoire ou non | Conversion, lutte contre les absences | À CONFIRMER |
| D-09 | Politique d'annulation, de retard et d'absence par défaut | Règles métier, notifications | À CONFIRMER |
| D-10 | Réservation de groupe : règles de planification (consécutif, parallèle, écart maximal) | Algorithme, atomicité | À CONFIRMER |
| D-11 | Plans, limites, tarifs, durée d'engagement | Modèle d'abonnement | À CONFIRMER |
| D-12 | Fidélité : périmètre, expiration, types de récompenses | Modèle de données | À CONFIRMER |
| D-13 | Avis : éligibilité, modération, réponse | Marketplace | À CONFIRMER |
| D-14 | Critères et pondérations du classement | Recherche | À CONFIRMER |
| D-15 | Facturation (mentions légales, TVA, numérotation) | Abonnements, conformité | À CONFIRMER |
| D-16 | Hébergement et localisation des données (CNDP) | Infrastructure | À CONFIRMER |
| D-17 | Connexion Apple sur iOS et gestion des abonnements hors application | Publication App Store | À CONFIRMER |
| D-18 | Choix techniques définitifs (Phase 2) | Architecture | À CONFIRMER |

## 6. Découpage MVP / évolutions — PROPOSITION (à valider en D-07)

**Lot 1 — MVP**
- Authentification client (email + Google), profil, sessions.
- Demande d'accès professionnel, validation Super Admin, statuts du salon.
- Salon : profil, logo, photos, services, tarifs, durées, horaires, pauses, absences.
- Marketplace : page publique, recherche par ville / quartier / prestation / note, carte.
- Réservation classique avec protection contre les doubles réservations.
- File d'attente : QR Code, ticket, position, estimation par calcul, « Peu importe ».
- Retards et absences : tolérance configurable, historique des statuts.
- Notifications Push + Email avec historique et préférences.
- Abonnements : plans configurables, paiement manuel, validation Super Admin, expiration.
- Back-office Super Admin : comptes, salons, paiements, journaux, statistiques de base.
- Français + Arabe (RTL), MAD, fuseau `Africa/Casablanca`.
- Web responsive + application mobile (client et professionnel).

**Lot 2 — V1.1**
- Réservation de groupe.
- Programme de fidélité.
- Avis et notes avec modération.
- Membres d'équipe avec permissions fines.
- Statistiques avancées, classement configurable par pondérations.
- Modèles de notifications personnalisables, reçus / factures PDF.

**Lot 3 — Évolutions**
- SMS / WhatsApp, paiement en ligne (CMI ou équivalent), acomptes.
- Multi-salons, personnalisation avancée de l'identité visuelle.
- Estimation prédictive (apprentissage automatique).
- Autres langues.

> Remarque : la réservation de groupe, la fidélité et les avis sont demandés dans le cahier des charges. Leur placement en Lot 2 est une proposition de phasage, pas une suppression.

## 7. Risques

| # | Risque | Gravité | Mesure envisagée |
|---|--------|---------|------------------|
| R-01 | Périmètre trop large pour une première version (3 plateformes, 2 modes de réservation, SaaS, back-office) | Élevée | Lots successifs, application mobile unique partageant le code |
| R-02 | Conflits de planification (doubles réservations, groupe partiel, concurrence) | Élevée | Contraintes en base de données + transactions + tests de concurrence |
| R-03 | Fuite de données entre salons | Élevée | Isolation au niveau base (RLS) en plus du contrôle applicatif, tests multi-tenant |
| R-04 | Refus de publication sur l'App Store (connexion tierce sans alternative, abonnement payé hors application) | Moyenne | Vérifier les règles Apple en vigueur ; gérer l'abonnement sur le Web uniquement — À VÉRIFIER |
| R-05 | Faible adoption à cause de l'email (vérification, notifications) | Moyenne | Push prioritaire, vérification non bloquante, SMS / WhatsApp en Lot 3 |
| R-06 | Absences et tickets fantômes dans la file | Moyenne | Tolérance, confirmation de présence, limitation par compte |
| R-07 | Estimations d'attente peu fiables au démarrage (pas d'historique) | Moyenne | Durées déclarées par défaut, corrigées progressivement par les durées réelles |
| R-08 | Non-conformité loi 09-08 / CNDP | Moyenne | Déclaration, registre des traitements, choix d'hébergement documenté — avis juridique requis |
| R-09 | Charge de validation manuelle (salons, paiements) pour un Super Admin unique | Faible à moyenne | File de traitement, notifications administratives, sous-comptes ultérieurs |

## 8. Journal des décisions

| Date | Décision | Réf. |
|------|----------|------|
| 2026-11-11 | Création du document à partir du cahier des charges initial. Aucune décision nouvelle. | — |
| 2026-11-11 | Cohabitation rendez-vous / file d'attente : mode hybride avec priorité au rendez-vous ; chaque salon peut désactiver l'un des deux modes. | D-01, V-25 |
| 2026-11-11 | Le rôle professionnel inclut les capacités client ; pas de réservation ni d'avis dans son propre salon. | D-02, V-26 |
