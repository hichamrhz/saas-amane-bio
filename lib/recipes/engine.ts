import Decimal from "decimal.js";
import type { Prisma } from "@/app/generated/prisma/client";

export type RecipeResolutionErrorCode = "NO_MATCH" | "AMBIGUOUS";

export class RecipeResolutionError extends Error {
  code: RecipeResolutionErrorCode;
  constructor(code: RecipeResolutionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * A recipe describes packaging only (carton, bubble wrap, tape, salt,
 * sachet, card, notice, gift) for a given TOTAL bottle count in an order —
 * never per product. The product itself is always deducted separately,
 * unconditionally. Labels are never touched here (see ARCHITECTURE.md §4/§8).
 *
 * Selection is deterministic: exactly one non-archived recipe must cover
 * `totalBottles`. Zero or more than one match is a hard error requiring a
 * human to fix the configuration before the order can be confirmed —
 * never a silent guess (cahier des charges §7).
 */
export async function resolvePackagingRecipe(
  tx: Prisma.TransactionClient,
  organizationId: string,
  totalBottles: number,
  atDate: Date
) {
  const candidates = await tx.recipe.findMany({
    where: {
      organizationId,
      archivedAt: null,
      minBottles: { lte: totalBottles },
      maxBottles: { gte: totalBottles },
    },
  });

  if (candidates.length === 0) {
    throw new RecipeResolutionError(
      "NO_MATCH",
      `Aucune recette d'emballage ne correspond à ${totalBottles} bouteille(s). Configurez une recette pour cette tranche avant de confirmer.`
    );
  }
  if (candidates.length > 1) {
    throw new RecipeResolutionError(
      "AMBIGUOUS",
      `Plusieurs recettes d'emballage correspondent à ${totalBottles} bouteille(s) (tranches qui se chevauchent). Corrigez la configuration.`
    );
  }

  const recipe = candidates[0];
  const version = await tx.recipeVersion.findFirst({
    where: { recipeId: recipe.id, effectiveFrom: { lte: atDate } },
    orderBy: { effectiveFrom: "desc" },
    include: {
      components: { include: { articleVariant: { include: { article: true } } } },
    },
  });

  if (!version) {
    throw new RecipeResolutionError(
      "NO_MATCH",
      `La recette "${recipe.name}" n'a aucune version active à cette date. Ajoutez une version avant de confirmer.`
    );
  }

  return { recipe, version };
}

export type PackagingLine = {
  articleVariantId: string;
  quantity: string;
  recipeVersionId: string;
};

/**
 * Explodes a resolved recipe version into concrete packaging quantities.
 * Salt/sachet components are skipped entirely when the order opted out of
 * salt — never partially consumed (cahier des charges §6, test #6).
 */
export function computePackagingConsumption(
  recipe: { bottlesPerPackage: number | null },
  version: {
    id: string;
    components: {
      articleVariantId: string;
      mode: string;
      quantityPerUnit: { toString(): string };
      articleVariant: { article: { consumableType: string | null } };
    }[];
  },
  totalBottles: number,
  withSalt: boolean
): PackagingLine[] {
  const packages = recipe.bottlesPerPackage ? Math.ceil(totalBottles / recipe.bottlesPerPackage) : 1;

  const lines: PackagingLine[] = [];
  for (const component of version.components) {
    const consumableType = component.articleVariant.article.consumableType;
    if (!withSalt && (consumableType === "SALT" || consumableType === "SALT_SACHET")) {
      continue;
    }

    const multiplier =
      component.mode === "PER_BOTTLE" ? totalBottles : component.mode === "PER_PACKAGE" ? packages : 1;
    const quantity = new Decimal(component.quantityPerUnit.toString()).times(multiplier);
    if (quantity.isZero()) continue;

    lines.push({
      articleVariantId: component.articleVariantId,
      quantity: quantity.toString(),
      recipeVersionId: version.id,
    });
  }
  return lines;
}
