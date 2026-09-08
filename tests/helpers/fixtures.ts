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

export async function createConsumableVariant(
  organizationId: string,
  opts: {
    name: string;
    sku: string;
    consumableType: "CARTON" | "BUBBLE_WRAP" | "TAPE" | "SALT" | "SALT_SACHET" | "CARD" | "NOTICE" | "GIFT" | "OTHER";
    isIntegerStock?: boolean;
  }
) {
  const article = await prisma.article.create({
    data: { organizationId, kind: "CONSUMABLE", consumableType: opts.consumableType, name: opts.name },
  });
  return prisma.articleVariant.create({
    data: {
      organizationId,
      articleId: article.id,
      sku: opts.sku,
      label: "standard",
      purchaseUnitLabel: "unité",
      stockUnitLabel: "unité",
      purchaseToStockFactor: "1",
      isIntegerStock: opts.isIntegerStock ?? true,
    },
  });
}

/** Seeds opening stock directly via the ledger, bypassing the reception
 * service — appropriate for test setup when the test is about the order
 * engine, not about receptions (which have their own dedicated tests). */
export async function seedOpeningStock(opts: {
  organizationId: string;
  userId: string;
  articleVariantId: string;
  locationId: string;
  quantity: string;
  unitCost: string;
}) {
  return prisma.stockMovement.create({
    data: {
      organizationId: opts.organizationId,
      articleVariantId: opts.articleVariantId,
      locationId: opts.locationId,
      type: "OPENING",
      quantityDelta: opts.quantity,
      unitCost: opts.unitCost,
      referenceType: "TestSeed",
      referenceId: "seed",
      eventDate: new Date(),
      createdById: opts.userId,
    },
  });
}

export async function createTestRecipe(opts: {
  organizationId: string;
  name: string;
  minBottles: number;
  maxBottles: number;
  bottlesPerPackage?: number;
  effectiveFrom?: Date;
  components: { articleVariantId: string; mode: "PER_BOTTLE" | "PER_PACKAGE" | "PER_ORDER"; quantityPerUnit: string }[];
}) {
  return prisma.recipe.create({
    data: {
      organizationId: opts.organizationId,
      name: opts.name,
      minBottles: opts.minBottles,
      maxBottles: opts.maxBottles,
      bottlesPerPackage: opts.bottlesPerPackage ?? null,
      versions: {
        create: {
          version: 1,
          effectiveFrom: opts.effectiveFrom ?? new Date("2020-01-01"),
          components: { create: opts.components },
        },
      },
    },
    include: { versions: { include: { components: true } } },
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
