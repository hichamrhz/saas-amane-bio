import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { runImport } from "@/lib/imports/service";
import { parseCsv } from "@/lib/imports/csv";
import { getOnHandAt } from "@/lib/inventory/stock";
import { createTestContext, createProductVariant, createConsumableVariant, createTestRecipe } from "./helpers/fixtures";

const MAPPING = {
  "numero commande": "orderNumber",
  client: "customerName",
  telephone: "customerPhone",
  adresse: "deliveryAddress",
  canal: "channel",
  sku: "sku",
  quantite: "quantity",
  "prix unitaire": "unitPrice",
  statut: "status",
  date: "eventDate",
} as const;

async function setupImportFixture() {
  const ctx = await createTestContext();
  const product = await createProductVariant(ctx.organizationId, {
    name: "Vinaigre import",
    sku: `IMP-${randomUUID().slice(0, 6)}`,
  });
  const carton = await createConsumableVariant(ctx.organizationId, {
    name: "Carton import",
    sku: `IMPC-${randomUUID().slice(0, 6)}`,
    consumableType: "CARTON",
  });
  await createTestRecipe({
    organizationId: ctx.organizationId,
    name: "Standard",
    minBottles: 1,
    maxBottles: 9999,
    components: [{ articleVariantId: carton.id, mode: "PER_ORDER", quantityPerUnit: "1" }],
  });
  await prisma.stockMovement.create({
    data: {
      organizationId: ctx.organizationId,
      articleVariantId: product.id,
      locationId: ctx.internal.id,
      type: "OPENING",
      quantityDelta: "1000",
      unitCost: "10",
      referenceType: "TestSeed",
      referenceId: "seed",
      eventDate: new Date(),
      createdById: ctx.userId,
    },
  });
  await prisma.stockMovement.create({
    data: {
      organizationId: ctx.organizationId,
      articleVariantId: carton.id,
      locationId: ctx.internal.id,
      type: "OPENING",
      quantityDelta: "100",
      unitCost: "3",
      referenceType: "TestSeed",
      referenceId: "seed",
      eventDate: new Date(),
      createdById: ctx.userId,
    },
  });
  return { ctx, product, carton };
}

