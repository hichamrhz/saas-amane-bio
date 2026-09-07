import { prisma } from "@/lib/db/prisma";
import type { ArticleKind, ConsumableType } from "@/app/generated/prisma/enums";

export class CatalogError extends Error {}

export type CreateArticleVariantInput = {
  organizationId: string;
  kind: ArticleKind;
  articleName: string;
  category?: string | null;
  consumableType?: ConsumableType | null;
  sku: string;
  label: string;
  purchaseUnitLabel: string;
  stockUnitLabel: string;
  purchaseToStockFactor: string;
  isIntegerStock: boolean;
  widthCm?: string | null;
  supplierId?: string | null;
  productVariantId?: string | null; // only meaningful when consumableType === "LABEL"
};

/**
 * Finds-or-creates the parent Article by (organization, kind, name), then
 * creates a new SKU variant under it. Two rolls of different widths, or two
 * labels for different products, are always distinct variants — never
 * merged (see ARCHITECTURE.md §3).
 */
export async function createArticleVariant(input: CreateArticleVariantInput) {
  if (input.consumableType === "LABEL" && input.productVariantId) {
    const existingMapping = await prisma.articleVariant.findFirst({
      where: {
        organizationId: input.organizationId,
        productVariantId: input.productVariantId,
        article: { consumableType: "LABEL" },
      },
    });
    if (existingMapping) {
      throw new CatalogError(
        "Ce produit est déjà associé à une autre étiquette. Un seul mapping actif est autorisé par produit."
      );
    }
  }

  // (organizationId, kind, name) is treated as effectively unique for this
  // internal tool; enforced here in application code rather than with a DB
  // constraint, so the same name can exist once as PRODUCT and, separately,
  // describe its own consumables (e.g. a carton named after the product).
  const article =
    (await prisma.article.findFirst({
      where: { organizationId: input.organizationId, kind: input.kind, name: input.articleName },
    })) ??
    (await prisma.article.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        name: input.articleName,
        category: input.category,
        consumableType: input.kind === "CONSUMABLE" ? input.consumableType : null,
      },
    }));

  try {
    return await prisma.articleVariant.create({
      data: {
        organizationId: input.organizationId,
        articleId: article.id,
        sku: input.sku,
        label: input.label,
        purchaseUnitLabel: input.purchaseUnitLabel,
        stockUnitLabel: input.stockUnitLabel,
        purchaseToStockFactor: input.purchaseToStockFactor,
        isIntegerStock: input.isIntegerStock,
        widthCm: input.widthCm ?? null,
        supplierId: input.supplierId ?? null,
        productVariantId: input.productVariantId ?? null,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new CatalogError(`Le SKU "${input.sku}" existe déjà dans cette organisation.`);
    }
    throw error;
  }
}

export async function listArticleVariants(organizationId: string, kind: ArticleKind) {
  return prisma.articleVariant.findMany({
    where: { organizationId, article: { kind } },
    include: { article: true, productVariant: { include: { article: true } } },
    orderBy: [{ article: { name: "asc" } }, { label: "asc" }],
  });
}

export async function archiveArticleVariant(organizationId: string, variantId: string) {
  await prisma.articleVariant.updateMany({
    where: { id: variantId, organizationId },
    data: { status: "ARCHIVED" },
  });
}
