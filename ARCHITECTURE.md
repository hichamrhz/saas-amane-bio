# AMANE BIO — Plan d'implémentation et modèle d'événements

Ce document répond à l'exigence de la section 22 du cahier des charges :
inspecter l'existant, proposer un plan court, et documenter le modèle des
événements stock/finance avant de développer.

## 0. Constat de départ

Le dépôt `hichamrhz/saas-amane-bio` était vide (aucun commit). Le cahier des
charges d'origine visait l'environnement "Hostinger Horizons", mais le travail
se fait ici dans un dépôt Git classique via Claude Code. Choix d'architecture
donc entièrement libre — voir §1.

Le périmètre du cahier des charges (20+ pages, comptabilité matière complète,
commissions multi-rôles, réconciliation transporteur, import Sheets, RBAC,
FR/AR RTL, 30 tests d'acceptation obligatoires) représente plusieurs semaines
de travail réel. Une seule session ne peut pas tout livrer avec la rigueur
demandée (tests réels, pas de faux composants). La stratégie retenue :

- Construire une **fondation réelle et testée**, pas une maquette.
- Prioriser strictement la règle métier la plus critique et la plus risquée :
  **étiquettes ↔ coopérative ↔ réception de bouteilles** (§4 du cahier des
  charges), avec ses tests d'acceptation obligatoires.
- Documenter précisément (voir `PROGRESS.md`) ce qui est fait, stubé, ou
  restant, pour qu'une session suivante reprenne sans reconstruire.

## 1. Stack technique

| Domaine | Choix | Raison |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | UI + API/server actions dans un seul projet, déploiement simple (Node/Vercel/VPS Hostinger) |
| Base de données | PostgreSQL | Transactions ACID réelles, contraintes uniques, verrouillage — requis pour la réception atomique et la concurrence (§19) |
| ORM | Prisma | Migrations versionnées, transactions interactives, types générés |
| Auth | NextAuth (Credentials) | Sessions serveur, hash bcrypt, pas de secret côté navigateur |
| i18n | next-intl | FR par défaut, AR complet avec RTL |
| Style | Tailwind CSS | Rapide, responsive par défaut |
| Tests | Vitest (unit + intégration sur vraie DB Postgres de test) | Valide les comportements critiques, pas de mocks sur la logique métier |
| Gestionnaire de paquets | pnpm | déjà disponible dans l'environnement |

En développement/test, un cluster PostgreSQL 16 local est utilisé
(`DATABASE_URL` dans `.env`). En production, brancher un Postgres managé
(Supabase, Neon, ou le Postgres fourni par l'hébergeur) — **aucune donnée
métier n'est stockée en `localStorage`**.

## 2. Découpage en phases (repris de la section 22)

1. **Base / Auth / Permissions** — organisations, utilisateurs, rôles, accès par défaut refusé.
2. **Stock / Étiquettes / Achats** — catalogue, consommables, unités, fournisseurs, achats, réceptions, règle étiquettes↔coopérative, coût moyen pondéré.
3. Recettes / Commandes / Import — non démarré dans cette session.
4. Retours / Transporteurs — non démarré.
5. Équipe / Affiliés / Paiements — non démarré.
6. Dépenses / Rentabilité — non démarré.
7. Alertes / Rapports — non démarré.
8. Tests et finitions — en continu sur les phases livrées ; à refaire pour 3-7.

Cette session livre **entièrement les phases 1 et 2** (schéma, transactions
serveur, tests), et une **coquille d'application** (navigation, i18n FR/AR,
pages "à construire" clairement annoncées comme telles — jamais de fausses
données) pour les phases restantes, afin qu'aucune page du cahier des charges
ne soit silencieusement oubliée.

## 3. Modèle relationnel (essentiel, phases 1-2)

```
Organization 1─* User (role: OWNER|STOCK|CONFIRMATION|FINANCE|READONLY)
Organization 1─* Location (interne | coopérative | transit | quarantaine)
Organization 1─* Supplier
Organization 1─* Article (type: PRODUCT | CONSUMABLE)
  Article 1─* ArticleVariant (SKU unique par org, taille/format)
    ArticleVariant : unitPurchase, unitStock, conversionFactor, isIntegerQty
    ArticleVariant (si CONSUMABLE de type LABEL) → linkedProductVariantId
      (mapping produit → étiquette, requis pour la consommation auto)
Organization 1─* Lot (variantId, numéro de lot, expiration, coût unitaire figé)
Organization 1─* PurchaseOrder 1─* PurchaseOrderLine
Organization 1─* Reception 1─* ReceptionLine  (référence PurchaseOrder facultative)
Organization 1─* CooperativeTransfer (variantId LABEL, quantité, from→to location)
Organization 1─* StockMovement (ledger append-only ; voir §4)
Organization 1─* CostSnapshot (coût moyen pondéré au moment T, par variant)
Organization 1─* AuditLog (who, when, action, entity, before/after, motif)
```

Contraintes clés :
- `ArticleVariant.sku` unique par organisation (contrainte DB composite).
- Quantités entières forcées en DB (colonne `Decimal` + `CHECK` ou validation
  serveur) pour bouteilles/cartons ; décimales autorisées pour mètres/kg.
- Aucune quantité négative : `CHECK (quantity >= 0)` sur les soldes calculés,
  et transactions Prisma (`$transaction` + `SELECT ... FOR UPDATE` via
  requête brute) pour empêcher la survente en cas de concurrence.

## 4. Modèle d'événements stock (grain fin, phase 2)

Chaque mouvement de stock est un enregistrement **immuable** dans
`StockMovement` (jamais de mise à jour rétroactive d'un mouvement passé — les
corrections sont de nouveaux mouvements liés). Le stock disponible d'un
article à un emplacement est **toujours dérivé** en sommant ces mouvements,
jamais un compteur muté directement — ce qui rend l'audit et la
non-double-comptabilisation vérifiables par construction.

Types de mouvement (`StockMovementType`) utilisés dans cette phase :
- `OPENING` — stock d'ouverture (ne déclenche aucune autre conséquence).
- `PURCHASE_RECEPTION` — réception d'achat (consommables ou produits finis
  achetés directement, hors coopérative).
