import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createReception, ReceptionError } from "@/lib/purchasing/receptions";
import { createCooperativeTransfer } from "@/lib/purchasing/transfers";
import { getOnHandAt } from "@/lib/inventory/stock";
import { createTestContext, createProductVariant, createLabelVariant } from "./helpers/fixtures";

describe("réceptions et règle étiquettes/coopérative (cahier des charges §4, tests d'acceptation #1-3, #8, #14)", () => {
  it("exemple obligatoire : achat 2000, transfert 1500, réceptions 200 puis 400 -> 500 chez moi / 900 coopérative / 600 bouteilles", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Vinaigre", sku: `VIN-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Vinaigre",
      sku: `ETQ-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    // Achat de 2000 étiquettes, reçues "chez moi".
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.internal.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "2000", unitCost: "1" }],
    });

    // Transfert de 1500 vers la coopérative.
    await createCooperativeTransfer({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: label.id,
      fromLocationId: ctx.internal.id,
      toLocationId: ctx.coop.id,
      quantity: "1500",
      eventDate: new Date(),
    });

    // Réception de 200 puis 400 bouteilles depuis la coopérative.
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "COOPERATIVE_PRODUCT",
      locationId: ctx.internal.id,
      cooperativeLocationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "200", unitCost: "10" }],
    });
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "COOPERATIVE_PRODUCT",
      locationId: ctx.internal.id,
      cooperativeLocationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "400", unitCost: "10" }],
    });

    const labelAtHome = await getOnHandAt(ctx.organizationId, label.id, ctx.internal.id);
    const labelAtCoop = await getOnHandAt(ctx.organizationId, label.id, ctx.coop.id);
    const productAtHome = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);

    expect(labelAtHome.toString()).toBe("500");
    expect(labelAtCoop.toString()).toBe("900");
    expect(productAtHome.toString()).toBe("600");

    const consumedTotal = await prisma.stockMovement.aggregate({
      where: { organizationId: ctx.organizationId, type: "LABEL_CONSUMPTION" },
      _sum: { quantityDelta: true },
    });
    expect(consumedTotal._sum.quantityDelta?.toString()).toBe("-600");
  });

  it("réception avec étiquettes insuffisantes : aucune écriture n'est validée (atomicité)", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Confiture", sku: `CNF-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Confiture",
      sku: `ETQC-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    // Seulement 50 étiquettes à la coopérative.
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "50", unitCost: "1" }],
    });

    await expect(
      createReception({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        kind: "COOPERATIVE_PRODUCT",
        locationId: ctx.internal.id,
        cooperativeLocationId: ctx.coop.id,
        costIncludesLabel: false,
        eventDate: new Date(),
        lines: [{ articleVariantId: product.id, quantity: "100", unitCost: "10" }],
      })
    ).rejects.toThrow(ReceptionError);

    // Rien n'a été écrit : ni le produit, ni une consommation partielle d'étiquette.
    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const labelStock = await getOnHandAt(ctx.organizationId, label.id, ctx.coop.id);
    expect(productStock.toString()).toBe("0");
    expect(labelStock.toString()).toBe("50");

    const receptionCount = await prisma.reception.count({
      where: { organizationId: ctx.organizationId, kind: "COOPERATIVE_PRODUCT" },
    });
    expect(receptionCount).toBe(0);
  });

  it("aucune étiquette associée au produit : réception bloquée", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Huile", sku: `HLE-${randomUUID().slice(0, 6)}` });

    await expect(
      createReception({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        kind: "COOPERATIVE_PRODUCT",
        locationId: ctx.internal.id,
        cooperativeLocationId: ctx.coop.id,
        costIncludesLabel: false,
        eventDate: new Date(),
        lines: [{ articleVariantId: product.id, quantity: "10", unitCost: "10" }],
      })
    ).rejects.toMatchObject({ code: "NO_LABEL_MAPPING" });
  });

  it("mapping ambigu (deux étiquettes pour le même produit) : réception bloquée", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Graines", sku: `GRN-${randomUUID().slice(0, 6)}` });
    await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Graines A",
      sku: `ETQGA-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });
    await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Graines B",
      sku: `ETQGB-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });

    await expect(
      createReception({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        kind: "COOPERATIVE_PRODUCT",
        locationId: ctx.internal.id,
        cooperativeLocationId: ctx.coop.id,
        costIncludesLabel: false,
        eventDate: new Date(),
        lines: [{ articleVariantId: product.id, quantity: "10", unitCost: "10" }],
      })
    ).rejects.toMatchObject({ code: "AMBIGUOUS_LABEL_MAPPING" });
  });

  it("stock d'ouverture ne consomme jamais d'étiquettes, même pour un produit avec mapping", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Sel de mer", sku: `SEL-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Sel",
      sku: `ETQS-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });
    // Aucune étiquette en stock nulle part : si OPENING_STOCK déclenchait la
    // consommation, ceci échouerait pour "étiquettes insuffisantes".
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "OPENING_STOCK",
      locationId: ctx.internal.id,
      costIncludesLabel: true,
      eventDate: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "300", unitCost: "8" }],
    });

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const labelConsumptions = await prisma.stockMovement.count({
      where: { organizationId: ctx.organizationId, articleVariantId: label.id, type: "LABEL_CONSUMPTION" },
    });
    expect(productStock.toString()).toBe("300");
    expect(labelConsumptions).toBe(0);
  });

  it("double soumission (même clé d'idempotence) : aucune sortie supplémentaire", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "Vinaigre pomme", sku: `VPM-${randomUUID().slice(0, 6)}` });
    const label = await createLabelVariant(ctx.organizationId, {
      name: "Étiquette Vinaigre pomme",
      sku: `ETQVP-${randomUUID().slice(0, 6)}`,
      productVariantId: product.id,
    });
    await createReception({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "SUPPLIER_PURCHASE",
      locationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      lines: [{ articleVariantId: label.id, quantity: "1000", unitCost: "1" }],
    });

    const clientRequestId = randomUUID();
    const input = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: "COOPERATIVE_PRODUCT" as const,
      locationId: ctx.internal.id,
      cooperativeLocationId: ctx.coop.id,
      costIncludesLabel: false,
      eventDate: new Date(),
      clientRequestId,
      lines: [{ articleVariantId: product.id, quantity: "100", unitCost: "10" }],
    };

    // Double clic / retry réseau : on rejoue exactement la même requête.
    const [first, second] = await Promise.all([createReception(input), createReception({ ...input })]);
    expect(first.id).toBe(second.id);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("100");

    const receptionCount = await prisma.reception.count({
      where: { organizationId: ctx.organizationId, kind: "COOPERATIVE_PRODUCT" },
    });
    expect(receptionCount).toBe(1);
  });
});
