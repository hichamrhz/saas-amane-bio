import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createOrder, confirmOrder, cancelOrderBeforePrep, cancelOrderAfterPrep, OrderError } from "@/lib/orders/service";
import { getOnHandAt } from "@/lib/inventory/stock";
import {
  createTestContext,
  createProductVariant,
  createConsumableVariant,
  createTestRecipe,
  seedOpeningStock,
} from "./helpers/fixtures";

async function setupOrderFixture(overrides?: { bottlesPerPackage?: number }) {
  const ctx = await createTestContext();
  const product = await createProductVariant(ctx.organizationId, {
    name: "Vinaigre commande",
    sku: `ORD-${randomUUID().slice(0, 6)}`,
  });
  const carton = await createConsumableVariant(ctx.organizationId, {
    name: "Carton standard",
    sku: `CTN-${randomUUID().slice(0, 6)}`,
    consumableType: "CARTON",
  });
  const salt = await createConsumableVariant(ctx.organizationId, {
    name: "Sel",
    sku: `SEL-${randomUUID().slice(0, 6)}`,
    consumableType: "SALT",
    isIntegerStock: false,
  });
  const notice = await createConsumableVariant(ctx.organizationId, {
    name: "Notice",
    sku: `NOT-${randomUUID().slice(0, 6)}`,
    consumableType: "NOTICE",
  });

  await createTestRecipe({
    organizationId: ctx.organizationId,
    name: "Emballage standard",
    minBottles: 1,
    maxBottles: 9999,
    bottlesPerPackage: overrides?.bottlesPerPackage ?? 5,
    components: [
      { articleVariantId: carton.id, mode: "PER_PACKAGE", quantityPerUnit: "1" },
      { articleVariantId: salt.id, mode: "PER_BOTTLE", quantityPerUnit: "10" },
      { articleVariantId: notice.id, mode: "PER_ORDER", quantityPerUnit: "1" },
    ],
  });

  await seedOpeningStock({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    articleVariantId: product.id,
    locationId: ctx.internal.id,
    quantity: "1000",
    unitCost: "10",
  });
  await seedOpeningStock({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    articleVariantId: carton.id,
    locationId: ctx.internal.id,
    quantity: "100",
    unitCost: "3",
  });
  await seedOpeningStock({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    articleVariantId: salt.id,
    locationId: ctx.internal.id,
    quantity: "10000",
    unitCost: "0.02",
  });
  await seedOpeningStock({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    articleVariantId: notice.id,
    locationId: ctx.internal.id,
    quantity: "100",
    unitCost: "0.5",
  });

  return { ctx, product, carton, salt, notice };
}

