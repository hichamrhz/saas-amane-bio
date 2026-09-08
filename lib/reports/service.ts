import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { getOnHandSummary } from "@/lib/inventory/stock";
import { sumExpenses, getAdSpendBreakdown } from "@/lib/expenses/service";
import type { AdSpendBreakdown } from "@/lib/expenses/service";

export type PeriodReport = {
  from: Date;
  to: Date;
  ordersPlaced: number;
  ordersConfirmed: number;
  ordersDelivered: number;
  /** null (never 0%) when there is nothing to divide by — cahier des
   * charges §17/test #27 explicitly requires no division by zero and no
   * cohort dressed up as more complete than it is. */
  confirmationRate: number | null;
  deliveryRate: number | null;
  revenue: string;
  cogs: string;
  /** Stock exit movements missing a unitCost are excluded from cogs rather
   * than treated as zero — this count says how many, so the UI can say so
   * honestly instead of silently under-reporting cost (test #27). */
  cogsMissingCostCount: number;
  commissions: string;
  expenses: string;
  netMargin: string;
  adSpend: AdSpendBreakdown;
  /** Total dépense publicitaire ÷ commandes livrées sur la période —
   * approximation du coût d'acquisition client, null (jamais 0) s'il n'y a
   * aucune commande livrée à diviser (§17, test #27). */
  cac: string | null;
};

export async function getPeriodReport(
  organizationId: string,
  from: Date,
  to: Date
): Promise<PeriodReport> {
  const placedOrders = await prisma.order.findMany({
    where: { organizationId, placedAt: { gte: from, lte: to } },
    select: { id: true },
  });
  const placedIds = placedOrders.map((o) => o.id);
  const ordersPlaced = placedIds.length;

  const [ordersConfirmed, ordersDelivered] = await Promise.all([
    placedIds.length === 0
      ? 0
      : prisma.orderEvent.count({ where: { orderId: { in: placedIds }, toStatus: "CONFIRMED" } }),
    placedIds.length === 0
      ? 0
      : prisma.orderEvent.count({ where: { orderId: { in: placedIds }, toStatus: "DELIVERED" } }),
  ]);

  const confirmationRate = ordersPlaced > 0 ? ordersConfirmed / ordersPlaced : null;
  const deliveryRate = ordersConfirmed > 0 ? ordersDelivered / ordersConfirmed : null;

  // Revenue and COGS are recognized at delivery, the same event that
  // triggers commission accrual (cahier des charges §11: "dues à la
  // livraison seulement") — kept consistent across the whole P&L.
  const deliveredOrders = await prisma.order.findMany({
    where: { organizationId, deliveredAt: { gte: from, lte: to } },
    select: { id: true, subtotalAmount: true, discountAmount: true },
  });
  const deliveredIds = deliveredOrders.map((o) => o.id);
  const revenue = deliveredOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.subtotalAmount.toString()).minus(o.discountAmount.toString())),
    new Decimal(0)
  );

  const exitMovements =
    deliveredIds.length === 0
      ? []
      : await prisma.stockMovement.findMany({
          where: { organizationId, type: "ORDER_EXIT", orderId: { in: deliveredIds } },
          select: { quantityDelta: true, unitCost: true },
        });
  let cogs = new Decimal(0);
  let cogsMissingCostCount = 0;
  for (const m of exitMovements) {
    if (m.unitCost === null) {
      cogsMissingCostCount++;
      continue;
    }
    cogs = cogs.plus(new Decimal(m.quantityDelta.toString()).abs().times(m.unitCost.toString()));
  }

  const [commissionsAgg, expensesSum, adSpend] = await Promise.all([
    prisma.commission.aggregate({ where: { organizationId, earnedAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    sumExpenses(organizationId, from, to),
    getAdSpendBreakdown(organizationId, from, to),
  ]);
  const commissions = new Decimal(commissionsAgg._sum.amount?.toString() ?? "0");
  const expenses = new Decimal(expensesSum);

  const netMargin = revenue.minus(cogs).minus(commissions).minus(expenses);

  // Same cohort as revenue/cogs above (deliveredAt within the period), so
  // ad spend dated within the period is compared against sales actually
  // closed within that same period.
  const cac =
    deliveredOrders.length > 0
      ? new Decimal(adSpend.totalSpend).dividedBy(deliveredOrders.length).toFixed(2)
      : null;

  return {
    from,
    to,
    ordersPlaced,
    ordersConfirmed,
    ordersDelivered,
    confirmationRate,
    deliveryRate,
    revenue: revenue.toString(),
    cogs: cogs.toString(),
    cogsMissingCostCount,
    commissions: commissions.toString(),
    expenses: expenses.toString(),
    netMargin: netMargin.toString(),
    adSpend,
    cac,
  };
}

export type LowStockRow = {
  variantId: string;
  sku: string;
  label: string;
  articleName: string;
  locationName: string;
  onHand: string;
  stockUnitLabel: string;
};

/** Threshold is a per-request input, not a persisted setting — no reorder
 * point exists anywhere in the schema yet, and inventing one silently
 * would be exactly the kind of fabricated precision §17 warns against. */
export async function getLowStockAlerts(
  organizationId: string,
  threshold: string
): Promise<LowStockRow[]> {
  const summary = await getOnHandSummary(organizationId);
  const thresholdDecimal = new Decimal(threshold);
  return summary
    .filter((row) => new Decimal(row.quantity).lessThan(thresholdDecimal))
    .map((row) => ({
      variantId: row.variant!.id,
      sku: row.variant!.sku,
      label: row.variant!.label,
      articleName: row.variant!.article.name,
      locationName: row.location!.name,
      onHand: row.quantity,
      stockUnitLabel: row.variant!.stockUnitLabel,
    }))
    .sort((a, b) => new Decimal(a.onHand).comparedTo(b.onHand));
}
