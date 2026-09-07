# PROGRESS — AMANE BIO

État au terme de cette session. Voir `ARCHITECTURE.md` pour le plan et le
modèle d'événements. Ce document liste précisément ce qui est fait, testé,
et ce qui reste — pour reprendre sans reconstruire (§22 du cahier des
charges).

## 1. Ce qui est livré et fonctionnel

**Phase 1 — Base / Auth / Permissions**
- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind.
- PostgreSQL réel via Prisma 7 (`@prisma/adapter-pg`) — aucune donnée métier
  en `localStorage`.
- Authentification NextAuth (Credentials, mots de passe hachés bcrypt,
  sessions JWT).
- RBAC serveur (`lib/auth/rbac.ts` + `lib/auth/permissions.ts`) : chaque
  action serveur vérifie explicitement le rôle ; refus par défaut ; OWNER a
  accès complet.
- Toutes les requêtes de données sont scoping par `organizationId` —
  vérifié par test (`tests/org-isolation.test.ts`).
- i18n FR (défaut) / AR (RTL complet) via `next-intl`, bascule immédiate
  (cookie), vérifiée en e2e (`e2e/auth.spec.ts`).

**Phase 2 — Stock / Étiquettes / Achats**
- Catalogue produits et consommables (SKU unique par organisation, unités
  d'achat/stock avec facteur de conversion, quantités entières ou
  décimales, largeur pour papier bulle/ruban) — pages `/products` et
  `/packaging`.
- Fournisseurs et achats — page `/purchases`.
- Réceptions (achat fournisseur / coopérative / stock d'ouverture) avec
  **consommation atomique des étiquettes** à la réception coopérative
  (`lib/purchasing/receptions.ts`), incluant :
  - blocage intégral (aucune écriture) si étiquettes insuffisantes ;
  - verrou avisoire Postgres par (organisation, variante, emplacement)
    pour empêcher la survente en cas de concurrence ;
  - idempotence par clé cliente (double clic / retry réseau) ;
  - incorporation du coût de l'étiquette dans le coût du produit fini,
    seulement si `costIncludesLabel = false` ;
  - le stock d'ouverture ne consomme jamais d'étiquette.
- Transferts vers/depuis la coopérative (`lib/purchasing/transfers.ts`) :
  changement d'emplacement sans changer la quantité totale, bloqué si stock
  source insuffisant.
- Journal de mouvements de stock immuable (page `/inventory`), stock
  disponible toujours dérivé par somme du journal (jamais un compteur muté).
- Coût moyen pondéré dérivé du journal (`lib/inventory/valuation.ts`).
- Audit (`AuditLog`) sur réceptions et transferts.

**Coquille applicative**
- Navigation complète des 15 pages du cahier des charges. Les 9 pages non
  développées (`recettes`, `commandes`, `retours`, `transporteurs`,
  `équipe`, `commissions`, `dépenses`, `rapports`) affichent un message
  explicite "fonctionnalité à venir" — jamais de données inventées ni de
  faux graphique.
- `/settings` affiche l'organisation et les utilisateurs réels (édition non
  implémentée).

## 2. Tests exécutés

```
pnpm test       # Vitest — 25 tests, vraie base Postgres de test
pnpm test:e2e   # Playwright — 2 parcours, vrai navigateur, vraie DB dev
pnpm build      # next build — compile et type-check sans erreur
```

Tous passent au moment de la rédaction. Correspondance avec les 30 tests
d'acceptation obligatoires du cahier des charges (§21) :

