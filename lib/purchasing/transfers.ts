import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { lockStockRow } from "@/lib/inventory/lock";

export class TransferError extends Error {}

export async function listCooperativeTransfers(organizationId: string) {
  return prisma.cooperativeTransfer.findMany({
    where: { organizationId },
    include: {
      articleVariant: { include: { article: true } },
      fromLocation: true,
      toLocation: true,
      createdBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export type CreateCooperativeTransferInput = {
  organizationId: string;
  userId: string;
  articleVariantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: string;
  eventDate: Date;
  notes?: string | null;
  clientRequestId?: string | null;
};

/**
 * Moves stock between two locations without changing the total quantity or
 * triggering any consumption — a transfer is a relocation, never a sale or
 * a use (see ARCHITECTURE.md §4).
 */
export async function createCooperativeTransfer(input: CreateCooperativeTransferInput) {
  if (input.fromLocationId === input.toLocationId) {
    throw new TransferError("L'emplacement source et destination doivent être différents.");
  }
  const quantity = new Decimal(input.quantity);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new TransferError("La quantité doit être supérieure à zéro.");
  }

  if (input.clientRequestId) {
    const existing = await prisma.cooperativeTransfer.findUnique({
      where: {
        organizationId_clientRequestId: {
          organizationId: input.organizationId,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (existing) return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await lockStockRow(tx, input.organizationId, input.articleVariantId, input.fromLocationId);

      const [fromLocation, toLocation] = await Promise.all([
        tx.location.findFirst({ where: { id: input.fromLocationId, organizationId: input.organizationId } }),
        tx.location.findFirst({ where: { id: input.toLocationId, organizationId: input.organizationId } }),
      ]);
      if (!fromLocation || !toLocation) {
        throw new TransferError("Emplacement source ou destination invalide.");
      }

      const availableResult = await tx.stockMovement.aggregate({
        where: {
          organizationId: input.organizationId,
          articleVariantId: input.articleVariantId,
          locationId: input.fromLocationId,
        },
        _sum: { quantityDelta: true },
      });
      const available = new Decimal(availableResult._sum.quantityDelta?.toString() ?? "0");
      if (available.lessThan(quantity)) {
        throw new TransferError(
          `Stock insuffisant à l'emplacement source : ${available.toString()} disponibles, ${quantity.toString()} requises.`
        );
      }

      const transfer = await tx.cooperativeTransfer.create({
        data: {
          organizationId: input.organizationId,
          articleVariantId: input.articleVariantId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          quantity: input.quantity,
          eventDate: input.eventDate,
          notes: input.notes ?? null,
          clientRequestId: input.clientRequestId ?? null,
          createdById: input.userId,
        },
      });

      const outMovement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          articleVariantId: input.articleVariantId,
          locationId: input.fromLocationId,
          type: "COOPERATIVE_TRANSFER_OUT",
          quantityDelta: quantity.negated().toString(),
          referenceType: "CooperativeTransfer",
          referenceId: transfer.id,
          eventDate: input.eventDate,
          createdById: input.userId,
          cooperativeTransferId: transfer.id,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          articleVariantId: input.articleVariantId,
          locationId: input.toLocationId,
          type: "COOPERATIVE_TRANSFER_IN",
          quantityDelta: quantity.toString(),
          referenceType: "CooperativeTransfer",
          referenceId: transfer.id,
          relatedMovementId: outMovement.id,
          eventDate: input.eventDate,
          createdById: input.userId,
          cooperativeTransferId: transfer.id,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: "cooperative_transfer.create",
          entityType: "CooperativeTransfer",
          entityId: transfer.id,
          after: { articleVariantId: input.articleVariantId, quantity: input.quantity },
        },
      });

      return transfer;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002" &&
      input.clientRequestId
    ) {
      const existing = await prisma.cooperativeTransfer.findUnique({
        where: {
          organizationId_clientRequestId: {
            organizationId: input.organizationId,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      if (existing) return existing;
    }
    throw error;
  }
}
