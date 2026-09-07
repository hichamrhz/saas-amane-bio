"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createArticleVariant, archiveArticleVariant, CatalogError } from "@/lib/catalog/service";
import { parseDecimalInput, requireString } from "@/lib/numbers";

export type FormState = { error?: string } | undefined;

export async function createProductVariantAction(
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
  const category = requireString(formData.get("category"));

  if (!articleName || !sku || !label) {
    return { error: "Le nom du produit, le SKU et le format sont requis." };
  }

  try {
    await createArticleVariant({
      organizationId: session.organizationId,
      kind: "PRODUCT",
      articleName,
      category,
      sku,
      label,
      purchaseUnitLabel,
      stockUnitLabel,
      purchaseToStockFactor,
      isIntegerStock: true,
    });
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message };
    throw error;
  }

  revalidatePath("/products");
  return undefined;
}

export async function archiveProductVariantAction(variantId: string) {
  const session = await requireRole(["STOCK"]);
  await archiveArticleVariant(session.organizationId, variantId);
  revalidatePath("/products");
}
