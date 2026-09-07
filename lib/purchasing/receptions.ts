import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { lockStockRow } from "@/lib/inventory/lock";
import { computeWeightedAverageCost } from "@/lib/inventory/valuation";
import type { Prisma } from "@/app/generated/prisma/client";
import type { ReceptionKind } from "@/app/generated/prisma/enums";

export type ReceptionErrorCode =
  | "INVALID_LOCATION"
  | "INVALID_QUANTITY"
  | "NO_LABEL_MAPPING"
  | "AMBIGUOUS_LABEL_MAPPING"
  | "INSUFFICIENT_LABELS";

export class ReceptionError extends Error {
  code: ReceptionErrorCode;
  details?: Record<string, string>;
  constructor(code: ReceptionErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type CreateReceptionLineInput = {
  articleVariantId: string;
  quantity: string; // validated decimal string
  unitCost: string; // validated decimal string
  lotNumber?: string | null;
  expirationDate?: Date | null;
};

export type CreateReceptionInput = {
  organizationId: string;
  userId: string;
  kind: ReceptionKind;
  locationId: string;
  cooperativeLocationId?: string | null;
  costIncludesLabel: boolean;
  reference?: string | null;
  eventDate: Date;
  freightCost?: string;
  notes?: string | null;
  clientRequestId?: string | null;
  lines: CreateReceptionLineInput[];
};

/**
 * Records a reception and, when it is a COOPERATIVE_PRODUCT reception,
 * atomically consumes the matching label stock at the cooperative location.
 * Either the whole reception (product stock in + label stock out on every
 * line) is written, or nothing is — see ARCHITECTURE.md §4.
 */
export async function createReception(input: CreateReceptionInput) {
  if (input.clientRequestId) {
    const existing = await prisma.reception.findUnique({
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

  if (input.lines.length === 0) {
    throw new ReceptionError("INVALID_QUANTITY", "Aucune ligne à réceptionner.");
  }

  for (const line of input.lines) {
    if (new Decimal(line.quantity).lessThanOrEqualTo(0)) {
      throw new ReceptionError("INVALID_QUANTITY", "La quantité doit être supérieure à zéro.");
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: input.organizationId },
      });
      if (!location) throw new ReceptionError("INVALID_LOCATION", "Emplacement de destination invalide.");

      if (input.kind === "COOPERATIVE_PRODUCT") {
        if (!input.cooperativeLocationId) {
          throw new ReceptionError(
            "INVALID_LOCATION",
            "L'emplacement coopérative (source des étiquettes) est requis."
          );
        }
        const coopLocation = await tx.location.findFirst({
          where: { id: input.cooperativeLocationId, organizationId: input.organizationId },
        });
        if (!coopLocation) {
          throw new ReceptionError("INVALID_LOCATION", "Emplacement coopérative invalide.");
        }
      }

      const reception = await tx.reception.create({
        data: {
          organizationId: input.organizationId,
          kind: input.kind,
          locationId: input.locationId,
          cooperativeLocationId: input.cooperativeLocationId ?? null,
          costIncludesLabel: input.costIncludesLabel,
          reference: input.reference ?? null,
          eventDate: input.eventDate,
          freightCost: input.freightCost ?? "0",
          notes: input.notes ?? null,
          clientRequestId: input.clientRequestId ?? null,
          createdById: input.userId,
        },
      });

      // Resolve label mappings up front and lock in a stable order (sorted
      // by label variant id) so two concurrent multi-line receptions can
      // never deadlock against each other.
      const labelMappingByLine = new Map<number, { labelVariantId: string }>();
      if (input.kind === "COOPERATIVE_PRODUCT") {
        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i];
          const variant = await tx.articleVariant.findFirst({
            where: { id: line.articleVariantId, organizationId: input.organizationId },
            include: { article: true },
          });
          if (!variant) throw new ReceptionError("INVALID_QUANTITY", "Produit introuvable.");
          if (variant.article.kind !== "PRODUCT") continue;

          const labelVariants = await tx.articleVariant.findMany({
            where: {
              organizationId: input.organizationId,
              productVariantId: line.articleVariantId,
              article: { consumableType: "LABEL" },
            },
          });
          if (labelVariants.length === 0) {
            throw new ReceptionError(
              "NO_LABEL_MAPPING",
              `Aucune étiquette associée au produit (variante ${line.articleVariantId}).`
            );
          }
          if (labelVariants.length > 1) {
            throw new ReceptionError(
              "AMBIGUOUS_LABEL_MAPPING",
              `Plusieurs étiquettes sont associées au produit (variante ${line.articleVariantId}).`
            );
          }
          labelMappingByLine.set(i, { labelVariantId: labelVariants[0].id });
        }

        const lockOrder = [...labelMappingByLine.values()]
          .map((m) => m.labelVariantId)
          .sort((a, b) => a.localeCompare(b));
        for (const labelVariantId of lockOrder) {
          await lockStockRow(tx, input.organizationId, labelVariantId, input.cooperativeLocationId!);
        }
      }

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const quantity = new Decimal(line.quantity);

        let lotId: string | null = null;
        if (line.lotNumber) {
          const lot = await tx.lot.upsert({
            where: {
              organizationId_articleVariantId_lotNumber: {
                organizationId: input.organizationId,
                articleVariantId: line.articleVariantId,
                lotNumber: line.lotNumber,
              },
            },
            update: {},
            create: {
              organizationId: input.organizationId,
              articleVariantId: line.articleVariantId,
              lotNumber: line.lotNumber,
              expirationDate: line.expirationDate ?? null,
            },
          });
          lotId = lot.id;
        }

        await tx.receptionLine.create({
          data: {
            receptionId: reception.id,
            articleVariantId: line.articleVariantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lotId,
            expirationDate: line.expirationDate ?? null,
          },
        });

        const mapping = labelMappingByLine.get(i);
        if (mapping) {
          const available = await getOnHandInTx(
            tx,
            input.organizationId,
            mapping.labelVariantId,
            input.cooperativeLocationId!
          );
          if (available.lessThan(quantity)) {
            const labelVariant = await tx.articleVariant.findUnique({
              where: { id: mapping.labelVariantId },
              include: { article: true },
            });
            throw new ReceptionError(
              "INSUFFICIENT_LABELS",
              `Étiquettes insuffisantes pour ${labelVariant?.article.name ?? mapping.labelVariantId}: ${available.toString()} disponibles, ${quantity.toString()} requises.`,
              {
                available: available.toString(),
                required: quantity.toString(),
                label: labelVariant?.article.name ?? "",
              }
            );
          }

          const avgLabelCost = await computeWeightedAverageCost(
            tx,
            input.organizationId,
            mapping.labelVariantId
          );
          const enteredUnitCost = new Decimal(line.unitCost);
          const fullyLoadedUnitCost = input.costIncludesLabel
            ? enteredUnitCost
            : enteredUnitCost.plus(avgLabelCost);

          const productMovement = await tx.stockMovement.create({
            data: {
              organizationId: input.organizationId,
              articleVariantId: line.articleVariantId,
              locationId: input.locationId,
              lotId,
              type: "COOPERATIVE_RECEPTION",
              quantityDelta: line.quantity,
              unitCost: fullyLoadedUnitCost.toString(),
              referenceType: "Reception",
              referenceId: reception.id,
              eventDate: input.eventDate,
              createdById: input.userId,
              receptionId: reception.id,
            },
          });

          await tx.stockMovement.create({
            data: {
              organizationId: input.organizationId,
              articleVariantId: mapping.labelVariantId,
              locationId: input.cooperativeLocationId!,
              type: "LABEL_CONSUMPTION",
              quantityDelta: quantity.negated().toString(),
              unitCost: avgLabelCost.toString(),
              referenceType: "Reception",
              referenceId: reception.id,
              relatedMovementId: productMovement.id,
              eventDate: input.eventDate,
              createdById: input.userId,
              receptionId: reception.id,
            },
          });
        } else {
          const movementType =
            input.kind === "OPENING_STOCK"
              ? "OPENING"
              : input.kind === "SUPPLIER_PURCHASE"
                ? "PURCHASE_RECEPTION"
                : "COOPERATIVE_RECEPTION";
          await tx.stockMovement.create({
            data: {
              organizationId: input.organizationId,
              articleVariantId: line.articleVariantId,
              locationId: input.locationId,
              lotId,
              type: movementType,
              quantityDelta: line.quantity,
              unitCost: line.unitCost,
              referenceType: "Reception",
              referenceId: reception.id,
              eventDate: input.eventDate,
              createdById: input.userId,
              receptionId: reception.id,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: "reception.create",
          entityType: "Reception",
          entityId: reception.id,
          after: { kind: input.kind, lineCount: input.lines.length },
        },
      });

      return tx.reception.findUniqueOrThrow({
        where: { id: reception.id },
        include: { lines: true },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002" &&
      input.clientRequestId
    ) {
      const existing = await prisma.reception.findUnique({
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
    throw error;
  }
}

export async function listReceptions(organizationId: string, kinds?: ReceptionKind[]) {
  return prisma.reception.findMany({
    where: { organizationId, ...(kinds ? { kind: { in: kinds } } : {}) },
    include: {
      lines: { include: { articleVariant: { include: { article: true } } } },
      location: true,
      cooperativeLocation: true,
      createdBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function getOnHandInTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  articleVariantId: string,
  locationId: string
): Promise<Decimal> {
  const result = await tx.stockMovement.aggregate({
    where: { organizationId, articleVariantId, locationId },
    _sum: { quantityDelta: true },
  });
  return new Decimal(result._sum.quantityDelta?.toString() ?? "0");
}
