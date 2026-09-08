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

## 7. Ce que la session Phase 1-2 n'a pas fait

Recettes de préparation, commandes et leurs statuts, import Google
Sheets/CSV, retours et transporteurs, équipe/commissions/affiliés,
dépenses/publicité, tableau de bord avec indicateurs réels, alertes, arabe
RTL complet sur toutes les pages : **non implémentés** à ce stade. Voir §8
ci-dessous pour la suite (phase 3).

---

# Phase 3 — Recettes, commandes, import, retours, transporteurs (addendum)

Cette section documente les décisions d'architecture de la session qui
construit la phase 3, à partir de la base livrée en phase 1-2 (voir §1-7
ci-dessus, toujours valables et non modifiés).

## 8. Périmètre et coupures assumées

La phase 3 couvre une surface énorme (§7-10, §15 du cahier des charges).
Pour rester réellement testée plutôt que théâtrale, les coupures
suivantes sont assumées et documentées (jamais silencieuses) :

- **Recettes = emballage, pas produit.** Le produit vendu (les bouteilles)
  est toujours déduit automatiquement à `CONFIRMED`, pour la quantité
  vendue, indépendamment de toute recette. Une **recette** ne décrit que
  les **consommables d'emballage** (carton, papier bulle, ruban, sel,
  sachet, carte, notice, cadeau) nécessaires pour un **nombre total de
  bouteilles** dans la commande — pas par produit. Ceci correspond
  exactement à l'exemple obligatoire du cahier des charges (§9, test #7) :
  une commande multi-produits n'a qu'un seul jeu d'emballage, basé sur le
  total de bouteilles, jamais un jeu par produit.
- **Étiquettes non concernées.** Conformément à la règle §4 (déjà actée en
  phase 2), la vente/confirmation d'une commande ne touche **jamais** aux
  étiquettes — elles sont consommées uniquement à la réception coopérative.
  Testé explicitement (aucun mouvement `LABEL_CONSUMPTION` généré par
  `confirmOrder`).
- **Packs/coffrets multi-produits** (composition de plusieurs SKU réels
  sous un SKU virtuel) : non implémentés. Une commande référence des
  `ArticleVariant` réels un par un ; un futur pack sera une couche de
  traduction ajoutée à l'import/saisie, pas un changement du moteur de
  sortie de stock.
- **Transporteurs** : fondations seulement (fiche transporteur,
  affectation à la commande, numéro de suivi, montant COD attendu, frais
  de livraison facturé). Le rapprochement des versements, les relevés et
  les créances transporteur (§15) restent à construire (phase suivante).
- **Finance/rentabilité** : les commandes enregistrent des montants
  (sous-total, remise, frais de livraison, COD) mais aucun calcul de
  résultat de période, marge ou ROAS n'est fait ici — ce sont les phases
  dépenses/rapports.

## 9. Modèle relationnel ajouté

```
Customer (organisation, nom, téléphone, adresse)
Carrier (organisation, nom, frais par défaut)
Recipe (organisation, nom, tranche [minBottles,maxBottles], bottlesPerPackage?)
  RecipeVersion (recipeId, version, effectiveFrom)
    RecipeComponent (recipeVersionId, articleVariantId [consommable, non-étiquette],
                      mode [PER_BOTTLE|PER_PACKAGE|PER_ORDER], quantityPerUnit)
Order (organisation, orderNumber unique, externalRef?, customerId?, channel,
       marketingSource, carrierId?, trackingNumber?, status, montants,
       withSalt, locationId, clientRequestId, skipStockImpact, dates)
  OrderLine (orderId, articleVariantId [produit], quantity, unitPrice, discount)
  OrderEvent (orderId, fromStatus, toStatus, occurredAt, createdById, notes)
Return (organisation, orderId, status, announcedAt?, receivedAt?, operatorId)
  ReturnLine (returnId, sourceMovementId [le mouvement ORDER_EXIT d'origine],
              expectedQuantity, receivedQuantity cumulée, healthyQuantity,
              damagedQuantity, condition)
ImportBatch (organisation, sourceFormat, columnMapping JSON, résumé)
  ImportRow (batchId, rowNumber, rawData JSON, status, message, orderId?)
```

`StockMovementType` gagne trois valeurs additives (migration non
destructive, comme annoncé en phase 2) : `ORDER_EXIT`, `RETURN_RECEPTION`,
`LOSS`.

## 10. Machine à états des commandes

```
NEW ──confirm──> CONFIRMED ──ship──> SHIPPED ──deliver──> DELIVERED
 │                  │                   │                    │
 └─cancel(avant)    └─cancel(après)     └─cancel(après)       └─return announce
   │                  │                   │                    │
   v                  v                   v                    v
CANCELLED_BEFORE_PREP CANCELLED_AFTER_PREP CANCELLED_AFTER_PREP RETURN_ANNOUNCED
                                                                     │
                                                    ┌────────────────┼──> LOST
                                                    v
                                            RETURN_RECEIVED
```

