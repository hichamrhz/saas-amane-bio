import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createOrder, confirmOrder, deliverOrder } from "@/lib/orders/service";
import { declareReturn, receiveReturnLines, ReturnError } from "@/lib/returns/service";
import { getOnHandAt } from "@/lib/inventory/stock";
import {
  createTestContext,
  createProductVariant,
  createConsumableVariant,
  createTestRecipe,
  seedOpeningStock,
} from "./helpers/fixtures";

async function setupDeliveredOrder(quantity: string) {
  const ctx = await createTestContext();
  const product = await createProductVariant(ctx.organizationId, {
    name: "Vinaigre retour",
    sku: `RET-${randomUUID().slice(0, 6)}`,
  });
  const carton = await createConsumableVariant(ctx.organizationId, {
    name: "Carton retour",
    sku: `RETC-${randomUUID().slice(0, 6)}`,
    consumableType: "CARTON",
  });
  await createTestRecipe({
    organizationId: ctx.organizationId,
    name: "Standard",
    minBottles: 1,
    maxBottles: 9999,
    components: [{ articleVariantId: carton.id, mode: "PER_ORDER", quantityPerUnit: "1" }],
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

  const order = await createOrder({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    channel: "SITE",
    locationId: ctx.internal.id,
    placedAt: new Date(),
    lines: [{ articleVariantId: product.id, quantity, unitPrice: "50" }],
  });
  await confirmOrder(ctx.organizationId, ctx.userId, order.id);
  await deliverOrder(ctx.organizationId, ctx.userId, order.id);

  const productExit = await prisma.stockMovement.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, orderId: order.id, articleVariantId: product.id, type: "ORDER_EXIT" },
  });

  return { ctx, product, order, productExit };
}

describe("retours (cahier des charges §10, tests d'acceptation #15-16)", () => {
  it("3 sorties, 2 saines reçues : +2 en stock, 1 en écart ouvert", async () => {
    const { ctx, product, order, productExit } = await setupDeliveredOrder("3");

    const ret = await declareReturn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      orderId: order.id,
      lines: [{ sourceMovementId: productExit.id, expectedQuantity: "3" }],
    });

    const receipt = await receiveReturnLines({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnId: ret.id,
      lines: [
        {
          expectedLineId: ret.expectedLines[0].id,
          receivedQuantity: "2",
          healthyQuantity: "2",
          damagedQuantity: "0",
        },
      ],
    });

    expect(receipt.status).toBe("PARTIALLY_RECEIVED");

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("999"); // 1000 - 3 + 2

    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe("RETURN_RECEIVED");
  });

  it("réception partielle répétée : pas de double réintégration au-delà du reliquat", async () => {
    const { ctx, product, order, productExit } = await setupDeliveredOrder("5");
    await prisma.location.create({
      data: { organizationId: ctx.organizationId, name: "Quarantaine", kind: "QUARANTINE" },
    });
    const ret = await declareReturn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      orderId: order.id,
      lines: [{ sourceMovementId: productExit.id, expectedQuantity: "5" }],
    });
    const expectedLineId = ret.expectedLines[0].id;

    // First partial reception: 2 healthy.
    await receiveReturnLines({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnId: ret.id,
      lines: [{ expectedLineId, receivedQuantity: "2", healthyQuantity: "2", damagedQuantity: "0" }],
    });
    // Second partial reception: 3 more (2 healthy, 1 damaged) — completes the expected 5.
    const final = await receiveReturnLines({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnId: ret.id,
      lines: [{ expectedLineId, receivedQuantity: "3", healthyQuantity: "2", damagedQuantity: "1" }],
    });
    expect(final.status).toBe("RECEIVED");

    // Attempting to receive more than the remaining 0 must fail — no double reintegration.
    await expect(
      receiveReturnLines({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        returnId: ret.id,
        lines: [{ expectedLineId, receivedQuantity: "1", healthyQuantity: "1", damagedQuantity: "0" }],
      })
    ).rejects.toThrow(ReturnError);

    const productStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    expect(productStock.toString()).toBe("999"); // 1000 - 5 + (2 + 2) healthy = 999, unaffected by the rejected attempt
  });

  it("un produit abîmé va en quarantaine, jamais au stock vendable", async () => {
    const { ctx, product, order, productExit } = await setupDeliveredOrder("2");
    const quarantine = await prisma.location.upsert({
      where: { organizationId_name: { organizationId: ctx.organizationId, name: "Quarantaine" } },
      update: {},
      create: { organizationId: ctx.organizationId, name: "Quarantaine", kind: "QUARANTINE" },
    });

    const ret = await declareReturn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      orderId: order.id,
      lines: [{ sourceMovementId: productExit.id, expectedQuantity: "2" }],
    });
    await receiveReturnLines({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnId: ret.id,
      lines: [
        { expectedLineId: ret.expectedLines[0].id, receivedQuantity: "2", healthyQuantity: "0", damagedQuantity: "2" },
      ],
    });

    const sellableStock = await getOnHandAt(ctx.organizationId, product.id, ctx.internal.id);
    const quarantineStock = await getOnHandAt(ctx.organizationId, product.id, quarantine.id);
    expect(sellableStock.toString()).toBe("998"); // unchanged by the damaged reception (1000 - 2)
    expect(quarantineStock.toString()).toBe("2");
  });
});
