import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import type { AdPlatform, ExpenseCategory } from "@/app/generated/prisma/enums";

export class ExpenseError extends Error {}

export type CreateExpenseInput = {
  organizationId: string;
  createdById: string;
  category: ExpenseCategory;
  platform?: AdPlatform | null;
  label?: string | null;
  amount: string;
  eventDate: Date;
  leads?: number | null;
  articleId?: string | null;
  notes?: string | null;
};

export async function createExpense(input: CreateExpenseInput) {
  if (Number(input.amount) <= 0) {
    throw new ExpenseError("Le montant doit être supérieur à zéro.");
  }
  if (input.category === "ADVERTISING" && !input.platform) {
    throw new ExpenseError("La plateforme est requise pour une dépense publicitaire.");
  }
  if (input.category === "OTHER" && !input.label?.trim()) {
    throw new ExpenseError("Un libellé est requis pour une autre dépense.");
  }
  if (input.leads !== null && input.leads !== undefined && input.leads < 0) {
    throw new ExpenseError("Le nombre de leads ne peut pas être négatif.");
  }

  const articleId = input.category === "ADVERTISING" ? (input.articleId ?? null) : null;
  if (articleId) {
    const article = await prisma.article.findFirst({
      where: { id: articleId, organizationId: input.organizationId },
    });
    if (!article) throw new ExpenseError("Produit invalide.");
  }

  return prisma.expense.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      category: input.category,
      platform: input.category === "ADVERTISING" ? (input.platform ?? null) : null,
      label: input.label?.trim() || null,
      amount: input.amount,
      eventDate: input.eventDate,
      leads: input.category === "ADVERTISING" ? (input.leads ?? null) : null,
      articleId,
      notes: input.notes ?? null,
    },
  });
}

export type RecurringExpenseInput = {
  organizationId: string;
  createdById: string;
  category: ExpenseCategory;
  platform?: AdPlatform | null;
  label: string;
  amount: string;
  recurrenceKey: string;
  year: number;
  month: number; // 1-12
  notes?: string | null;
};

/** One charge per (recurrenceKey, year, month), guarded by a database
 * unique constraint rather than an application check, so it holds under
 * concurrent calls too — same idempotent-generation pattern as the fixed
 * monthly salary (cahier des charges §14, "charges récurrentes idempotentes"). */
export async function generateRecurringExpense(input: RecurringExpenseInput) {
  if (Number(input.amount) <= 0) {
    throw new ExpenseError("Le montant doit être supérieur à zéro.");
  }
  if (!input.recurrenceKey.trim()) {
    throw new ExpenseError("Une clé de récurrence est requise.");
  }

  try {
    return await prisma.expense.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.createdById,
        category: input.category,
        platform: input.category === "ADVERTISING" ? (input.platform ?? null) : null,
        label: input.label.trim(),
        amount: input.amount,
        eventDate: new Date(Date.UTC(input.year, input.month - 1, 1)),
        recurrenceKey: input.recurrenceKey.trim(),
        periodYear: input.year,
        periodMonth: input.month,
        notes: input.notes ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ExpenseError(
        `La charge « ${input.recurrenceKey} » a déjà été générée pour ${input.month}/${input.year}.`
      );
    }
    throw error;
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

export async function listExpenses(organizationId: string) {
  return prisma.expense.findMany({
    where: { organizationId },
    include: { article: { select: { id: true, name: true } } },
    orderBy: { eventDate: "desc" },
    take: 100,
  });
}

export async function sumExpenses(organizationId: string, from: Date, to: Date): Promise<string> {
  const result = await prisma.expense.aggregate({
    where: { organizationId, eventDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return (result._sum.amount ?? 0).toString();
}

export type AdSpendRow = {
  key: string;
  label: string;
  spend: string;
  leads: number;
  /** null (never 0) when there are no leads to divide by — same honesty
   * rule as the funnel rates in getPeriodReport (§17, test #27). */
  cpl: string | null;
};

export type AdSpendBreakdown = {
  totalSpend: string;
  totalLeads: number;
  totalCpl: string | null;
  byPlatform: AdSpendRow[];
  byProduct: AdSpendRow[];
};

/** Aggregates advertising expenses over a period into the same Spend /
 * Leads / Cost-per-lead breakdown the media-buying spreadsheet tracked by
 * hand, split by platform and by promoted product (§14). CPL is always
 * derived here, never persisted. */
export async function getAdSpendBreakdown(
  organizationId: string,
  from: Date,
  to: Date
): Promise<AdSpendBreakdown> {
  const rows = await prisma.expense.findMany({
    where: { organizationId, category: "ADVERTISING", eventDate: { gte: from, lte: to } },
    select: {
      platform: true,
      amount: true,
      leads: true,
      articleId: true,
      article: { select: { name: true } },
    },
  });

  const byPlatform = new Map<string, { spend: Decimal; leads: number }>();
  const byProduct = new Map<string, { label: string; spend: Decimal; leads: number }>();
  let totalSpend = new Decimal(0);
  let totalLeads = 0;

  for (const row of rows) {
    const amount = new Decimal(row.amount.toString());
    const leads = row.leads ?? 0;
    totalSpend = totalSpend.plus(amount);
    totalLeads += leads;

    const platformKey = row.platform ?? "OTHER";
    const platformEntry = byPlatform.get(platformKey) ?? { spend: new Decimal(0), leads: 0 };
    platformEntry.spend = platformEntry.spend.plus(amount);
    platformEntry.leads += leads;
    byPlatform.set(platformKey, platformEntry);

    if (row.articleId) {
      const productEntry = byProduct.get(row.articleId) ?? {
        label: row.article?.name ?? row.articleId,
        spend: new Decimal(0),
        leads: 0,
      };
      productEntry.spend = productEntry.spend.plus(amount);
      productEntry.leads += leads;
      byProduct.set(row.articleId, productEntry);
    }
  }

  const toRow = (key: string, label: string, spend: Decimal, leads: number): AdSpendRow => ({
    key,
    label,
    spend: spend.toString(),
    leads,
    cpl: leads > 0 ? spend.dividedBy(leads).toFixed(2) : null,
  });

  return {
    totalSpend: totalSpend.toString(),
    totalLeads,
    totalCpl: totalLeads > 0 ? totalSpend.dividedBy(totalLeads).toFixed(2) : null,
    byPlatform: [...byPlatform.entries()]
      .map(([key, v]) => toRow(key, key, v.spend, v.leads))
      .sort((a, b) => Number(b.spend) - Number(a.spend)),
    byProduct: [...byProduct.entries()]
      .map(([key, v]) => toRow(key, v.label, v.spend, v.leads))
      .sort((a, b) => Number(b.spend) - Number(a.spend)),
  };
}
