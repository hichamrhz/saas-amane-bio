# AMANE BIO — gestion opérationnelle

Application interne de gestion du stock, des achats et de la coopérative
pour AMANE BIO. Voir `ARCHITECTURE.md` pour le plan et le modèle
d'événements, et `PROGRESS.md` pour l'état détaillé (fait / partiel /
restant) et la correspondance avec les 30 tests d'acceptation du cahier des
charges.

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL (Prisma 7) · NextAuth ·
next-intl (FR/AR RTL) · Tailwind · Vitest · Playwright.

## Démarrage

```bash
pnpm install
cp .env.example .env      # renseigner DATABASE_URL (PostgreSQL réel) et AUTH_SECRET
pnpm db:migrate            # crée le schéma
pnpm db:seed               # crée l'organisation, les emplacements et le compte propriétaire
pnpm dev                   # http://localhost:3000
```

Connexion par défaut créée par `pnpm db:seed` : `owner@amanebio.test` /
`changeme123` — à changer après la première connexion. Personnalisable via
les variables d'environnement `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`.

## Utilisation — boucle de base

1. **Produits** (`/products`) : créer une variante de produit fini (SKU,
   format).
2. **Emballages et étiquettes** (`/packaging`) : créer l'étiquette
   correspondante (type "Étiquette") et l'associer au produit — ce mapping
   est requis pour toute réception coopérative de ce produit.
3. **Achats et fournisseurs** (`/purchases`) : ajouter un fournisseur puis
   réceptionner les étiquettes achetées (type "Achat fournisseur").
4. **Coopérative et réceptions** (`/cooperative`) : transférer une partie
   des étiquettes vers la coopérative, puis réceptionner les bouteilles
   préparées — le système consomme automatiquement les étiquettes
   correspondantes chez la coopérative, ou bloque intégralement la
   réception si elles sont insuffisantes.
5. **Inventaires et mouvements** (`/inventory`) : consulter le stock
   disponible par emplacement et le journal complet des mouvements.

Les autres pages de la navigation (recettes, commandes, retours,
transporteurs, équipe, commissions, dépenses, rapports) affichent
explicitement "fonctionnalité à venir" — voir `PROGRESS.md` pour le détail
de ce qui reste à construire.

## Tests

```bash
pnpm test        # Vitest — logique métier, contre une vraie base Postgres de test
pnpm test:e2e    # Playwright — parcours réels dans un navigateur (nécessite `pnpm dev`)
pnpm build       # vérifie la compilation et le typage complets
```

La première exécution de `pnpm test` nécessite une base de test dédiée —
voir "Tests automatisés" dans `PROGRESS.md` pour la configuration
(`.env.test`, `pnpm db:push:test`).

## Sauvegarde et restauration

Aucun service de sauvegarde automatique n'est configuré dans cet
environnement de développement. En production, planifier des sauvegardes
régulières de la base PostgreSQL (`pg_dump`, ou le mécanisme de sauvegarde
de l'hébergeur choisi) et tester la procédure de restauration avant mise en
production réelle — ne jamais supposer qu'une sauvegarde existe sans
service qui l'exécute réellement.
