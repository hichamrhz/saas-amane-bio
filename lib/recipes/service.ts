import { prisma } from "@/lib/db/prisma";
import type { RecipeComponentMode } from "@/app/generated/prisma/enums";

export class RecipeError extends Error {}

export type CreateRecipeInput = {
  organizationId: string;
  name: string;
  minBottles: number;
  maxBottles: number;
  bottlesPerPackage?: number | null;
  effectiveFrom: Date;
  components: { articleVariantId: string; mode: RecipeComponentMode; quantityPerUnit: string }[];
};

/** Creates a recipe with its first version. Overlapping ranges are allowed to
 * exist in the data (archived recipes, historical ranges) but two ACTIVE
 * recipes covering the same bottle count will make confirmation fail with an
 * explicit ambiguity error rather than picking one silently — this is
 * deliberately not blocked at creation time, since the ambiguity may be
 * temporary (e.g. mid-edit) and the real guard is at confirmation. */
export async function createRecipe(input: CreateRecipeInput) {
  if (input.minBottles < 1 || input.maxBottles < input.minBottles) {
    throw new RecipeError("La tranche de bouteilles est invalide.");
  }
  if (input.components.length === 0) {
    throw new RecipeError("Une recette doit avoir au moins un composant.");
  }
  await assertComponentsBelongToOrg(input.organizationId, input.components);

  return prisma.recipe.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      minBottles: input.minBottles,
      maxBottles: input.maxBottles,
      bottlesPerPackage: input.bottlesPerPackage ?? null,
      versions: {
        create: {
          version: 1,
          effectiveFrom: input.effectiveFrom,
          components: {
            create: input.components.map((c) => ({
              articleVariantId: c.articleVariantId,
              mode: c.mode,
              quantityPerUnit: c.quantityPerUnit,
            })),
          },
        },
      },
    },
    include: { versions: { include: { components: true } } },
  });
}

/** Adds a new dated version to an existing recipe. Past orders keep
 * referencing the version they were confirmed with — editing a recipe never
 * alters history (cahier des charges §7). */
export async function addRecipeVersion(input: {
  organizationId: string;
  recipeId: string;
  effectiveFrom: Date;
  notes?: string | null;
  components: { articleVariantId: string; mode: RecipeComponentMode; quantityPerUnit: string }[];
}) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: input.recipeId, organizationId: input.organizationId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!recipe) throw new RecipeError("Recette introuvable.");
  if (input.components.length === 0) {
    throw new RecipeError("Une recette doit avoir au moins un composant.");
  }
  await assertComponentsBelongToOrg(input.organizationId, input.components);

  const nextVersion = (recipe.versions[0]?.version ?? 0) + 1;
  return prisma.recipeVersion.create({
    data: {
      recipeId: recipe.id,
      version: nextVersion,
      effectiveFrom: input.effectiveFrom,
      notes: input.notes ?? null,
      components: {
        create: input.components.map((c) => ({
          articleVariantId: c.articleVariantId,
          mode: c.mode,
          quantityPerUnit: c.quantityPerUnit,
        })),
      },
    },
    include: { components: true },
  });
}

/** Recipe components have no organizationId column of their own — they
 * trust the referenced ArticleVariant's own org. Without this check, a
 * caller could point a component at another organization's consumable;
 * downstream stock checks would just see "0 available" for that org-scoped
 * ledger (no actual cross-org leak or corruption), but confirmation would
 * fail confusingly instead of at the real source of the mistake. */
async function assertComponentsBelongToOrg(
  organizationId: string,
  components: { articleVariantId: string }[]
) {
  const ids = [...new Set(components.map((c) => c.articleVariantId))];
  const count = await prisma.articleVariant.count({ where: { id: { in: ids }, organizationId } });
  if (count !== ids.length) {
    throw new RecipeError("Un ou plusieurs composants n'appartiennent pas à cette organisation.");
  }
}

export async function listRecipes(organizationId: string) {
  return prisma.recipe.findMany({
    where: { organizationId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { components: { include: { articleVariant: { include: { article: true } } } } },
      },
    },
    orderBy: { minBottles: "asc" },
  });
}

export async function archiveRecipe(organizationId: string, recipeId: string) {
  await prisma.recipe.updateMany({
    where: { id: recipeId, organizationId },
    data: { archivedAt: new Date() },
  });
}