- `COOPERATIVE_TRANSFER_OUT` / `COOPERATIVE_TRANSFER_IN` — même article
  (étiquettes), changement d'emplacement uniquement, **quantité totale
  inchangée**.
- `LABEL_CONSUMPTION` — généré automatiquement et **uniquement** par une
  `COOPERATIVE_RECEPTION` de produit fini réussie. Jamais généré par une
  vente, un retour, ou un stock d'ouverture.
- `COOPERATIVE_RECEPTION` — entrée du produit fini (bouteilles) en stock
  vendable, à l'emplacement interne.
- `CORRECTION` — mouvement correctif tracé avec motif obligatoire.

Les types futurs (`ORDER_EXIT`, `RETURN_RECEPTION`, `LOSS`, `EXPIRATION`,
etc., phases 3-4) seront ajoutés à cet enum quand leur logique sera
implémentée : ajouter une valeur à un enum Postgres est une migration
additive, non destructive.

### Événement central : réception coopérative (règle §4 du cahier des charges)

```
ReceptionCoopérative(variantProduitId, quantitéReçue, lotId?, coûtUnitaire, emplacementDestination)
  transaction Prisma { 
    1. résoudre le mapping produit → variant étiquette (linkedProductVariantId)
       - absent ou ambigu → ERREUR explicite, aucune écriture
    2. calculer le stock d'étiquettes disponible à l'emplacement coopérative
       en verrouillant les lignes concernées (FOR UPDATE) pour éviter la
       concurrence
    3. si stock étiquettes < quantitéReçue → ROLLBACK complet, aucune ligne
       insérée (ni le produit, ni l'étiquette) → satisfait test #3
    4. insérer StockMovement(COOPERATIVE_RECEPTION, +quantité, produit, interne)
    5. insérer StockMovement(LABEL_CONSUMPTION, -quantité, étiquette, coopérative)
    6. mettre à jour/insérer CostSnapshot (coût moyen pondéré du produit,
       incorporant le coût étiquette réel seulement si le coût saisi ne
       l'inclut pas déjà — champ `costIncludesLabel` sur la réception)
    7. AuditLog
  }
  → les étapes 4 et 5 sont dans la même transaction DB : tout réussit ou
    rien n'est écrit (atomicité, test #3, #8, #10).
```

