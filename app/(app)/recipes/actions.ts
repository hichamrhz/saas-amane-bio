"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createRecipe, archiveRecipe, RecipeError } from "@/lib/recipes/service";
import { parseDecimalInput, parseIntegerInput, requireString } from "@/lib/numbers";
import type { RecipeComponentMode } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const MODES: RecipeComponentMode[] = ["PER_BOTTLE", "PER_PACKAGE", "PER_ORDER"];

export async function createRecipeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole(["STOCK"]);

  const name = requireString(formData.get("name"));
  const minBottles = parseIntegerInput(formData.get("minBottles"));
  const maxBottles = parseIntegerInput(formData.get("maxBottles"));
  const bottlesPerPackage = parseIntegerInput(formData.get("bottlesPerPackage"));

  if (!name || minBottles === null || maxBottles === null) {
    return { error: "Le nom et la tranche de bouteilles (min/max) sont requis." };
  }

  const components: { articleVariantId: string; mode: RecipeComponentMode; quantityPerUnit: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const articleVariantId = requireString(formData.get(`component-${i}-articleVariantId`));
    const modeRaw = requireString(formData.get(`component-${i}-mode`));
    const quantityPerUnit = parseDecimalInput(formData.get(`component-${i}-quantityPerUnit`));
    if (!articleVariantId || !modeRaw || !quantityPerUnit) continue;
    const mode = MODES.find((m) => m === modeRaw);
    if (!mode) return { error: `Mode de calcul invalide sur la ligne ${i + 1}.` };
    components.push({ articleVariantId, mode, quantityPerUnit });
  }

  try {
    await createRecipe({
      organizationId: session.organizationId,
      name,
      minBottles,
      maxBottles,
      bottlesPerPackage,
      effectiveFrom: new Date(),
      components,
    });
  } catch (error) {
    if (error instanceof RecipeError) return { error: error.message };
    throw error;
  }
  revalidatePath("/recipes");
  return undefined;
}

export async function archiveRecipeAction(recipeId: string) {
  const session = await requireRole(["STOCK"]);
  await archiveRecipe(session.organizationId, recipeId);
  revalidatePath("/recipes");
}
