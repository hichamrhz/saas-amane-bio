import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { lockStockRow } from "@/lib/inventory/lock";
import { getOnHandAtInTx } from "@/lib/inventory/stock";
import { computeWeightedAverageCost } from "@/lib/inventory/valuation";
import { resolvePackagingRecipe, computePackagingConsumption, RecipeResolutionError } from "@/lib/recipes/engine";
import { generateOrderNumber } from "./numbering";
import type { Prisma } from "@/app/generated/prisma/client";
import type { OrderChannel, MarketingSource, OrderStatus } from "@/app/generated/prisma/enums";

export type OrderErrorCode =
  | "INVALID_LINES"
  | "INVALID_LOCATION"
  | "DUPLICATE_ORDER_NUMBER"
  | "INVALID_TRANSITION"
  | "INSUFFICIENT_STOCK"
  | "RECIPE_UNRESOLVED";

export class OrderError extends Error {
  code: OrderErrorCode;
  details?: Record<string, string>;
  constructor(code: OrderErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type CreateOrderInput = {
  organizationId: string;
  userId: string;
  orderNumber?: string | null;
  externalRef?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  channel: OrderChannel;
  marketingSource?: MarketingSource;
  carrierId?: string | null;
  locationId: string;
  withSalt?: boolean;
  skipStockImpact?: boolean;
  placedAt: Date;
  discountAmount?: string;
  deliveryFeeAmount?: string;
  codAmount?: string | null; // if omitted, computed as subtotal - discount + deliveryFee
  notes?: string | null;
  clientRequestId?: string | null;
  lines: { articleVariantId: string; quantity: string; unitPrice: string; discount?: string }[];
};

export async function createOrder(input: CreateOrderInput) {
  if (input.lines.length === 0) {
    throw new OrderError("INVALID_LINES", "Une commande doit avoir au moins un article.");
  }
  for (const line of input.lines) {
    if (new Decimal(line.quantity).lessThanOrEqualTo(0)) {
      throw new OrderError("INVALID_LINES", "Les quantités doivent être supérieures à zéro.");
    }
  }

  if (input.clientRequestId) {
    const existing = await prisma.order.findUnique({
      where: {
        organizationId_clientRequestId: {
          organizationId: input.organizationId,
          clientRequestId: input.clientRequestId,
        },
      },
      include: { lines: true },
    });
    if (existing) return existing;
  }

  const subtotal = input.lines.reduce((sum, line) => {
    const lineTotal = new Decimal(line.unitPrice)
      .times(line.quantity)
      .minus(line.discount ?? "0");
    return sum.plus(lineTotal);
  }, new Decimal(0));

  const discountAmount = new Decimal(input.discountAmount ?? "0");
  const deliveryFeeAmount = new Decimal(input.deliveryFeeAmount ?? "0");
  const codAmount = input.codAmount
    ? new Decimal(input.codAmount)
    : subtotal.minus(discountAmount).plus(deliveryFeeAmount);

  const orderNumber = input.orderNumber?.trim() || generateOrderNumber(input.placedAt);

  try {
    return await prisma.order.create({
      data: {
        organizationId: input.organizationId,
        orderNumber,
        externalRef: input.externalRef ?? null,
        customerId: input.customerId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        channel: input.channel,
        marketingSource: input.marketingSource ?? "UNKNOWN",
        carrierId: input.carrierId ?? null,
        locationId: input.locationId,
        withSalt: input.withSalt ?? true,
        skipStockImpact: input.skipStockImpact ?? false,
        placedAt: input.placedAt,
        subtotalAmount: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        deliveryFeeAmount: deliveryFeeAmount.toString(),
        codAmount: codAmount.toString(),
        notes: input.notes ?? null,
        clientRequestId: input.clientRequestId ?? null,
        createdById: input.userId,
        lines: {
          create: input.lines.map((line) => ({
            articleVariantId: line.articleVariantId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount ?? "0",
          })),
        },
        events: {
          create: { toStatus: "NEW", createdById: input.userId },
        },
      },
      include: { lines: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (input.clientRequestId) {
        const existing = await prisma.order.findUnique({
          where: {
            organizationId_clientRequestId: {
              organizationId: input.organizationId,
              clientRequestId: input.clientRequestId,
            },
          },
          include: { lines: true },
        });
        if (existing) return existing;
      }
      throw new OrderError(
        "DUPLICATE_ORDER_NUMBER",
        `Le numéro de commande "${orderNumber}" existe déjà dans cette organisation.`
      );
    }
    throw error;
  }
}

/**
 * The atomic core of the order lifecycle (cahier des charges §8): on the
 * first NEW -> CONFIRMED transition, deducts every sold product and the
 * resolved packaging recipe in a single transaction. Either everything
 * exits, or nothing does. A repeat call on an already-confirmed order is a
 * no-op (idempotent against double clicks and retries — test #8).
 */
export async function confirmOrder(organizationId: string, userId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, organizationId, orderId);

    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId },
      include: { lines: { include: { articleVariant: { include: { article: true } } } } },
    });
    if (!order) throw new OrderError("INVALID_TRANSITION", "Commande introuvable.");

