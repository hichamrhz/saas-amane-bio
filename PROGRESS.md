# PROGRESS — AMANE BIO

État au terme de cette session (Phase 3). Voir `ARCHITECTURE.md` pour le
plan et le modèle d'événements. Ce document liste précisément ce qui est
fait, testé, et ce qui reste — pour reprendre sans reconstruire (§22 du
cahier des charges).

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

**Phase 3 — Recettes / Commandes / Import / Retours / Transporteurs**
- **Recettes / BOM** (`lib/recipes/`, page `/recipes`) : une recette est
  résolue par la **quantité totale de bouteilles de la commande**, pas par
  produit — une tranche `[minBottles, maxBottles]` par recette active, avec
  résolution stricte : aucune tranche couvrante → erreur explicite
  (`NO_MATCH`) ; plusieurs tranches couvrantes → erreur explicite
  (`AMBIGUOUS`), jamais un choix silencieux. Versionnage daté
  (`RecipeVersion`) : modifier une recette n'altère jamais l'historique,
  chaque commande confirmée référence la version exacte utilisée. Chaque
  composant a un mode `PER_BOTTLE` / `PER_PACKAGE` / `PER_ORDER` et peut être
  marqué "sel" pour être exclu quand la commande précise "sans sel".
- **Commandes** (`lib/orders/`, pages `/orders`, `/orders/[id]`) : cycle de
  vie complet `NEW → CONFIRMED → SHIPPED → DELIVERED`, avec branches
  `CANCELLED_BEFORE_PREP`, `CANCELLED_AFTER_PREP`, `RETURN_ANNOUNCED`,
  `RETURN_RECEIVED`, `LOST`. Historique complet et immuable
  (`OrderEvent`) pour chaque transition, avec l'utilisateur et l'horodatage.
  - **Confirmation atomique** : résout la recette, calcule la consommation
    exacte (produit + emballage, sel inclus/exclu), vérifie la disponibilité
    de **tous** les composants avant d'écrire quoi que ce soit (phase de
    lecture puis phase d'écriture dans la même transaction), verrou
    avisoire Postgres par commande, idempotence par clé cliente et par
    vérification du statut sous verrou — un double clic ou un retry réseau
    ne peut jamais sortir le stock deux fois.
  - **Annulation avant préparation** (statut `NEW`) : aucune sortie de
    stock à annuler, simple changement de statut.
  - **Annulation après préparation** (statut `CONFIRMED`/`SHIPPED`) :
    restauration exacte des composants sortis par la confirmation, en
    remontant le mouvement d'origine (`relatedMovementId`) — jamais un
    recalcul approximatif ; le sur-recouvrement est rejeté.
  - Création manuelle (page `/orders`, formulaire multi-lignes), montant
    COD et frais de livraison (calculés ou saisis), transporteur et numéro
    de suivi.
- **Import CSV/XLSX** (`lib/imports/`, page `/orders/import`) : parseur CSV
  RFC4180 maison (sans dépendance) + `xlsx` pour les fichiers Excel ;
  assistant de mapping de colonnes (aucune colonne supposée par position) ;
  regroupement des lignes par numéro de commande avec détection de
  contradiction (même commande, valeurs d'en-tête différentes selon les
  lignes) ; normalisation robuste des nombres (virgule décimale, espaces,
  téléphones avec zéro initial) ; détection de doublons par numéro de
  commande **et** re-import idempotent (ré-importer le même fichier ne
  crée jamais de doublon, met à jour si le statut progresse) ; garde
  anti-régression de statut (`STATUS_RANK`) — un import ne peut jamais faire
  reculer une commande déjà plus avancée (ex. déjà `DELIVERED`) ; commande
  `DELIVERED` importée sans recette résolvable → mise en résolution
  explicite, jamais une sortie de stock inventée. Rapport d'erreurs ligne
  par ligne, traitement résilient (une ligne en erreur n'empêche pas le
  reste du lot).
- **Clients** (`lib/customers/`) : création à la volée depuis une commande,
  recherche par téléphone.
- **Transporteurs** (`lib/carriers/`, page `/carriers`) : liste des
  transporteurs, tarif par défaut, vue des commandes par transporteur avec
  statut, COD et frais de livraison.
