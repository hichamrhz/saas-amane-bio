import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export class ReturnError extends Error {}

/**
 * Declares a return case for a delivered/shipped order: a snapshot of what
 * is expected back, one line per original exit movement. No stock is
 * reintegrated at this point — declaring is not receiving (cahier des
 * charges §10).
 */
export async function declareReturn(input: {
  organizationId: string;
  userId: string;
  orderId: string;
  lines: { sourceMovementId: string; expectedQuantity: string }[];
  notes?: string | null;
}) {
  if (input.lines.length === 0) {
    throw new ReturnError("Un retour doit avoir au moins une ligne attendue.");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, organizationId: input.organizationId },
    });
    if (!order) throw new ReturnError("Commande introuvable.");
    if (!["DELIVERED", "SHIPPED", "CONFIRMED"].includes(order.status)) {
      throw new ReturnError(
        `Un retour ne peut être déclaré que pour une commande confirmée, expédiée ou livrée (statut actuel : ${order.status}).`
      );
    }

    for (const line of input.lines) {
      const movement = await tx.stockMovement.findFirst({
        where: { id: line.sourceMovementId, organizationId: input.organizationId, orderId: order.id, type: "ORDER_EXIT" },
      });
      if (!movement) {
        throw new ReturnError(`Mouvement de sortie introuvable pour cette commande : ${line.sourceMovementId}.`);
      }
      const originalQuantity = new Decimal(movement.quantityDelta.toString()).abs();
      if (new Decimal(line.expectedQuantity).greaterThan(originalQuantity)) {
        throw new ReturnError(
          `Quantité attendue (${line.expectedQuantity}) supérieure à la sortie d'origine (${originalQuantity.toString()}).`
        );
      }
    }

    const ret = await tx.return.create({
      data: {
        organizationId: input.organizationId,
        orderId: order.id,
        createdById: input.userId,
        notes: input.notes ?? null,
        expectedLines: {
          create: input.lines.map((l) => ({
            sourceMovementId: l.sourceMovementId,
            expectedQuantity: l.expectedQuantity,
          })),
        },
      },
      include: { expectedLines: true },
    });

    await tx.order.update({ where: { id: order.id }, data: { status: "RETURN_ANNOUNCED" } });
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "RETURN_ANNOUNCED", createdById: input.userId },
    });

    return ret;
  });
}

export type ReceiveReturnLineInput = {
  expectedLineId: string;
  receivedQuantity: string;
  healthyQuantity: string;
  damagedQuantity: string;
  notes?: string | null;
};

/**
 * Records one physical reception session for a return. The cumulative
 * received/healthy/damaged quantities are always derived by summing every
 * ReturnReceiptLine ever recorded for that expected line — never a mutated
 * counter — so a repeated partial reception can never double-reintegrate
 * stock (cahier des charges §10, test d'acceptation #15-16).
 */
