"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createExpense, generateRecurringExpense, ExpenseError } from "@/lib/expenses/service";
import { requireString, parseDecimalInput } from "@/lib/numbers";
import type { AdPlatform, ExpenseCategory } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const EXPENSE_ROLES = ["OWNER", "FINANCE"] as const;

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...EXPENSE_ROLES]);

  const category = requireString(formData.get("category")) as ExpenseCategory | null;
  const amount = parseDecimalInput(formData.get("amount"));
  const eventDateRaw = requireString(formData.get("eventDate"));
  if (!category || !amount || !eventDateRaw) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await createExpense({
      organizationId: session.organizationId,
      createdById: session.userId,
      category,
      platform: requireString(formData.get("platform")) as AdPlatform | null,
      label: requireString(formData.get("label")),
      amount,
      eventDate: new Date(eventDateRaw),
      notes: requireString(formData.get("notes")),
    });
  } catch (error) {
    if (error instanceof ExpenseError) return { error: error.message };
    throw error;
  }
  revalidatePath("/expenses");
  return undefined;
}

export async function generateRecurringExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...EXPENSE_ROLES]);

  const category = requireString(formData.get("category")) as ExpenseCategory | null;
  const label = requireString(formData.get("label"));
  const amount = parseDecimalInput(formData.get("amount"));
  const recurrenceKey = requireString(formData.get("recurrenceKey"));
  const year = Number(requireString(formData.get("year")));
  const month = Number(requireString(formData.get("month")));
  if (!category || !label || !amount || !recurrenceKey || !year || !month) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await generateRecurringExpense({
      organizationId: session.organizationId,
      createdById: session.userId,
      category,
      platform: requireString(formData.get("platform")) as AdPlatform | null,
      label,
      amount,
      recurrenceKey,
      year,
      month,
    });
  } catch (error) {
    if (error instanceof ExpenseError) return { error: error.message };
    throw error;
  }
  revalidatePath("/expenses");
  return undefined;
}
