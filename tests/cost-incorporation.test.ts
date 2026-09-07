import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createReception } from "@/lib/purchasing/receptions";
import { createTestContext, createProductVariant, createLabelVariant } from "./helpers/fixtures";

describe("incorporation du coût de l'étiquette (cahier des charges §5)", () => {
  it("costIncludesLabel=false ajoute le coût moyen de l'étiquette une seule fois ; costIncludesLabel=true ne l'ajoute pas", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Coût", sku: `COUT-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette coût",
      sku: `ETQCOUT-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    // Étiquettes achetées à 2 MAD pièce.
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "1000", unitCost: "2" }],
    });

    const withoutLabelInCost = await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "COOPERATIVE_PRODUCT",
      locationId: ctx.internal.id,
      cooperativeLocationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "100", unitCost: "10" }],
    });
    const movementA = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, receptionId: withoutLabelInCost.id, type: "COOPERATIVE_RECEPTION" },
    });
    expect(movementA.unitCost?.toString()).toBe("12"); // 10 + 2 (coût étiquette non inclus)

    const withLabelInCost = await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "COOPERATIVE_PRODUCT",
      locationId: ctx.internal.id,
      cooperativeLocationId: ctx.coop.id,
      costIncludesLabel: true,
      eventDate: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "100", unitCost: "10" }],
    });
    const movementB = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, receptionId: withLabelInCost.id, type: "COOPERATIVE_RECEPTION" },
    });
    expect(movementB.unitCost?.toString()).toBe("10"); // coût étiquette déjà inclus, pas ajouté deux fois
  });
});