Le **stock d'ouverture** (import initial) utilise `OPENING`, jamais
`COOPERATIVE_RECEPTION` — donc il ne déclenche jamais `LABEL_CONSUMPTION`.
C'est la distinction explicitement demandée en fin de §4 et testée par le
test #14.

Le **transfert vers la coopérative** utilise une paire
`COOPERATIVE_TRANSFER_OUT`/`IN` sur le **même** variant étiquette : la
quantité totale (chez moi + chez la coopérative) ne change pas, seul
l'emplacement change. Ceci diffère structurellement de `LABEL_CONSUMPTION`
qui, elle, réduit la quantité totale existante.

Vérification de l'exemple obligatoire du cahier des charges (§4) :
achat 2000 → transfert 1500 → réceptions 200 puis 400
```
Étiquettes chez moi      = 2000 - 1500                         = 500
Étiquettes coopérative   = 1500 - 200 - 400                    = 900
Étiquettes consommées    = 200 + 400                            = 600
Bouteilles reçues        = 200 + 400                            = 600
```
Ce calcul est le test d'intégration principal de cette phase (voir
`PROGRESS.md`, test #1).

## 5. Modèle d'événements finance (posé pour les phases suivantes)

Non implémenté dans cette session (phases 5-6) : aucune table `Expense`,
`Commission`, `Payment`, `CarrierStatement` n'est créée maintenant — les
créer avant d'avoir la logique qui les remplit serait du code mort. Principe
à respecter lors de leur implémentation :

- Un **coût de produit sorti** est reconnu à `CONFIRMED` (sortie de stock),
  mais le **revenu** n'est reconnu qu'à `LIVRÉE` — jamais au même moment.
  Entre les deux, la valeur est "en transit", pas encore un coût de période.
- Une **commission acquise** (à la livraison) et un **paiement** de cette
  commission sont deux enregistrements distincts (`Commission` puis
  `Payment` qui référence des commissions/dettes, jamais l'inverse).
- Aucun recalcul silencieux de l'historique : un changement de tarif ou de
  recette est daté et s'applique aux événements futurs ; les anciens
  mouvements/coûts gardent leur snapshot.

## 6. Sécurité et concurrence (phase 1-2, appliqué dès maintenant)

- Toute action critique (réception, transfert) passe par une fonction
  serveur unique (`app/actions/*.ts`, `"use server"`), jamais par une
  écriture directe côté client.
- Vérification du rôle **avant** toute lecture/écriture, via un helper
  `requireRole(session, [...roles])`, retour "accès refusé" par défaut.
- Toutes les requêtes Prisma sont scoping par `organizationId` explicite —
  jamais de requête globale non filtrée.
- Idempotence : chaque réception/transfert accepte une clé d'idempotence
  optionnelle (`clientRequestId`) stockée avec contrainte unique
  `(organizationId, clientRequestId)` pour absorber un double-clic ou un
  retry réseau sans double écriture.

## 7. Ce que cette session NE fait PAS (voir `PROGRESS.md` pour le détail)

Recettes de préparation, commandes et leurs statuts, import Google
Sheets/CSV, retours et transporteurs, équipe/commissions/affiliés,
dépenses/publicité, tableau de bord avec indicateurs réels, alertes, arabe
RTL complet sur toutes les pages : **non implémentés**. Les pages
correspondantes existent dans la navigation mais affichent un état
"fonctionnalité à venir" explicite — jamais de données ou de graphiques
inventés.