describe("moteur de commandes : confirmation atomique (cahier des charges §8, tests d'acceptation #7-9)", () => {
  it("confirme une commande de 3 bouteilles : sort le produit et l'emballage exacts, notice non multipliée", async () => {
    const { ctx, product, carton, salt, notice } = await setupOrderFixture();

    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "WHATSAPP",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "3", unitPrice: "50" }],
    });

    await confirmOrder(ctx.organizationId, ctx.userId, order.id);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const cartonStock = await getOnHandAt(ctx.organizationId, carton.id, ctx.internal.id);
    const saltStock = await getOnHandAt(ctx.organizationId, salt.id, ctx.internal.id);
    const noticeStock = await getOnHandAt(ctx.organizationId, notice.id, ctx.internal.id);

    expect(productStock.toString()).toBe("997"); // 1000 - 3
    expect(cartonStock.toString()).toBe("99"); // 1 package for <=5 bottles
    expect(saltStock.toString()).toBe("9970"); // 10000 - 3*10
    expect(noticeStock.toString()).toBe("99"); // per order, not per bottle: -1 only

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("CONFIRMED");
  });

  it("ne consomme jamais d'étiquette à la confirmation (limite phase 2/3, §4)", async () => {
    const { ctx, product } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);

    const labelMovements = await prisma.stockMovement.count({
      where: { organizationId: ctx.organizationId, type: "LABEL_CONSUMPTION" },
    });
    expect(labelMovements).toBe(0);
  });

  it("commande sans sel : aucun sel consommé (test d'acceptation #6)", async () => {
    const { ctx, product, salt } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      withSalt: false,
      lines: [{ articleVariantId: product.id, quantity: "3", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);

    const saltStock = await getOnHandAt(ctx.organizationId, salt.id, ctx.internal.id);
    expect(saltStock.toString()).toBe("10000"); // unchanged
  });

  it("stock produit insuffisant : bloque toute la confirmation, aucun emballage sorti non plus", async () => {
    const { ctx, product, carton } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "5000", unitPrice: "50" }],
    });

    await expect(confirmOrder(ctx.organizationId, ctx.userId, order.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const cartonStock = await getOnHandAt(ctx.organizationId, carton.id, ctx.internal.id);
    expect(productStock.toString()).toBe("1000");
    expect(cartonStock.toString()).toBe("100");
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("NEW");
  });

  it("emballage insuffisant : bloque toute la confirmation, le produit n'est pas sorti non plus", async () => {
    const { ctx, product, carton } = await setupOrderFixture();
    // Drain the carton stock down to zero via a correction so the recipe can't be fulfilled.
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: carton.id,
      locationId: ctx.internal.id,
      quantity: "-100",
      unitCost: "3",
    });

    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });

    await expect(confirmOrder(ctx.organizationId, ctx.userId, order.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("1000"); // untouched despite the carton failure
  });

  it("aucune recette ne correspond : confirmation refusée explicitement", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "P", sku: `NR-${randomUUID().slice(0, 6)}` });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: product.id,
      locationId: ctx.internal.id,
      quantity: "100",
      unitCost: "10",
    });
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });

    await expect(confirmOrder(ctx.organizationId, ctx.userId, order.id)).rejects.toMatchObject({
      code: "RECIPE_UNRESOLVED",
    });
  });

  it("deux recettes se chevauchent : confirmation refusée pour ambiguïté (§7)", async () => {
    const ctx = await createTestContext();
    const product = await createProductVariant(ctx.organizationId, { name: "P", sku: `AMB-${randomUUID().slice(0, 6)}` });
    const carton = await createConsumableVariant(ctx.organizationId, {
      name: "Carton",
      sku: `AMBC-${randomUUID().slice(0, 6)}`,
      consumableType: "CARTON",
    });
    await createTestRecipe({
      organizationId: ctx.organizationId,
      name: "1 a 5",
      minBottles: 1,
      maxBottles: 5,
      components: [{ articleVariantId: carton.id, mode: "PER_ORDER", quantityPerUnit: "1" }],
    });
    await createTestRecipe({
      organizationId: ctx.organizationId,
      name: "3 a 8 (chevauche la précédente)",
      minBottles: 3,
      maxBottles: 8,
      components: [{ articleVariantId: carton.id, mode: "PER_ORDER", quantityPerUnit: "1" }],
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: product.id,
      locationId: ctx.internal.id,
      quantity: "100",
      unitCost: "10",
    });
    await seedOpeningStock({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      articleVariantId: carton.id,
      locationId: ctx.internal.id,
      quantity: "100",
      unitCost: "3",
    });

    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "4", unitPrice: "50" }], // in both ranges
    });

    await expect(confirmOrder(ctx.organizationId, ctx.userId, order.id)).rejects.toMatchObject({
      code: "RECIPE_UNRESOLVED",
    });
  });

  it("premier Confirmed sort tout ; un second appel est un no-op (test d'acceptation #8)", async () => {
    const { ctx, product } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });

    await Promise.all([
      confirmOrder(ctx.organizationId, ctx.userId, order.id),
      confirmOrder(ctx.organizationId, ctx.userId, order.id),
    ]);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("998"); // -2 exactly once

    const exitMovements = await prisma.stockMovement.count({
      where: { organizationId: ctx.organizationId, orderId: order.id, articleVariantId: product.id, type: "ORDER_EXIT" },
    });
    expect(exitMovements).toBe(1);
  });

  it("commande historique (skipStockImpact) : la confirmation n'écrit aucun mouvement de stock", async () => {
    const { ctx, product, carton } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date("2020-01-01"),
      skipStockImpact: true,
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const cartonStock = await getOnHandAt(ctx.organizationId, carton.id, ctx.internal.id);
    expect(productStock.toString()).toBe("1000");
    expect(cartonStock.toString()).toBe("100");
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("CONFIRMED");
  });

  it("annulation avant préparation (NEW) : aucune écriture de stock", async () => {
    const { ctx, product } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });
    await cancelOrderBeforePrep(ctx.organizationId, ctx.userId, order.id);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("1000");
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("CANCELLED_BEFORE_PREP");
  });

  it("annulation après préparation : ne restaure que les quantités déclarées récupérables", async () => {
    const { ctx, product } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "10", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);

    const productExit = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, orderId: order.id, articleVariantId: product.id, type: "ORDER_EXIT" },
    });

    // Only 6 of the 10 bottles are actually recoverable (4 were already unboxed).
    await cancelOrderAfterPrep(ctx.organizationId, ctx.userId, order.id, [
      { movementId: productExit.id, quantity: "6" },
    ]);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("996"); // 1000 - 10 + 6
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("CANCELLED_AFTER_PREP");
  });

  it("rejette une récupération supérieure à la sortie d'origine", async () => {
    const { ctx, product } = await setupOrderFixture();
    const order = await createOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      channel: "SITE",
      locationId: ctx.internal.id,
      placedAt: new Date(),
      lines: [{ articleVariantId: product.id, quantity: "2", unitPrice: "50" }],
    });
    await confirmOrder(ctx.organizationId, ctx.userId, order.id);
    const productExit = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, orderId: order.id, articleVariantId: product.id, type: "ORDER_EXIT" },
    });

    await expect(
      cancelOrderAfterPrep(ctx.organizationId, ctx.userId, order.id, [
        { movementId: productExit.id, quantity: "999" },
      ])
    ).rejects.toThrow(OrderError);
  });
});
