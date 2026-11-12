# Cahier des charges — Plateforme de réservation et de gestion de salons de coiffure / barbershops (Maroc)

> Document vivant. Mis à jour à chaque décision.
> Légende : **VALIDÉ** = décidé par le porteur du projet · **PAR DÉFAUT** = recommandation appliquée sans validation explicite, réversible · **À CONFIRMER** = décision ouverte.

Version : 1.0 — première version développée. Les décisions encore ouvertes ont été tranchées par défaut à la demande du porteur du projet (section 5) et restent modifiables.

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
| C-04 | Compte obligatoire vs clients sans smartphone | Un client qui entre sans téléphone n'apparaît pas dans la file : les positions et estimations deviennent fausses. | Résolu : client de passage ajouté par le professionnel (D-05) |
| C-05 | Paiement vs validation du salon | Les deux validations sont indépendantes mais l'ordre n'est pas défini : que se passe-t-il si le paiement est validé et le salon refusé (remboursement ? date de début de l'abonnement ?). | Résolu (D-06) |
| C-06 | Statuts de paiement | « Expiré » et « Suspendu » sont des états d'abonnement, pas de paiement. | Deux machines à états distinctes : *Paiement* (en attente, à vérifier, validé, refusé) et *Abonnement* (en attente, actif, expiré, suspendu, annulé). Appliqué |
| C-07 | « Espace indépendant par professionnel » vs multi-salons | Le locataire (tenant) est-il le salon ou l'entreprise qui possède plusieurs salons ? | Un salon par propriétaire dans cette version ; le multi-salons reste une évolution (D-03) |
| C-08 | File d'attente à distance | Le bouton « rejoindre la file » sur la page publique permet de s'inscrire sans être sur place : risque de tickets fantômes. | Résolu : option « sur place uniquement » par salon (D-04) |
| C-09 | Périmètre V1 très large | Toutes les fonctionnalités + 3 plateformes en « première version » est incompatible avec la notion de MVP. | Tout le périmètre a été développé (D-07) |
| C-10 | Email seul comme canal hors application | Au Maroc l'usage du téléphone / WhatsApp domine ; une vérification email bloquante peut réduire fortement la conversion, surtout devant le salon (QR Code). | Résolu : email vérifié exigé pour réserver, pas pour la file (D-08) |

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

## 5. Décisions

Le 11 novembre 2026, le porteur du projet a demandé de construire le système sans poser d'autres questions.
Les décisions ci-dessous marquées **PAR DÉFAUT** ont donc été prises en appliquant la recommandation de l'équipe technique.
Elles sont toutes réversibles ; celles qui ne demandent qu'un réglage (sans développement) sont signalées.

| # | Décision | Choix appliqué | Statut |
|---|----------|----------------|--------|
| D-01 | Cohabitation rendez-vous / file d'attente | Hybride avec priorité au rendez-vous ; chaque salon peut désactiver l'un des deux modes | VALIDÉ |
| D-01b | Débordement sur un rendez-vous | Refusé par défaut ; le professionnel peut forcer après confirmation explicite | PAR DÉFAUT |
| D-02 | Un professionnel peut-il réserver comme client ? | Oui, dans les autres salons ; ni réservation ni avis dans le sien | VALIDÉ |
| D-03 | Membres d'équipe | Fiches gérées par le propriétaire ; il peut inviter un membre à se connecter avec son propre compte (planning, file, ses disponibilités — réglages, équipe, abonnement et statistiques restent au propriétaire). Un salon par compte | PAR DÉFAUT |
| D-04 | File à distance | Autorisée par défaut ; chaque salon peut la réserver aux clients sur place (QR Code obligatoire) — réglage | PAR DÉFAUT |
| D-05 | Clients de passage | Le professionnel peut ajouter un client sans compte à la file et saisir un rendez-vous pour un client au téléphone | PAR DÉFAUT |
| D-06 | Enchaînement professionnel | Demande → validation → création du salon → soumission → approbation ; abonnement payé en parallèle. Publication = salon approuvé **et** abonnement actif. Pas de période d'essai. L'abonnement démarre à la validation du paiement | PAR DÉFAUT |
| D-07 | Périmètre de la première version | Tout le périmètre du cahier des charges a été développé (voir section 6) | PAR DÉFAUT |
| D-08 | Vérification de l'email | Exigée pour réserver un rendez-vous et pour déposer une demande professionnelle (réglage Super Admin) ; non exigée pour prendre un ticket de file | PAR DÉFAUT |
| D-09 | Annulation, retard, absence | Annulation client jusqu'à 2 h avant ; tolérance de retard 10 min ; absence marquée par le professionnel après la tolérance ; réintégration dans la file possible — réglages par salon | PAR DÉFAUT |
| D-10 | Réservation de groupe | Jusqu'à 6 personnes, passages consécutifs ou simultanés, professionnel choisi ou « peu importe », tout ou rien | PAR DÉFAUT |
| D-11 | Formules et tarifs | Starter 149 DH, Pro 299 DH, Business 499 DH pour 30 jours — **hypothèses**, modifiables dans le back-office | PAR DÉFAUT |
| D-12 | Fidélité | Points propres à chaque salon, par visite et par tranche de 10 DH ; récompenses échangées contre un bon validé en salon ; pas d'expiration | PAR DÉFAUT |
| D-13 | Avis | Uniquement après une prestation terminée, un avis par prestation, réponse du salon, masquage par le Super Admin | PAR DÉFAUT |
| D-14 | Classement | Score pondéré (proximité, note, nombre d'avis, ouverture) ; pondérations réglables par le Super Admin | PAR DÉFAUT |
| D-15 | Facturation | Reçu numéroté généré à la validation du paiement. Les mentions légales d'une facture (ICE, TVA) restent à définir avec un comptable | À CONFIRMER |
| D-16 | Hébergement | Non choisi. Le système se déploie sur tout serveur Docker ; le choix dépend des formalités CNDP | À CONFIRMER |
| D-17 | Publication App Store | La gestion de l'abonnement se fait sur le Web uniquement. La connexion Apple n'est pas développée : à vérifier avant d'activer la connexion Google sur iOS | À CONFIRMER |
| D-18 | Technologies | NestJS, PostgreSQL, Prisma, Next.js, Expo — détail dans `02-architecture.md` | PAR DÉFAUT |

## 6. État de réalisation

Légende : ✅ développé et testé · 🟡 développé, vérification partielle · ⬜ non développé.

| Domaine | État | Précisions |
|---------|------|------------|
| Comptes, sessions, vérification email, mot de passe oublié | ✅ | Tests automatisés |
| Connexion Google | 🟡 | Développée côté API et Web ; non testée faute d'identifiant Google (variable `GOOGLE_CLIENT_ID`) |
| Demande professionnelle et validation Super Admin | ✅ | |
| Salon : fiche, logo, photos, prestations, équipe, horaires, absences | ✅ | |
| Validation administrative des salons | ✅ | |
| Marketplace : recherche, filtres, carte, classement configurable | ✅ | Filtre « disponibilité » = ouvert maintenant |
| Réservation classique | ✅ | Double réservation impossible (contrainte en base, testée avec 20 demandes simultanées) |
| Réservation de groupe | ✅ | Web et mobile |
| Déplacement d'un rendez-vous (client et professionnel) avec notification | ✅ | Web ; non proposé dans l'application mobile |
| Retards, absences, réintégration, historique des statuts | ✅ | |
| File d'attente : QR Code, ticket, position, estimation, « peu importe », temps réel | ✅ | Flux temps réel vérifié à travers le site |
| Estimation fondée sur les durées réelles | ✅ | Interface prête pour un modèle prédictif |
| Fidélité | ✅ | |
| Avis | ✅ | |
| Notifications email | 🟡 | Envoi SMTP développé ; non testé avec un vrai serveur (sans configuration, les emails sont journalisés) |
| Notifications push | 🟡 | Enregistrement de l'appareil et envoi via le service Expo développés ; non testés sur un téléphone réel |
| Historique, statuts et préférences de notification, modèles modifiables | ✅ | |
| Formules configurables, paiement manuel, validation, expiration, reçus | ✅ | |
| Back-office Super Admin | ✅ | Interface en français uniquement |
| Journal d'activité | ✅ | |
| Réclamations | ✅ | |
| Français / arabe (RTL), DH, fuseau du Maroc | ✅ | Web et mobile ; back-office en français. L'heure du Maroc est fournie par le serveur : un appareil dont la base de fuseaux est périmée affiche quand même la bonne heure |
| Site Web responsive | ✅ | Parcours vérifiés dans un navigateur réel |
| Application mobile Android / iOS | 🟡 | Code compilé et paquets Android / iOS construits ; non exécutée sur appareil ou émulateur |
| Stockage S3 | 🟡 | Pilote développé, non testé ; le stockage local est testé |
| Déploiement Docker, CI | 🟡 | Fichiers fournis ; images Docker non construites dans l'environnement de développement |
| Comptes membres d'équipe avec connexion propre | ✅ | Invitation par email, droits limités, retrait d'accès ; testé (API et navigateur) |
| Export des données et suppression de compte en libre-service | ✅ | Web et mobile ; le propriétaire d'un salon doit passer par le support |
| Multi-salons | ⬜ | |
| SMS, WhatsApp, paiement en ligne | ⬜ | Reportés (cahier des charges) |
| Connexion Apple | ⬜ | Voir D-17 |

## 7. Risques restants

| # | Risque | Mesure |
|---|--------|--------|
| R-01 | Application mobile non testée sur appareil réel | Recette sur Android et iOS avant publication |
| R-02 | Refus App Store (connexion tierce, abonnement hors application) | Vérifier les règles Apple en vigueur ; voir D-17 |
| R-03 | Conformité loi 09-08 / CNDP | Formalités et avis juridique avant la mise en service ; politique de confidentialité fournie comme modèle |
| R-04 | Faible usage de l'email au Maroc | Push prioritaire ; SMS / WhatsApp dans une version ultérieure |
| R-05 | Charge de validation manuelle | Notifications au Super Admin ; sous-comptes administrateurs à prévoir |
| R-06 | Montée en charge | Une seule instance d'API suffit au lancement ; voir `03-exploitation.md` pour la suite |
| R-07 | Tarifs non validés | Hypothèses modifiables sans développement |

## 8. Journal des décisions

| Date | Décision | Réf. |
|------|----------|------|
| 2026-11-11 | Création du document à partir du cahier des charges initial. | — |
| 2026-11-11 | Cohabitation rendez-vous / file d'attente : mode hybride avec priorité au rendez-vous. | D-01 |
| 2026-11-11 | Le rôle professionnel inclut les capacités client. | D-02 |
| 2026-11-11 | Demande du porteur du projet : développer sans autre question. Décisions D-03 à D-18 prises par défaut. | D-03 à D-18 |
| 2026-11-12 | Première version développée : API, site Web, application mobile, déploiement. | Section 6 |
| 2026-11-12 | Ajout des comptes de connexion pour les membres d'équipe, de l'export et de la suppression de compte, et de la réservation de groupe sur mobile. | D-03, section 6 |
| 2026-11-12 | Ajout du déplacement de rendez-vous. Le serveur devient la référence de l'heure du Maroc pour le Web et le mobile, après constat d'un écart d'une heure entre le serveur (base de fuseaux 2026) et un navigateur non à jour. | Section 6 |