Effets stock/finance par transition (reprend et prolonge le modèle §5) :

- `NEW` : aucune écriture. Réservation non implémentée (spec l'autorise en
  option facultative — non construite, pas de fausse réservation).
- `NEW → CONFIRMED` (une seule fois, atomique, verrouillée) : pour chaque
  ligne, sortie du produit vendu (`ORDER_EXIT`, quantité vendue) ; résolution
  déterministe de la recette d'emballage sur le total de bouteilles de la
  commande (erreur explicite si aucune ou plusieurs recettes correspondent) ;
  sortie de chaque composant d'emballage requis (`ORDER_EXIT`), sauf les
  composants sel/sachet si `order.withSalt = false`. Tout ou rien : une
  insuffisance sur n'importe quel composant annule l'intégralité de
  l'opération. Un second appel sur une commande déjà `CONFIRMED` (ou
  au-delà) est un no-op — vérifié par verrou avisoire sur la commande.
  `order.skipStockImpact = true` (commandes historiques importées,
  antérieures à la date de démarrage) désactive complètement les écritures
  de stock pour cette commande, comme le stock d'ouverture en phase 2.
- `CONFIRMED → SHIPPED` : horodatage et transporteur/suivi uniquement,
  aucune écriture de stock.
- `(CONFIRMED|SHIPPED) → DELIVERED` : horodatage uniquement ; aucune
  nouvelle sortie. La reconnaissance de revenu proprement dite (calcul de
  résultat) reste à construire en phase dépenses/rapports — cette phase se
  contente d'enregistrer que la commande est livrée et à quelle date.
- `→ CANCELLED_BEFORE_PREP` (uniquement depuis `NEW`) : aucune écriture
  (rien n'avait été déduit).
- `→ CANCELLED_AFTER_PREP` (depuis `CONFIRMED`/`SHIPPED`) : opération
  corrective explicite — l'utilisateur choisit, mouvement par mouvement
  déjà sorti, ce qui est réellement récupérable et en quelle quantité ;
  seules ces quantités génèrent une écriture `CORRECTION` positive, **au
  coût d'origine** du mouvement de sortie (jamais recalculé). Jamais de
  restauration automatique intégrale.
- `DELIVERED/SHIPPED → RETURN_ANNOUNCED` : déclaration seule, aucune
  réintégration.
- `RETURN_ANNOUNCED → RETURN_RECEIVED` : passe par l'écran de réception de
  retour (`Return`/`ReturnLine`). Seules les quantités **saines**
  effectivement comptées génèrent une écriture `RETURN_RECEPTION`
  positive au coût d'origine du mouvement de sortie source, vers
  l'emplacement demandé (interne vendable, ou quarantaine si abîmé —
  même mécanisme de mouvement, emplacement différent). Le cumul reçu ne
  peut jamais dépasser le cumul attendu (réceptions partielles répétées
  sans double comptage).
- `LOST` : marqueur terminal ; aucune écriture supplémentaire, puisque la
  quantité a déjà quitté le stock vendable à `CONFIRMED` et n'est jamais
  revenue.

## 11. Import (copier-coller / CSV / XLSX)

Pipeline : coller ou charger → parser en lignes brutes → regrouper par
identifiant de commande (une ligne par article, même numéro) → valider
chaque groupe (champs globaux non contradictoires entre lignes du même
groupe) → prévisualiser (nouvelle / mise à jour / doublon sans changement /
invalide / référence SKU inconnue) → valider → rapport.

Chaque groupe (= une commande) est transactionnel : soit la commande
entière est créée/mise à jour, soit rien pour ce groupe — mais un groupe en
échec n'interrompt pas le traitement des autres (§9 du cahier des charges :
"aucune moitié de commande validée", pas "tout ou rien pour le fichier
entier"). L'upsert se fait par `(organizationId, orderNumber)` ; les champs
absents d'une ligne de mise à jour ne remplacent jamais une valeur
existante par du vide. Une mise à jour qui ferait régresser un statut
(ex. `DELIVERED` → `CONFIRMED`) est refusée pour ce groupe et rapportée
explicitement, jamais appliquée silencieusement.

Si l'import crée directement une commande à `CONFIRMED`/`DELIVERED` (cas
d'une commande déjà livrée dont on importe l'historique), la même
transaction atomique de sortie de stock s'exécute avec la date de
l'événement fournie ; si elle échoue (recette introuvable, stock
insuffisant), la ligne est marquée invalide avec un message de résolution
explicite — jamais un coût inventé à zéro. Le mapping des colonnes est
mémorisé par organisation et pré-rempli à l'import suivant.