export async function receiveReturnLines(input: {
  organizationId: string;
  userId: string;
  returnId: string;
  lines: ReceiveReturnLineInput[];
}) {
  if (input.lines.length === 0) {
    throw new ReturnError("Aucune ligne à réceptionner.");
  }

  return prisma.$transaction(async (tx) => {
    const ret = await tx.return.findFirst({
      where: { id: input.returnId, organizationId: input.organizationId },
      include: { expectedLines: { include: { sourceMovement: true, receiptLines: true } }, order: true },
    });
    if (!ret) throw new ReturnError("Retour introuvable.");

    let quarantineLocationId: string | null = null;

    for (const line of input.lines) {
      const expected = ret.expectedLines.find((e) => e.id === line.expectedLineId);
      if (!expected) throw new ReturnError(`Ligne attendue introuvable : ${line.expectedLineId}.`);

      const received = new Decimal(line.receivedQuantity);
      const healthy = new Decimal(line.healthyQuantity);
      const damaged = new Decimal(line.damagedQuantity);
      if (healthy.plus(damaged).greaterThan(received)) {
        throw new ReturnError("La somme sain + abîmé ne peut pas dépasser la quantité reçue.");
      }

      const alreadyReceived = expected.receiptLines.reduce(
        (sum, r) => sum.plus(r.receivedQuantity.toString()),
        new Decimal(0)
      );
      const remaining = new Decimal(expected.expectedQuantity.toString()).minus(alreadyReceived);
      if (received.greaterThan(remaining)) {
        throw new ReturnError(
          `Quantité reçue (${received.toString()}) supérieure au reliquat autorisé (${remaining.toString()}) pour cette ligne.`
        );
      }

      let healthyMovementId: string | null = null;
      let damagedMovementId: string | null = null;
      const originalUnitCost = expected.sourceMovement.unitCost;

      if (healthy.greaterThan(0)) {
        const movement = await tx.stockMovement.create({
          data: {
            organizationId: input.organizationId,
            articleVariantId: expected.sourceMovement.articleVariantId,
            locationId: ret.order.locationId,
            type: "RETURN_RECEPTION",
            quantityDelta: healthy.toString(),
            unitCost: originalUnitCost,
            referenceType: "Return",
            referenceId: ret.id,
            relatedMovementId: expected.sourceMovementId,
            eventDate: new Date(),
            createdById: input.userId,
            orderId: ret.orderId,
          },
        });
        healthyMovementId = movement.id;
      }

      if (damaged.greaterThan(0)) {
        if (!quarantineLocationId) {
          quarantineLocationId = await resolveQuarantineLocation(tx, input.organizationId);
        }
        const movement = await tx.stockMovement.create({
          data: {
            organizationId: input.organizationId,
            articleVariantId: expected.sourceMovement.articleVariantId,
            locationId: quarantineLocationId,
            type: "RETURN_RECEPTION",
            quantityDelta: damaged.toString(),
            unitCost: originalUnitCost,
            referenceType: "Return",
            referenceId: ret.id,
            relatedMovementId: expected.sourceMovementId,
            reasonCode: "DAMAGED",
            eventDate: new Date(),
            createdById: input.userId,
            orderId: ret.orderId,
          },
        });
        damagedMovementId = movement.id;
      }

      await tx.returnReceiptLine.create({
        data: {
          expectedLineId: expected.id,
          operatorId: input.userId,
          receivedQuantity: received.toString(),
          healthyQuantity: healthy.toString(),
          damagedQuantity: damaged.toString(),
          notes: line.notes ?? null,
          healthyMovementId,
          damagedMovementId,
        },
      });
    }

    const allComplete = await isReturnFullyReceived(tx, input.organizationId, ret.id);
    const newReturnStatus = allComplete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.return.update({ where: { id: ret.id }, data: { status: newReturnStatus } });

    if (ret.order.status !== "RETURN_RECEIVED") {
      await tx.order.update({ where: { id: ret.orderId }, data: { status: "RETURN_RECEIVED" } });
      await tx.orderEvent.create({
        data: {
          orderId: ret.orderId,
          fromStatus: ret.order.status,
          toStatus: "RETURN_RECEIVED",
          createdById: input.userId,
        },
      });
    }

    return tx.return.findUniqueOrThrow({
      where: { id: ret.id },
      include: { expectedLines: { include: { receiptLines: true } } },
    });
  });
}

async function isReturnFullyReceived(
  tx: Prisma.TransactionClient,
  organizationId: string,
  returnId: string
): Promise<boolean> {
  const expectedLines = await tx.returnExpectedLine.findMany({
    where: { returnId },
    include: { receiptLines: true },
  });
  return expectedLines.every((line) => {
    const received = line.receiptLines.reduce((sum, r) => sum.plus(r.receivedQuantity.toString()), new Decimal(0));
    return received.greaterThanOrEqualTo(line.expectedQuantity.toString());
  });
}

async function resolveQuarantineLocation(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  const location = await tx.location.findFirst({ where: { organizationId, kind: "QUARANTINE" } });
  if (!location) {
    throw new ReturnError(
      "Aucun emplacement de quarantaine configuré pour cette organisation. Créez-en un avant de réceptionner des articles abîmés."
    );
  }
  return location.id;
}

export async function listReturns(organizationId: string) {
  return prisma.return.findMany({
    where: { organizationId },
    include: {
      order: true,
      expectedLines: { include: { sourceMovement: { include: { articleVariant: { include: { article: true } } } }, receiptLines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getReturn(organizationId: string, returnId: string) {
  return prisma.return.findFirst({
    where: { id: returnId, organizationId },
    include: {
      order: true,
      expectedLines: {
        include: {
          sourceMovement: { include: { articleVariant: { include: { article: true } } } },
          receiptLines: { include: { operator: true } },
        },
      },
    },
  });
}
