"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { recordPayment, generateMonthlyFixedSalary, CommissionError } from "@/lib/commissions/service";
import { requireString, parseDecimalInput } from "@/lib/numbers";
import type { PayeeType } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const COMMISSION_ROLES = ["OWNER", "FINANCE"] as const;

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...COMMISSION_ROLES]);

  const payeeType = requireString(formData.get("payeeType")) as PayeeType | null;
  const amount = parseDecimalInput(formData.get("amount"));
  const paidAtRaw = requireString(formData.get("paidAt"));
  if (!payeeType || !amount || !paidAtRaw) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await recordPayment({
      organizationId: session.organizationId,
      createdById: session.userId,
      payeeType,
      userId: payeeType === "USER" ? requireString(formData.get("userId")) : null,
      affiliateId: payeeType === "AFFILIATE" ? requireString(formData.get("affiliateId")) : null,
      amount,
      paidAt: new Date(paidAtRaw),
      notes: requireString(formData.get("notes")),
      clientRequestId: requireString(formData.get("clientRequestId")),
    });
  } catch (error) {
    if (error instanceof CommissionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/commissions");
  return undefined;
}

export async function generateFixedSalaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...COMMISSION_ROLES]);

  const userId = requireString(formData.get("userId"));
  const year = Number(requireString(formData.get("year")));
  const month = Number(requireString(formData.get("month")));
  if (!userId || !year || !month) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await generateMonthlyFixedSalary({ organizationId: session.organizationId, userId, year, month });
  } catch (error) {
    if (error instanceof CommissionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/commissions");
  return undefined;
}