- **Retours et livraisons refusées** (`lib/returns/`, page `/returns`) :
  déclaration d'un retour = photographie de ce qui est attendu (une ligne
  par mouvement de sortie d'origine), **aucune réintégration de stock à la
  déclaration**. Réception physique : quantités saine/abîmée/reçue
  toujours **dérivées en sommant chaque session de réception jamais
  enregistrée comme compteur muté** — une réception répétée ou partielle ne
  peut jamais réintégrer deux fois le même stock. Le sain réintègre
  l'emplacement d'origine de la commande ; l'abîmé va dans un emplacement de
  quarantaine dédié (créé par le seed, `kind: QUARANTINE`).
- **Tableau de bord** (`/`) : cartes KPI par statut de commande, comptages
  réels via `getOrderStatusCounts` (jamais un zéro déguisé en absence de
  données).
- **Sécurité multi-tenant renforcée** : toutes les références client-side
  vers des ressources d'une autre organisation (emplacement, client,
  transporteur, variante d'article dans les lignes de commande, composants
  de recette) sont explicitement vérifiées comme appartenant à
  l'organisation de l'appelant avant toute écriture
  (`assertOrderReferencesBelongToOrg`, `assertComponentsBelongToOrg`) —
  vérifié par test (`tests/org-isolation.test.ts`).
- **Audit** (`AuditLog`) étendu aux déclarations et réceptions de retour.
- Interface FR/AR RTL pour l'ensemble des pages Phase 3 en lecture/statut
  (commandes, recettes, retours, transporteurs, tableau de bord) — voir
  limites connues (§4) pour les formulaires encore FR uniquement.

**Coquille applicative**
- Navigation complète des 15 pages du cahier des charges. Recettes,
  commandes, retours et transporteurs sont maintenant pleinement
  implémentés (`lib/nav.ts`). Les pages encore non développées (`équipe`,
  `commissions`, `dépenses`, `rapports`) affichent un message explicite
  "fonctionnalité à venir" — jamais de données inventées ni de faux
  graphique.
- `/settings` affiche l'organisation et les utilisateurs réels (édition non
  implémentée).

## 2. Tests exécutés

```
pnpm test       # Vitest — 48 tests, vraie base Postgres de test
pnpm test:e2e   # Playwright — 4 parcours, vrai navigateur, vraie DB dev
pnpm build      # next build — compile et type-check sans erreur
npx eslint .    # aucune erreur
```

Tous passent au moment de la rédaction (48/48 Vitest, 4/4 Playwright,
build et lint propres). Correspondance avec les 30 tests d'acceptation
obligatoires du cahier des charges (§21) :

