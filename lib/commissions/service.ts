import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import type { CommissionRoleKind, PayeeType } from "@/app/generated/prisma/enums";

export class CommissionError extends Error {}

type Payee = { payeeType: PayeeType; userId?: string | null; affiliateId?: string | null };

/** Commission.payeeId must never be null (see schema comment) — this is
 * the one place that derives it from whichever of userId/affiliateId the
 * payee actually carries. */
function payeeId(payee: Payee): string {
  const id = payee.payeeType === "USER" ? payee.userId : payee.affiliateId;
  if (!id) throw new CommissionError("Bénéficiaire de commission invalide.");
  return id;
}

/** Latest rule in effect at `referenceDate` for this exact payee+role — the
 * same "latest version at or before the date" resolution as recipes,
 * applied to people instead of packaging (cahier des charges §13, test
 * d'acceptation #18 : "tarif daté"). No rule found is not an error: not
 * every role/person combination has to have a configured rate. */
async function resolveCommissionRule(
  tx: Prisma.TransactionClient,
  organizationId: string,
  payee: Payee,
  roleKind: CommissionRoleKind,
  referenceDate: Date
) {
  return tx.commissionRule.findFirst({
    where: {
      organizationId,
      payeeType: payee.payeeType,
      userId: payee.userId ?? null,
      affiliateId: payee.affiliateId ?? null,
      roleKind,
      effectiveFrom: { lte: referenceDate },
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

function computeAmount(rateType: string, rateValue: Decimal.Value, subtotal: Decimal.Value): Decimal {
  if (rateType === "PERCENT_OF_SUBTOTAL") {
    return new Decimal(subtotal).times(rateValue).dividedBy(100);
  }
  return new Decimal(rateValue);
}

async function accrueOne(
  tx: Prisma.TransactionClient,
  organizationId: string,
  order: { id: string; placedAt: Date; subtotalAmount: Decimal.Value },
  payee: Payee,
  roleKind: CommissionRoleKind
) {
  const rule = await resolveCommissionRule(tx, organizationId, payee, roleKind, order.placedAt);
  if (!rule) return;

  const amount = computeAmount(rule.rateType, rule.rateValue.toString(), order.subtotalAmount);
  if (amount.lessThanOrEqualTo(0)) return;

  try {
    await tx.commission.create({
      data: {
        organizationId,
        payeeType: payee.payeeType,
        payeeId: payeeId(payee),
        userId: payee.userId ?? null,
        affiliateId: payee.affiliateId ?? null,
        roleKind,
        orderId: order.id,
        commissionRuleId: rule.id,
        amount: amount.toString(),
        earnedAt: new Date(),
      },
    });
  } catch (error) {
    // Unique constraint on (orderId, payeeId, roleKind) —
    // already accrued (defense in depth; deliverOrder's own transition
    // guard already makes this path unreachable on a normal retry).
    if (!isUniqueConstraintError(error)) throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Called from within the same transaction that marks an order DELIVERED
 * (lib/orders/service.ts, deliverOrder). Commissions are due at delivery
 * only — never at confirmation or shipping (test d'acceptation #17) — and
 * every eligible role accrues independently, so the same person confirming
 * *and* delivering the same order is credited for both (cumul de rôles,
 * test #18), and an affiliate referral on the order accrues alongside the
 * internal team commissions (test #19).
 */
export async function accrueCommissionsForDeliveredOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  order: {
    id: string;
    placedAt: Date;
    subtotalAmount: Decimal.Value;
    affiliateId: string | null;
  },
  deliveredByUserId: string
) {
  const confirmEvent = await tx.orderEvent.findFirst({
    where: { orderId: order.id, toStatus: "CONFIRMED" },
    orderBy: { occurredAt: "asc" },
  });

  if (confirmEvent) {
    await accrueOne(
      tx,
      organizationId,
      order,
      { payeeType: "USER", userId: confirmEvent.createdById },
      "CONFIRMATION"
    );
  }

  await accrueOne(
    tx,
    organizationId,
    order,
    { payeeType: "USER", userId: deliveredByUserId },
    "DELIVERY"
  );

  if (order.affiliateId) {
    await accrueOne(
      tx,
      organizationId,
      order,
      { payeeType: "AFFILIATE", affiliateId: order.affiliateId },
      "AFFILIATE_REFERRAL"
    );
  }
}

/** One fixed-salary charge per person per calendar month, however many
 * times generation is requested (test d'acceptation #21) — guarded by the
 * unique index on (organizationId, userId, roleKind, periodYear,
 * periodMonth), not by an application-level check, so it holds even under
 * concurrent calls. */
export async function generateMonthlyFixedSalary(input: {
  organizationId: string;
  userId: string;
  year: number;
  month: number; // 1-12
}) {
  const rule = await prisma.commissionRule.findFirst({
    where: {
      organizationId: input.organizationId,
      payeeType: "USER",
      userId: input.userId,
      roleKind: "FIXED_SALARY",
      effectiveFrom: { lte: new Date(Date.UTC(input.year, input.month - 1, 1)) },
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rule) {
    throw new CommissionError("Aucun fixe mensuel configuré pour cette personne à cette date.");
  }

  try {
    return await prisma.commission.create({
      data: {
        organizationId: input.organizationId,
        payeeType: "USER",
        payeeId: input.userId,
        userId: input.userId,
        roleKind: "FIXED_SALARY",
        commissionRuleId: rule.id,
        amount: rule.rateValue,
        periodYear: input.year,
        periodMonth: input.month,
        earnedAt: new Date(Date.UTC(input.year, input.month - 1, 1)),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CommissionError(
        `Le fixe de ${input.month}/${input.year} a déjà été généré pour cette personne.`
      );
    }
    throw error;
  }
}

export type PayeeBalance = {
  payeeType: PayeeType;
  userId: string | null;
  affiliateId: string | null;
  name: string;
  earned: string;
  paid: string;
  balance: string;
};

/** Balance is always derived by summing two independent immutable ledgers
 * — never a mutated counter — so recording a partial payment can never
 * inflate what was earned (test d'acceptation #20 : 80×5=400 dus, 300
 * payés, solde 100, le dû reste 400, jamais 700). */
export async function listBalances(organizationId: string): Promise<PayeeBalance[]> {
  const [users, affiliates, commissions, payments] = await Promise.all([
    prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.affiliate.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.commission.findMany({ where: { organizationId } }),
    prisma.payment.findMany({ where: { organizationId } }),
  ]);

  const balances = new Map<string, PayeeBalance>();
  const keyFor = (payeeType: PayeeType, userId: string | null, affiliateId: string | null) =>
    `${payeeType}:${userId ?? ""}:${affiliateId ?? ""}`;

  for (const u of users) {
    balances.set(keyFor("USER", u.id, null), {
      payeeType: "USER",
      userId: u.id,
      affiliateId: null,
      name: u.name,
      earned: "0",
      paid: "0",
      balance: "0",
    });
  }
  for (const a of affiliates) {
    balances.set(keyFor("AFFILIATE", null, a.id), {
      payeeType: "AFFILIATE",
      userId: null,
      affiliateId: a.id,
      name: a.name,
      earned: "0",
      paid: "0",
      balance: "0",
    });
  }

  for (const c of commissions) {
    const key = keyFor(c.payeeType, c.userId, c.affiliateId);
    const entry = balances.get(key);
    if (!entry) continue;
    entry.earned = new Decimal(entry.earned).plus(c.amount.toString()).toString();
  }
  for (const p of payments) {
    const key = keyFor(p.payeeType, p.userId, p.affiliateId);
    const entry = balances.get(key);
    if (!entry) continue;
    entry.paid = new Decimal(entry.paid).plus(p.amount.toString()).toString();
  }
  for (const entry of balances.values()) {
    entry.balance = new Decimal(entry.earned).minus(entry.paid).toString();
  }

  return [...balances.values()].filter(
    (b) => new Decimal(b.earned).greaterThan(0) || new Decimal(b.paid).greaterThan(0)
  );
}

export async function recordPayment(input: {
  organizationId: string;
  createdById: string;
  payeeType: PayeeType;
  userId?: string | null;
  affiliateId?: string | null;
  amount: string;
  paidAt: Date;
  notes?: string | null;
  clientRequestId?: string | null;
}) {
  if (input.payeeType === "USER" && !input.userId) {
    throw new CommissionError("Un utilisateur est requis pour ce versement.");
  }
  if (input.payeeType === "AFFILIATE" && !input.affiliateId) {
    throw new CommissionError("Un affilié est requis pour ce versement.");
  }
  if (new Decimal(input.amount).lessThanOrEqualTo(0)) {
    throw new CommissionError("Le montant du versement doit être supérieur à zéro.");
  }

  if (input.clientRequestId) {
    const existing = await prisma.payment.findUnique({
      where: {
        organizationId_clientRequestId: {
          organizationId: input.organizationId,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (existing) return existing;
  }

  if (input.userId) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId },
    });
    if (!user) throw new CommissionError("Utilisateur invalide.");
  }
  if (input.affiliateId) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { id: input.affiliateId, organizationId: input.organizationId },
    });
    if (!affiliate) throw new CommissionError("Affilié invalide.");
  }

  return prisma.payment.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      payeeType: input.payeeType,
      userId: input.userId ?? null,
      affiliateId: input.affiliateId ?? null,
      amount: input.amount,
      paidAt: input.paidAt,
      notes: input.notes ?? null,
      clientRequestId: input.clientRequestId ?? null,
    },
  });
}

export async function listPayments(organizationId: string) {
  return prisma.payment.findMany({
    where: { organizationId },
    include: { user: true, affiliate: true },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
}

export async function listCommissions(organizationId: string) {
  return prisma.commission.findMany({
    where: { organizationId },
    include: { user: true, affiliate: true, order: true },
    orderBy: { earnedAt: "desc" },
    take: 100,
  });
}