| # | Test | Statut | Où |
|---|---|---|---|
| 1 | Étiquettes 2000→1500→200+400 = 500/900/600 | ✅ Réussi | `tests/receptions.core.test.ts`, `e2e/golden-path.spec.ts` |
| 2 | Vente ne consomme pas d'étiquette une 2e fois | ⏸ Non exécuté | Aucun code de vente n'existe encore (phase 3/commandes). Par construction, seule une réception coopérative écrit `LABEL_CONSUMPTION` — aucun autre chemin de code ne le fait. |
| 3 | Réception avec étiquettes insuffisantes : rien de validé | ✅ Réussi | `tests/receptions.core.test.ts` |
| 4 | 3×100 m ; 3×0,40 m pleine largeur = 1,20 m, reste 298,80 m | ⏸ Non exécuté | Moteur de recette/découpe non construit (phase 3/7) |
| 5 | Pièce 0,40×0,30 m = 0,12 m² | ⏸ Non exécuté | Idem — dépend du moteur de recette |
| 6 | Commande sans sel : rien consommé | ⏸ Non exécuté | Commandes non construites (phase 3) |
| 7 | Commande multi-produit/colis | ⏸ Non exécuté | Idem |
| 8 | Confirmed : sortie unique malgré double clic/retry/réimport | ✅ Partiel | Idempotence prouvée au niveau réception (`tests/receptions.core.test.ts`, "double soumission"). Le statut de commande "Confirmed" n'existe pas encore. |
| 9 | Composant manquant : aucune sortie partielle | ✅ Réussi | Même mécanisme que #3 (transaction atomique) |
| 10 | Deux validations concurrentes, dernier stock : une seule réussit | ✅ Réussi | `tests/receptions.concurrency.test.ts` |
| 11 | Livrée : pas de second retrait, revenu/commissions une fois | ⏸ Non exécuté | Commandes/commissions non construites (phase 3/5) |
| 12 | Ancien statut importé après Livrée : pas de régression | ⏸ Non exécuté | Import non construit (phase 3) |
| 13 | Commande inconnue importée Livrée : résolution explicite | ⏸ Non exécuté | Idem |
| 14 | Import historique / stock d'ouverture : pas de retrait rétroactif | ✅ Réussi | `tests/receptions.core.test.ts` |
| 15 | Retour annoncé : zéro réintégration ; 2/3 saines → +2, 1 écart | ⏸ Non exécuté | Retours non construits (phase 4) |
| 16 | Retour répété/partiel : pas de double réintégration | ⏸ Non exécuté | Idem |
| 17 | Commissions multi-rôles, dues à la livraison seulement | ⏸ Non exécuté | Commissions non construites (phase 5) |
| 18 | Cumul de rôles configurable ; tarif daté | ⏸ Non exécuté | Idem |
| 19 | Affilié + commissions internes cumulées | ⏸ Non exécuté | Idem |
| 20 | 80×5=400 dus, paiement 300, solde 100, charge=400 pas 700 | ⏸ Non exécuté | Paiements non construits (phase 5) |
| 21 | Fixe mensuel : génération unique | ⏸ Non exécuté | Idem |
| 22 | Achat 1000/vente 100 : coût reconnu, reste valorisé | ✅ Partiel | Coût moyen pondéré construit et testé (`tests/cost-incorporation.test.ts`) ; la reconnaissance à la vente dépend des commandes (phase 3) |
| 23 | Changement prix/recette n'altère pas l'historique | ✅ Par construction, non testé explicitement | Chaque mouvement fige son propre `unitCost` ; rien ne recalcule l'historique. Pas de scénario de test dédié (aucune fonctionnalité d'édition de prix n'existe encore pour le déclencher) |
| 24 | Versement COD 900/1000, frais 100 : rapprochement zéro | ⏸ Non exécuté | Transporteurs/COD non construits (phase 4) |
| 25 | Copier-coller virgules, téléphone 0, plusieurs lignes | ✅ Partiel | Le parsing décimal virgule/point est testé (`tests/numbers.test.ts`) ; l'import Sheets/CSV lui-même n'est pas construit (phase 3) |
| 26 | Import interrompu et repris : atomique, sans doublon | ⏸ Non exécuté | Import non construit (phase 3) |
| 27 | Division par zéro, coûts manquants, cohortes honnêtes | ⏸ Non exécuté | Rapports/alertes non construits (phase 7). Le tableau de bord actuel n'affiche que des compteurs réels, jamais de zéro déguisé. |
| 28 | Rôle stock sans accès finance ; autre organisation inaccessible | ✅ Réussi | `tests/rbac.test.ts`, `tests/org-isolation.test.ts` |
| 29 | Sauvegarde/restauration cohérente | ⏸ Non exécuté | Aucun service de sauvegarde automatique n'est configuré dans cet environnement — voir §4 ci-dessous |
| 30 | Interface téléphone et arabe RTL utilisables | ✅ Partiel | RTL + bascule de langue vérifiés en e2e (`e2e/auth.spec.ts`). Réactivité mobile de base (Tailwind) mais **la barre latérale ne se replie pas encore sur petit écran** — non vérifié sur un vrai viewport téléphone |

