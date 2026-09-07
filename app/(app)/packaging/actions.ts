"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createArticleVariant, archiveArticleVariant, CatalogError } from "@/lib/catalog/service";
import { parseDecimalInput, requireString } from "@/lib/numbers";
import type { ConsumableType } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const CONSUMABLE_TYPES: ConsumableType[] = [
  "LABEL",
  "CARTON",
  "BUBBLE_WRAP",
  "TAPE",
  "SALT",
  "SALT_SACHET",
  "CARD",
  "NOTICE",
  "GIFT",
  "OTHER",
];

export async function createConsumableVariantAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(["STOCK"]);

  const articleName = requireString(formData.get("articleName"));
  const sku = requireString(formData.get("sku"));
  const label = requireString(formData.get("label"));
  const purchaseUnitLabel = requireString(formData.get("purchaseUnitLabel")) ?? "unité";
  const stockUnitLabel = requireString(formData.get("stockUnitLabel")) ?? "unité";
  const purchaseToStockFactor = parseDecimalInput(formData.get("purchaseToStockFactor")) ?? "1";
  const widthCm = parseDecimalInput(formData.get("widthCm"));
  const consumableTypeRaw = requireString(formData.get("consumableType"));
  const isIntegerStock = formData.get("isIntegerStock") === "on";
  const productVariantId = requireString(formData.get("productVariantId"));

  if (!articleName || !sku || !label) {
    return { error: "Le nom, le SKU et le format sont requis." };
  }
  const consumableType = CONSUMABLE_TYPES.find((c) => c === consumableTypeRaw);
  if (!consumableType) {
    return { error: "Type de consommable invalide." };
  }
  if (consumableType === "LABEL" && !productVariantId) {
    return { error: "Une étiquette doit être associée à un produit." };
  }

  try {
    await createArticleVariant({
      organizationId: session.organizationId,
      kind: "CONSUMABLE",
      articleName,
      consumableType,
      sku,
      label,
      purchaseUnitLabel,
      stockUnitLabel,
      purchaseToStockFactor,
      isIntegerStock,
      widthCm,
      productVariantId: consumableType === "LABEL" ? productVariantId : null,
    });
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message };
    throw error;
  }

  revalidatePath("/packaging");
  return undefined;
}

export async function archiveConsumableVariantAction(variantId: string) {
  const session = await requireRole(["STOCK"]);
  await archiveArticleVariant(session.organizationId, variantId);
  revalidatePath("/packaging");
}
