import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Creates a brand-new, fully isolated organization (with an owner user and
 * the two standard locations) for a single test. Every test gets its own
 * organization id, so tests never need to share or reset state between
 * each other within a run — true fixture isolation (§21).
 */
export async function createTestContext() {
  const suffix = randomUUID().slice(0, 8);

  const organization = await prisma.organization.create({
    data: { name: `Test Org ${suffix}`, currency: "MAD", timezone: "Africa/Casablanca" },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: `owner-${suffix}@test.local`,
      name: "Test Owner",
      passwordHash: "unused",
      role: "OWNER",
    },
  });

  const internal = await prisma.location.create({
    data: { organizationId: organization.id, name: "Chez moi", kind: "INTERNAL", isDefault: true },
  });

  const coop = await prisma.location.create({
    data: { organizationId: organization.id, name: "Coopérative", kind: "COOPERATIVE" },
  });

  return { organizationId: organization.id, userId: user.id, internal, coop };
}

export async function createProductVariant(organizationId: string, opts: { name: string; sku: string }) {
  const article = await prisma.article.create({
    data: { organizationId, kind: "PRODUCT", name: opts.name },
  });
  return prisma.articleVariant.create({
    data: {
      organizationId,
      articleId: article.id,
      sku: opts.sku,
      label: "500ml",
      purchaseUnitLabel: "unité",
      stockUnitLabel: "unité",
      purchaseToStockFactor: "1",
      isIntegerStock: true,
    },
  });
}

export async function createLabelVariant(
  organizationId: string,
  opts: { name: string; sku: string; productVariantId: string }
) {
  const article = await prisma.article.create({
    data: { organizationId, kind: "CONSUMABLE", consumableType: "LABEL", name: opts.name },
  });
  return prisma.articleVariant.create({
    data: {
      organizationId,
      articleId: article.id,
      sku: opts.sku,
      label: "500ml",
      purchaseUnitLabel: "unité",
      stockUnitLabel: "unité",
      purchaseToStockFactor: "1",
      isIntegerStock: true,
      productVariantId: opts.productVariantId,
    },
  });
}
