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

  return prisma.expense.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      category: input.category,
      platform: input.category === "ADVERTISING" ? (input.platform ?? null) : null,
      label: input.label?.trim() || null,
      amount: input.amount,
      eventDate: input.eventDate,
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
