import Decimal from "decimal.js";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Perpetual weighted-average cost, derived purely from the immutable
 * movement ledger (never a separately mutated running total, so it can't
 * drift from the audit trail). Every inbound movement contributes its own
 * unitCost; every outbound movement removes quantity at the average cost
 * that was in effect at that point in the ledger.
 *
 * Movements are walked in insertion order (createdAt, then id), i.e. the
 * order operations were actually recorded — NOT the business event date.
 * Backdated ("antidated") operations that should retroactively change a
 * historical average are an explicit, documented limitation of this
 * session (see PROGRESS.md) and are never silently recomputed.
 */
export async function computeWeightedAverageCost(
  tx: Prisma.TransactionClient,
  organizationId: string,
  articleVariantId: string
): Promise<Decimal> {
  const movements = await tx.stockMovement.findMany({
    where: { organizationId, articleVariantId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { quantityDelta: true, unitCost: true },
  });

  let qty = new Decimal(0);
  let value = new Decimal(0);

  for (const movement of movements) {
    const delta = new Decimal(movement.quantityDelta.toString());
    if (delta.greaterThan(0)) {
      const cost = movement.unitCost ? new Decimal(movement.unitCost.toString()) : new Decimal(0);
      value = value.plus(delta.times(cost));
      qty = qty.plus(delta);
    } else if (delta.lessThan(0)) {
      const outQty = delta.abs();
      if (qty.greaterThan(0)) {
        const avg = value.dividedBy(qty);
        value = value.minus(avg.times(outQty));
      }
      qty = qty.minus(outQty);
    }
  }

  if (qty.lessThanOrEqualTo(0)) return new Decimal(0);
  return value.dividedBy(qty);
}
