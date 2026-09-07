import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createCooperativeTransfer, TransferError } from "@/lib/purchasing/transfers";
import { createReception } from "@/lib/purchasing/receptions";
import { getOnHandAt } from "@/lib/inventory/stock";
import { createTestContext, createLabelVariant, createProductVariant } from "./helpers/fixtures";

describe("transferts vers la coopérative (cahier des charges §4)", () => {
  it("un transfert change l'emplacement sans changer la quantité totale", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "P", sku: `P-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette",
      sku: `L-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.internal.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "1000", unitCost: "2" }],
    });

    await createCooperativeTransfer({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: label.id,
      fromLocationId: ctx.internal.id,
      toLocationId: ctx.coop.id,
      quantity: "300",
      eventDate: new Date(),
    });

    const atHome = await getOnHandAt(ctx.organizationId, label.id, ctx.internal.id);
    const atCoop = await getOnHandAt(ctx.organizationId, label.id, ctx.coop.id);
    expect(atHome.toString()).toBe("700");
    expect(atCoop.toString()).toBe("300");
    expect(atHome.plus(atCoop).toString()).toBe("1000");
  });

  it("un transfert est bloqué si le stock source est insuffisant", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "P2", sku: `P2-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette 2",
      sku: `L2-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    await expect(
      createCooperativeTransfer({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        articleVariantId: label.id,
        fromLocationId: ctx.internal.id,
        toLocationId: ctx.coop.id,
        quantity: "50",
        eventDate: new Date(),
      })
    ).rejects.toThrow(TransferError);
  });
});