**Résumé** : 8 réussis, 6 partiels (le mécanisme central est prouvé, la
fonctionnalité de surface qui l'exploite pleinement reste à construire), 16
non exécutés car leur fonctionnalité n'existe pas encore. Aucun test n'a
été présenté comme réussi sans l'être.

## 3. Ce qui manque (phases 3 à 8, non commencées)

- **Recettes** (§7) : composants par produit/bouteille/colis/commande,
  versionnage, calcul de découpe papier bulle/ruban avec perte estimée.
- **Commandes et import** (§8-9) : statuts, sortie à Confirmed, import
  copier-coller Google Sheets/CSV avec mapping et upsert contrôlé.
- **Retours et transporteurs** (§10, §15) : réception de retours avec
  écarts, réconciliation COD.
- **Équipe, affiliés, commissions, paiements** (§11-13) : règles datées,
  cumul de rôles, séparation charge/paiement.
- **Dépenses et rentabilité** (§14, §16) : publicité, charges récurrentes,
  résultat de période.
- **Alertes et rapports réels** (§17) : taux de confirmation/livraison,
  réapprovisionnement, capacité de préparation.
- Édition d'utilisateurs depuis `/settings` (lecture seule pour l'instant).
- Sidebar repliable sur mobile ; tests de viewport téléphone.
- Export CSV du journal de mouvements et des rapports.

Ces tables ne sont volontairement pas créées à l'avance dans le schéma —
les créer sans la logique qui les remplit serait du code mort. Les
extensions futures (nouvelles valeurs d'enum `StockMovementType`, nouvelles
tables `Order`, `Expense`, `Commission`, `Payment`, `CarrierStatement`,
etc.) sont additives et non destructives pour les données déjà en place.

## 4. Limites connues et infrastructure requise

- **Sauvegardes** : aucun service de sauvegarde automatique n'est configuré
  dans cet environnement de développement. En production, planifier
  `pg_dump` régulier (ou les sauvegardes automatiques de l'hébergeur
  Postgres choisi) et documenter/tester la procédure de restauration avant
  la mise en production réelle.
- **Coûts antidatés** : une opération de stock antidatée qui devrait
  modifier rétroactivement un coût moyen historique n'est pas gérée
  spécialement (§5 du cahier des charges le demande explicitement) — le
  coût moyen pondéré est calculé dans l'ordre d'écriture réel, pas dans
  l'ordre des dates d'événement.
- **Import Google Sheets/CSV** : totalement absent (phase 3).
- **RTL mobile** : non vérifié sur un vrai téléphone ; la barre latérale
  fixe (256px) n'est pas encore repliable.
- **Réception multi-lignes** : le moteur (`createReception`) accepte
  plusieurs lignes par réception, mais l'interface actuelle n'en soumet
  qu'une à la fois. Les tests d'intégration valident directement le moteur
  multi-lignes (verrouillage dans un ordre stable, pas de blocage mutuel).

## 5. Démarrage local

```bash
pnpm install
cp .env.example .env        # ajuster DATABASE_URL / AUTH_SECRET
pnpm db:migrate              # applique le schéma à la base de dev
pnpm db:seed                 # crée l'organisation, les emplacements, le propriétaire
pnpm dev                     # http://localhost:3000
```

Identifiants créés par `pnpm db:seed` (à changer après la première
connexion) : `owner@amanebio.test` / `changeme123` (configurables via
`SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`).

Pour les tests automatisés :

```bash
cp .env.test.example .env.test   # même base que TEST_DATABASE_URL dans .env
pnpm db:push:test                 # applique le schéma à la base de test (une fois)
pnpm test                         # Vitest — 25 tests
pnpm test:e2e                     # Playwright — nécessite `pnpm dev` lancé à part
```

`pnpm db:push:test` et `pnpm db:migrate` modifient un schéma de base de
données : à exécuter soi-même, jamais automatiquement par un agent sans
confirmation explicite (voir la garde intégrée à la CLI Prisma).

## 6. Boucle réelle vérifiée

La boucle demandée en §22 — "acheter des étiquettes → transférer à la
coopérative → réceptionner des bouteilles" — fonctionne de bout en bout,
avec persistance réelle après rechargement, à travers la vraie interface
(`e2e/golden-path.spec.ts`) et directement contre la base (`tests/
receptions.core.test.ts`). La suite de la boucle (confirmer une commande,
importer une livraison, calculer les commissions, enregistrer un
règlement, traiter un retour) n'est pas encore construite.