    if (order.status !== "NEW") {
      // Already confirmed (or beyond) — idempotent no-op, never a second exit.
      return order;
    }

    const confirmedAt = new Date();
    const totalBottles = order.lines.reduce((sum, l) => sum.plus(l.quantity.toString()), new Decimal(0));
    if (totalBottles.lessThanOrEqualTo(0)) {
      throw new OrderError("INVALID_LINES", "La commande n'a aucune quantité à sortir.");
    }
    const totalBottlesNumber = totalBottles.toNumber();

    let packagingLines: { articleVariantId: string; quantity: string; recipeVersionId: string }[] = [];

    if (!order.skipStockImpact) {
      try {
        const { recipe, version } = await resolvePackagingRecipe(
          tx,
          organizationId,
          totalBottlesNumber,
          confirmedAt
        );
        packagingLines = computePackagingConsumption(recipe, version, totalBottlesNumber, order.withSalt);
      } catch (error) {
        if (error instanceof RecipeResolutionError) {
          throw new OrderError("RECIPE_UNRESOLVED", error.message);
        }
        throw error;
      }

      // Lock every stock row this confirmation will touch, in one stable
      // global order, so two orders confirmed concurrently can never
      // deadlock against each other.
      const rowsToLock = Array.from(
        new Set([...order.lines.map((l) => l.articleVariantId), ...packagingLines.map((p) => p.articleVariantId)])
      ).sort((a, b) => a.localeCompare(b));
      for (const articleVariantId of rowsToLock) {
        await lockStockRow(tx, organizationId, articleVariantId, order.locationId);
      }

      // Phase A: check everything before writing anything.
      for (const line of order.lines) {
        const available = await getOnHandAtInTx(tx, organizationId, line.articleVariantId, order.locationId);
        if (available.lessThan(line.quantity.toString())) {
          throw new OrderError(
            "INSUFFICIENT_STOCK",
            `Stock insuffisant pour ${line.articleVariant.article.name} : ${available.toString()} disponibles, ${line.quantity.toString()} requises.`,
            { available: available.toString(), required: line.quantity.toString() }
          );
        }
      }
      for (const pkg of packagingLines) {
        const available = await getOnHandAtInTx(tx, organizationId, pkg.articleVariantId, order.locationId);
        if (available.lessThan(pkg.quantity)) {
          const variant = await tx.articleVariant.findUnique({
            where: { id: pkg.articleVariantId },
            include: { article: true },
          });
          throw new OrderError(
            "INSUFFICIENT_STOCK",
            `Stock d'emballage insuffisant pour ${variant?.article.name ?? pkg.articleVariantId} : ${available.toString()} disponibles, ${pkg.quantity} requises.`,
            { available: available.toString(), required: pkg.quantity }
          );
        }
      }

      // Phase B: write every exit.
      for (const line of order.lines) {
        const unitCost = await computeWeightedAverageCost(tx, organizationId, line.articleVariantId);
        await tx.stockMovement.create({
          data: {
            organizationId,
            articleVariantId: line.articleVariantId,
            locationId: order.locationId,
            type: "ORDER_EXIT",
            quantityDelta: new Decimal(line.quantity.toString()).negated().toString(),
            unitCost: unitCost.toString(),
            referenceType: "Order",
            referenceId: order.id,
            eventDate: confirmedAt,
            createdById: userId,
            orderId: order.id,
          },
        });
      }
      for (const pkg of packagingLines) {
        const unitCost = await computeWeightedAverageCost(tx, organizationId, pkg.articleVariantId);
        await tx.stockMovement.create({
          data: {
            organizationId,
            articleVariantId: pkg.articleVariantId,
            locationId: order.locationId,
            type: "ORDER_EXIT",
            quantityDelta: new Decimal(pkg.quantity).negated().toString(),
            unitCost: unitCost.toString(),
            referenceType: "Order",
            referenceId: order.id,
            recipeVersionId: pkg.recipeVersionId,
            eventDate: confirmedAt,
            createdById: userId,
            orderId: order.id,
          },
        });
      }
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED", confirmedAt },
      include: { lines: true },
    });
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus: "NEW", toStatus: "CONFIRMED", createdById: userId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: "order.confirm",
        entityType: "Order",
        entityId: order.id,
        after: { totalBottles: totalBottlesNumber, packagingLines: packagingLines.length },
      },
    });

    return updated;
  });
}