| # | Test | Statut | Où |
|---|---|---|---|
| 1 | Étiquettes 2000→1500→200+400 = 500/900/600 | ✅ Réussi | `tests/receptions.core.test.ts`, `e2e/golden-path.spec.ts` |
| 2 | Vente ne consomme pas d'étiquette une 2e fois | ✅ Réussi | `tests/orders.core.test.ts` — confirmer une commande sort uniquement le produit et l'emballage résolus par la recette, jamais une étiquette une seconde fois |
| 3 | Réception avec étiquettes insuffisantes : rien de validé | ✅ Réussi | `tests/receptions.core.test.ts` |
| 4 | 3×100 m ; 3×0,40 m pleine largeur = 1,20 m, reste 298,80 m | ⏸ Non exécuté | Le moteur de recette (§7) calcule des quantités par bouteille/colis/commande mais ne modélise pas encore la découpe métrique de rouleaux (papier bulle/ruban en mètres avec perte de découpe) — hors périmètre de cette phase |
| 5 | Pièce 0,40×0,30 m = 0,12 m² | ⏸ Non exécuté | Idem — dépend de la découpe métrique, non construite |
| 6 | Commande sans sel : rien consommé | ✅ Réussi | `tests/orders.core.test.ts` — `withSalt: false` exclut les composants marqués sel de la consommation |
| 7 | Commande multi-produit/colis | ✅ Réussi | `tests/orders.core.test.ts` — résolution par quantité totale de bouteilles, colis calculés via `bottlesPerPackage` |
| 8 | Confirmed : sortie unique malgré double clic/retry/réimport | ✅ Réussi | `tests/orders.core.test.ts` (double confirmation concurrente via `Promise.all`), `tests/imports.core.test.ts` (ré-import idempotent) |
| 9 | Composant manquant : aucune sortie partielle | ✅ Réussi | `tests/orders.core.test.ts` — stock produit ou emballage insuffisant bloque toute la transaction |
| 10 | Deux validations concurrentes, dernier stock : une seule réussit | ✅ Réussi | `tests/receptions.concurrency.test.ts` |
| 11 | Livrée : pas de second retrait, revenu/commissions une fois | ✅ Partiel | Pas de second retrait de stock prouvé (`tests/orders.core.test.ts`, transitions `SHIPPED`→`DELIVERED` ne touchent pas le stock) ; commissions non construites (phase 5) |
| 12 | Ancien statut importé après Livrée : pas de régression | ✅ Réussi | `tests/imports.core.test.ts` — garde `STATUS_RANK`, un import ne peut jamais faire reculer une commande |
| 13 | Commande inconnue importée Livrée : résolution explicite | ✅ Réussi | `tests/imports.core.test.ts` — `DELIVERED` sans recette résolvable → ligne marquée en résolution, jamais de sortie de stock inventée |
| 14 | Import historique / stock d'ouverture : pas de retrait rétroactif | ✅ Réussi | `tests/receptions.core.test.ts`, `tests/imports.core.test.ts` (`skipStockImpact`) |
| 15 | Retour annoncé : zéro réintégration ; 2/3 saines → +2, 1 écart | ✅ Réussi | `tests/returns.core.test.ts` |
| 16 | Retour répété/partiel : pas de double réintégration | ✅ Réussi | `tests/returns.core.test.ts` |
| 17 | Commissions multi-rôles, dues à la livraison seulement | ⏸ Non exécuté | Commissions non construites (phase 5) |
| 18 | Cumul de rôles configurable ; tarif daté | ⏸ Non exécuté | Idem |
| 19 | Affilié + commissions internes cumulées | ⏸ Non exécuté | Idem |
| 20 | 80×5=400 dus, paiement 300, solde 100, charge=400 pas 700 | ⏸ Non exécuté | Paiements non construits (phase 5) |
| 21 | Fixe mensuel : génération unique | ⏸ Non exécuté | Idem |
| 22 | Achat 1000/vente 100 : coût reconnu, reste valorisé | ✅ Partiel | Coût moyen pondéré construit et testé (`tests/cost-incorporation.test.ts`) ; la sortie de stock à la confirmation fige le coût du mouvement (`unitCost`) mais aucun état de résultat/COGS agrégé n'est encore calculé (phase 6) |
| 23 | Changement prix/recette n'altère pas l'historique | ✅ Réussi | Chaque `OrderLine`/`StockMovement` fige son propre prix/coût ; chaque commande confirmée référence la `RecipeVersion` exacte utilisée — `tests/orders.core.test.ts` (une commande confirmée avec une ancienne version de recette n'est jamais recalculée si la recette est éditée ensuite) |
| 24 | Versement COD 900/1000, frais 100 : rapprochement zéro | ⏸ Non exécuté | Le montant COD et les frais de livraison sont enregistrés par commande (`/carriers`), mais le rapprochement de relevé transporteur (import de versements, écarts) n'est pas construit (phase 4/5) |
| 25 | Copier-coller virgules, téléphone 0, plusieurs lignes | ✅ Réussi | `tests/imports.core.test.ts` — décimales à virgule, téléphone avec zéro initial, regroupement multi-lignes par numéro de commande |
| 26 | Import interrompu et repris : atomique, sans doublon | ✅ Réussi | `tests/imports.core.test.ts` — traitement résilient par lot, ré-import idempotent |
| 27 | Division par zéro, coûts manquants, cohortes honnêtes | ⏸ Non exécuté | Rapports/alertes non construits (phase 7). Le tableau de bord actuel n'affiche que des compteurs réels (dont les KPI de statut de commande), jamais de zéro déguisé |
| 28 | Rôle stock sans accès finance ; autre organisation inaccessible | ✅ Réussi | `tests/rbac.test.ts`, `tests/org-isolation.test.ts` (isolation catalogue, stock, **et commandes/emplacements/recettes** depuis Phase 3) |
| 29 | Sauvegarde/restauration cohérente | ⏸ Non exécuté | Aucun service de sauvegarde automatique n'est configuré dans cet environnement — voir §4 ci-dessous |
| 30 | Interface téléphone et arabe RTL utilisables | ✅ Partiel | RTL + bascule de langue vérifiés en e2e (`e2e/auth.spec.ts`) ; les pages de lecture/statut Phase 3 sont traduites FR/AR, mais certains formulaires (création de commande, assistant d'import, réception de retour) restent en français uniquement — voir §4. La barre latérale ne se replie pas encore sur petit écran |

**Résumé** : 21 réussis, 3 partiels (le mécanisme central est prouvé, la
fonctionnalité de surface qui l'exploite pleinement reste à construire), 6
non exécutés car leur fonctionnalité n'existe pas encore (découpe métrique,
commissions/paiements, rapprochement COD complet, alertes/rapports,
sauvegarde). Aucun test n'a été présenté comme réussi sans l'être.

## 3. Ce qui manque (phases 4 à 8, non commencées)

- **Découpe métrique des consommables** (§7, tests #4-5) : calcul de perte
  de découpe pour papier bulle/ruban vendus au mètre/à la largeur, avec
  reste valorisé. Le moteur de recette actuel gère les quantités
  par bouteille/colis/commande, pas la découpe géométrique.
- **Rapprochement COD complet** (§15, test #24) : import de relevés
  transporteur, calcul d'écart entre COD attendu et versé.
- **Équipe, affiliés, commissions, paiements** (§11-13) : règles datées,
  cumul de rôles, séparation charge/paiement, commissions dues à la
  livraison uniquement.
- **Dépenses et rentabilité** (§14, §16) : publicité, charges récurrentes,
  état de résultat de période (COGS agrégé, marge).
- **Alertes et rapports réels** (§17) : taux de confirmation/livraison,
  réapprovisionnement, capacité de préparation.
- Édition d'utilisateurs depuis `/settings` (lecture seule pour l'instant).
- Sidebar repliable sur mobile ; tests de viewport téléphone.
- Export CSV du journal de mouvements et des rapports.
- **i18n des formulaires Phase 3** : les pages de lecture (`/orders`,
  `/orders/[id]`, `/recipes`, `/returns`, `/carriers`) sont entièrement
  traduites FR/AR RTL, mais trois formulaires client restent en français
  uniquement : `new-order-form.tsx`, `import-wizard.tsx`,
  `receive-return-form.tsx`. Aucune donnée ni logique n'en dépend — c'est
  un gap de traduction pur, documenté plutôt que masqué.

Ces tables ne sont volontairement pas créées à l'avance dans le schéma —
les créer sans la logique qui les remplit serait du code mort. Les
extensions futures (nouvelles valeurs d'enum, nouvelles tables
`Expense`, `Commission`, `Payment`, `CarrierStatement`, etc.) sont
additives et non destructives pour les données déjà en place.

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
- **RTL mobile** : non vérifié sur un vrai téléphone ; la barre latérale
  fixe (256px) n'est pas encore repliable.
- **Formulaires Phase 3 en français uniquement** : voir §3 ci-dessus
  (`new-order-form.tsx`, `import-wizard.tsx`, `receive-return-form.tsx`).
- **Découpe métrique** : le moteur de recette ne modélise pas encore les
  consommables vendus au mètre avec perte de découpe (tests d'acceptation
  #4-5) — voir §3.
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
pnpm test                         # Vitest — 48 tests
pnpm test:e2e                     # Playwright — 4 parcours, nécessite `pnpm dev` lancé à part
```

`pnpm db:push:test` et `pnpm db:migrate` modifient un schéma de base de
données : à exécuter soi-même, jamais automatiquement par un agent sans
confirmation explicite (voir la garde intégrée à la CLI Prisma).

## 6. Boucle réelle vérifiée

La boucle Phase 2 — "acheter des étiquettes → transférer à la coopérative →
réceptionner des bouteilles" — fonctionne de bout en bout, avec persistance
réelle après rechargement (`e2e/golden-path.spec.ts`,
`tests/receptions.core.test.ts`).

La boucle Phase 3 est désormais vérifiée de bout en bout en conditions
réelles (`e2e/orders.spec.ts`) : créer un produit et son emballage → créer
une recette → créer une commande manuelle → la confirmer (sortie exacte de
stock) → l'expédier → la livrer → vérifier le stock → déclarer un retour →
réceptionner le retour → vérifier la réintégration du stock. L'import
CSV colle-copier est vérifié séparément de bout en bout
(`e2e/import.spec.ts`) : coller un CSV → mapper les colonnes → prévisualiser
→ confirmer → vérifier que la commande est créée.

La suite (commissions, paiements, rapprochement COD, rapports) n'est pas
encore construite — voir §3.
