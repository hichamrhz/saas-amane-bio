import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createReception } from "@/lib/purchasing/receptions";
import { getOnHandAt } from "@/lib/inventory/stock";
import { createTestContext, createProductVariant, createLabelVariant } from "./helpers/fixtures";

describe("concurrence sur le dernier stock (cahier des charges §19, test d'acceptation #10)", () => {
  it("deux réceptions simultanées demandant plus que le stock disponible : une seule réussit, jamais de stock négatif", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, {
      name: "Vinaigre concurrence",
      sku: `CONC-${randomUUID().slice(0, 6)}`,
    });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette concurrence",
      sku: `ETQCC-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    // Seulement 100 étiquettes disponibles : deux réceptions de 80 chacune
    // ne peuvent pas toutes les deux réussir.
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "100", unitCost: "1" }],
    });

    const attempt = () =>
      createReception({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        kind: "COOPERATIVE_PRODUCT",
        locationId: ctx.internal.id,
        cooperativeLocationId: ctx.coop.id,
        costIncludesLabel: false,
        eventDate: new Date(),
        lines: [{ articleVariantId: product.id, quantity: "80", unitCost: "10" }],
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const labelAtCoop = await getOnHandAt(ctx.organizationId, label.id, ctx.coop.id);
    const productAtHome = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);

    // Never negative, and exactly one 80-unit reception went through.
    expect(labelAtCoop.greaterThanOrEqualTo(0)).toBe(true);
    expect(labelAtCoop.toString()).toBe("20");
    expect(productAtHome.toString()).toBe("80");
  });
});