export async function shipOrder(
  organizationId: string,
  userId: string,
  orderId: string,
  input: { carrierId?: string | null; trackingNumber?: string | null }
) {
  return transitionOrder(organizationId, userId, orderId, ["CONFIRMED"], "SHIPPED", async (tx, order) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "SHIPPED",
        shippedAt: new Date(),
        carrierId: input.carrierId ?? order.carrierId,
        trackingNumber: input.trackingNumber ?? order.trackingNumber,
      },
    });
  });
}

export async function deliverOrder(organizationId: string, userId: string, orderId: string) {
  return transitionOrder(organizationId, userId, orderId, ["CONFIRMED", "SHIPPED"], "DELIVERED", async (tx, order) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  });
}

export async function cancelOrderBeforePrep(organizationId: string, userId: string, orderId: string, notes?: string) {
  return transitionOrder(organizationId, userId, orderId, ["NEW"], "CANCELLED_BEFORE_PREP", async (tx, order) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED_BEFORE_PREP", cancelledAt: new Date() },
    });
  }, notes);
}

/**
 * Cancellation after preparation is a corrective operation, never a blanket
 * restore (cahier des charges §8): the caller explicitly lists which
 * already-deducted movements are really recoverable, and in what quantity.
 * Everything else stays consumed.
 */
export async function cancelOrderAfterPrep(
  organizationId: string,
  userId: string,
  orderId: string,
  recoveries: { movementId: string; quantity: string }[],
  notes?: string
) {
  return transitionOrder(
    organizationId,
    userId,
    orderId,
    ["CONFIRMED", "SHIPPED"],
    "CANCELLED_AFTER_PREP",
    async (tx, order) => {
      for (const recovery of recoveries) {
        const quantity = new Decimal(recovery.quantity);
        if (quantity.lessThanOrEqualTo(0)) continue;

        const movement = await tx.stockMovement.findFirst({
          where: { id: recovery.movementId, organizationId, orderId: order.id, type: "ORDER_EXIT" },
        });
        if (!movement) {
          throw new OrderError("INVALID_LINES", `Mouvement de sortie introuvable : ${recovery.movementId}.`);
        }
        const originalQuantity = new Decimal(movement.quantityDelta.toString()).abs();
        if (quantity.greaterThan(originalQuantity)) {
          throw new OrderError(
            "INVALID_LINES",
            `Quantité récupérable (${quantity.toString()}) supérieure à la sortie d'origine (${originalQuantity.toString()}).`
          );
        }

        await tx.stockMovement.create({
          data: {
            organizationId,
            articleVariantId: movement.articleVariantId,
            locationId: movement.locationId,
            type: "CORRECTION",
            quantityDelta: quantity.toString(),
            unitCost: movement.unitCost,
            referenceType: "Order",
            referenceId: order.id,
            relatedMovementId: movement.id,
            reasonCode: "CANCELLED_AFTER_PREP_RECOVERY",
            eventDate: new Date(),
            createdById: userId,
            orderId: order.id,
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED_AFTER_PREP", cancelledAt: new Date() },
      });
    },
    notes
  );
}

async function transitionOrder(
  organizationId: string,
  userId: string,
  orderId: string,
  allowedFrom: OrderStatus[],
  toStatus: OrderStatus,
  apply: (tx: Prisma.TransactionClient, order: Prisma.OrderGetPayload<object>) => Promise<void>,
  notes?: string
) {
  return prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, organizationId, orderId);
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) throw new OrderError("INVALID_TRANSITION", "Commande introuvable.");

    if (order.status === toStatus) return order; // idempotent no-op
    if (!allowedFrom.includes(order.status)) {
      throw new OrderError(
        "INVALID_TRANSITION",
        `Transition invalide : ${order.status} → ${toStatus}.`
      );
    }

    const fromStatus = order.status;
    await apply(tx, order);
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus, toStatus, createdById: userId, notes: notes ?? null },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: `order.transition.${toStatus.toLowerCase()}`,
        entityType: "Order",
        entityId: order.id,
        before: { status: fromStatus },
        after: { status: toStatus },
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

async function lockOrderRow(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${organizationId}:${orderId}`}))`;
}

export async function listOrders(organizationId: string, statuses?: OrderStatus[]) {
  return prisma.order.findMany({
    where: { organizationId, ...(statuses ? { status: { in: statuses } } : {}) },
    include: { lines: { include: { articleVariant: { include: { article: true } } } }, customer: true, carrier: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOrder(organizationId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      lines: { include: { articleVariant: { include: { article: true } } } },
      events: { orderBy: { occurredAt: "asc" }, include: { createdBy: true } },
      customer: true,
      carrier: true,
      location: true,
      stockMovements: { include: { articleVariant: { include: { article: true } } } },
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
