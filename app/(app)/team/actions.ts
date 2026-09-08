"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createAffiliate, archiveAffiliate, createCommissionRule, TeamError } from "@/lib/team/service";
import { requireString, parseDecimalInput } from "@/lib/numbers";
import type { CommissionRateType, CommissionRoleKind, PayeeType } from "@/app/generated/prisma/enums";

export type FormState = { error?: string } | undefined;

const TEAM_ROLES = ["OWNER", "FINANCE"] as const;

export async function createAffiliateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...TEAM_ROLES]);
  const name = requireString(formData.get("name"));
  if (!name) return { error: "Le nom de l'affilié est requis." };

  try {
    await createAffiliate({
      organizationId: session.organizationId,
      createdById: session.userId,
      name,
      phone: requireString(formData.get("phone")),
    });
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
  revalidatePath("/team");
  return undefined;
}

export async function archiveAffiliateAction(affiliateId: string) {
  const session = await requireRole([...TEAM_ROLES]);
  await archiveAffiliate(session.organizationId, affiliateId);
  revalidatePath("/team");
}

export async function createCommissionRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole([...TEAM_ROLES]);

  const payeeType = requireString(formData.get("payeeType")) as PayeeType | null;
  const roleKind = requireString(formData.get("roleKind")) as CommissionRoleKind | null;
  const rateType = requireString(formData.get("rateType")) as CommissionRateType | null;
  const rateValue = parseDecimalInput(formData.get("rateValue"));
  const effectiveFromRaw = requireString(formData.get("effectiveFrom"));

  if (!payeeType || !roleKind || !rateType || !rateValue || !effectiveFromRaw) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await createCommissionRule({
      organizationId: session.organizationId,
      createdById: session.userId,
      payeeType,
      userId: payeeType === "USER" ? requireString(formData.get("userId")) : null,
      affiliateId: payeeType === "AFFILIATE" ? requireString(formData.get("affiliateId")) : null,
      roleKind,
      rateType,
      rateValue,
      effectiveFrom: new Date(effectiveFromRaw),
    });
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
  revalidatePath("/team");
  return undefined;
}