describe("import CSV de commandes (cahier des charges §9, tests d'acceptation #25-26)", () => {
  it("importe une commande multi-produits (une ligne par article) avec des totaux corrects", async () => {
    const { ctx, product } = await setupImportFixture();
    const product2 = await createProductVariant(ctx.organizationId, { name: "Confiture import", sku: `IMP2-${randomUUID().slice(0, 6)}` });
    await prisma.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        articleVariantId: product2.id,
        locationId: ctx.internal.id,
        type: "OPENING",
        quantityDelta: "500",
        unitCost: "8",
        referenceType: "TestSeed",
        referenceId: "seed",
        eventDate: new Date(),
        createdById: ctx.userId,
      },
    });

    const csv = [
      "numero commande,client,telephone,sku,quantite,prix unitaire",
      `CMD-MULTI,Fatima,0611223344,${product.sku},2,50`,
      `CMD-MULTI,,,${product2.sku},1,"30,5"`, // decimal comma, global fields blank on 2nd line
    ].join("\n");

    const result = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(csv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });

    expect(result.created).toBe(1);
    expect(result.invalid).toBe(0);

    const order = await prisma.order.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, orderNumber: "CMD-MULTI" },
      include: { lines: true },
    });
    expect(order.lines).toHaveLength(2);
    expect(order.customerPhone).toBe("0611223344");
    expect(order.subtotalAmount.toString()).toBe("130.5"); // 2*50 + 1*30.5
  });

  it("téléphone commençant par zéro conservé tel quel, virgule décimale acceptée", async () => {
    const { ctx, product } = await setupImportFixture();
    const csv = [
      "numero commande,client,telephone,sku,quantite,prix unitaire",
      `CMD-PHONE,Yassine,0700112233,${product.sku},1,"25,75"`,
    ].join("\n");

    await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(csv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });

    const order = await prisma.order.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, orderNumber: "CMD-PHONE" },
    });
    expect(order.customerPhone).toBe("0700112233");
    expect(order.subtotalAmount.toString()).toBe("25.75");
  });

  it("réimport identique : idempotent, aucun doublon ni sortie supplémentaire (test #26)", async () => {
    const { ctx, product, carton } = await setupImportFixture();
    const csv = [
      "numero commande,client,sku,quantite,prix unitaire,statut",
      `CMD-REPEAT,Yassine,${product.sku},2,50,Livree`,
    ].join("\n");
    const rows = parseCsv(csv);

    const first = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows,
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });
    expect(first.created).toBe(1);

    const second = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows,
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });
    expect(second.duplicates).toBe(1);
    expect(second.created).toBe(0);

    const orderCount = await prisma.order.count({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-REPEAT" } });
    expect(orderCount).toBe(1);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const cartonStock = await getOnHandAt(ctx.organizationId, carton.id, ctx.internal.id);
    expect(productStock.toString()).toBe("998"); // 1000 - 2, exactly once
    expect(cartonStock.toString()).toBe("99");
  });

  it("commande Livrée inconnue importée sans recette configurée : mise en résolution, pas de coût inventé (test #13)", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "P", sku: `NOREC-${randomUUID().slice(0, 6)}` });
    await prisma.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        articleVariantId: product.id,
        locationId: ctx.internal.id,
        type: "OPENING",
        quantityDelta: "100",
        unitCost: "10",
        referenceType: "TestSeed",
        referenceId: "seed",
        eventDate: new Date(),
        createdById: ctx.userId,
      },
    });
    // No recipe configured at all.
    const csv = ["numero commande,sku,quantite,prix unitaire,statut", `CMD-NOREC,${product.sku},2,50,Livree`].join("\n");

    const result = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(csv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });

    expect(result.created).toBe(1);
    expect(result.rows[0].message).toContain("bloquée");

    const order = await prisma.order.findFirstOrThrow({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-NOREC" } });
    expect(order.status).toBe("NEW"); // created, but not silently pushed to Delivered with an invented cost
  });

  it("mise à jour ne fait jamais régresser un statut (Livrée -> Confirmed ignoré)", async () => {
    const { ctx, product } = await setupImportFixture();
    const deliverCsv = ["numero commande,sku,quantite,prix unitaire,statut", `CMD-NOREG,${product.sku},2,50,Livree`].join("\n");
    await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(deliverCsv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });

    const regressCsv = ["numero commande,sku,quantite,prix unitaire,statut", `CMD-NOREG,${product.sku},2,50,Confirmee`].join("\n");
    const result = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(regressCsv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });
    expect(result.regressionsSkipped).toBe(1);

    const order = await prisma.order.findFirstOrThrow({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-NOREG" } });
    expect(order.status).toBe("DELIVERED");
  });

  it("commande historique (skipStockImpact) : aucun mouvement de stock, même livrée", async () => {
    const { ctx, product } = await setupImportFixture();
    const csv = ["numero commande,sku,quantite,prix unitaire,statut", `CMD-HIST,${product.sku},2,50,Livree`].join("\n");

    await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(csv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: true,
    });

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("1000"); // untouched
    const order = await prisma.order.findFirstOrThrow({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-HIST" } });
    expect(order.status).toBe("DELIVERED");
  });

  it("import interrompu/partiel : une ligne invalide n'empêche pas les autres commandes d'être traitées", async () => {
    const { ctx, product } = await setupImportFixture();
    const csv = [
      "numero commande,sku,quantite,prix unitaire",
      `CMD-OK-1,${product.sku},1,50`,
      `CMD-BAD,SKU-INEXISTANT,1,50`,
      `CMD-OK-2,${product.sku},1,50`,
    ].join("\n");

    const result = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceFormat: "CSV",
      rows: parseCsv(csv),
      mapping: MAPPING,
      dateFormat: "DD/MM/YYYY",
      skipStockImpact: false,
    });

    expect(result.created).toBe(2);
    expect(result.invalid).toBe(1);
    const ok1 = await prisma.order.findFirst({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-OK-1" } });
    const ok2 = await prisma.order.findFirst({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-OK-2" } });
    const bad = await prisma.order.findFirst({ where: { organizationId: ctx.organizationId, orderNumber: "CMD-BAD" } });
    expect(ok1).not.toBeNull();
    expect(ok2).not.toBeNull();
    expect(bad).toBeNull();
  });
});
