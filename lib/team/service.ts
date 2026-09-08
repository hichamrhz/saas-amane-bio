import { prisma } from "@/lib/db/prisma";
import type {
  CommissionRateType,
  CommissionRoleKind,
  PayeeType,
} from "@/app/generated/prisma/enums";

export class TeamError extends Error {}

/**
 * "Team members" are existing app Users (they already carry an OrgRole for
 * permissions) — this phase does not add self-service account creation,
 * which stays a separate future item (see PROGRESS.md). This just lists
 * them so a commission rule can be attached to one.
 */
export async function listTeamMembers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function createAffiliate(input: {
  organizationId: string;
  createdById: string;
  name: string;
  phone?: string | null;
}) {
  if (!input.name.trim()) {
    throw new TeamError("Le nom de l'affilié est requis.");
  }
  return prisma.affiliate.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
    },
  });
}

export async function listAffiliates(organizationId: string) {
  return prisma.affiliate.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function archiveAffiliate(organizationId: string, affiliateId: string) {
  await prisma.affiliate.updateMany({
    where: { id: affiliateId, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export type CreateCommissionRuleInput = {
  organizationId: string;
  createdById: string;
  payeeType: PayeeType;
  userId?: string | null;
  affiliateId?: string | null;
  roleKind: CommissionRoleKind;
  rateType: CommissionRateType;
  rateValue: string;
  effectiveFrom: Date;
};

const ROLE_RATE_TYPES: Record<CommissionRoleKind, CommissionRateType[]> = {
  CONFIRMATION: ["FIXED_PER_ORDER", "PERCENT_OF_SUBTOTAL"],
  DELIVERY: ["FIXED_PER_ORDER", "PERCENT_OF_SUBTOTAL"],
  AFFILIATE_REFERRAL: ["FIXED_PER_ORDER", "PERCENT_OF_SUBTOTAL"],
  FIXED_SALARY: ["FIXED_PER_MONTH"],
};

/** A new rule is simply a new dated row (mirrors RecipeVersion): it never
 * edits or deletes a past rule, so commissions already accrued keep
 * pointing at the exact rule that produced them (cahier des charges §13 —
 * "tarif daté", changing a rate never rewrites history). */
export async function createCommissionRule(input: CreateCommissionRuleInput) {
  if (input.payeeType === "USER" && !input.userId) {
    throw new TeamError("Un utilisateur est requis pour ce type de bénéficiaire.");
  }
  if (input.payeeType === "AFFILIATE" && !input.affiliateId) {
    throw new TeamError("Un affilié est requis pour ce type de bénéficiaire.");
  }
  if (input.roleKind === "AFFILIATE_REFERRAL" && input.payeeType !== "AFFILIATE") {
    throw new TeamError("Le rôle « apport d'affilié » doit cibler un affilié.");
  }
  if (input.roleKind !== "AFFILIATE_REFERRAL" && input.payeeType === "AFFILIATE") {
    throw new TeamError("Un affilié ne peut avoir que le rôle « apport d'affilié ».");
  }
  if (!ROLE_RATE_TYPES[input.roleKind].includes(input.rateType)) {
    throw new TeamError("Ce type de tarif ne correspond pas à ce rôle.");
  }
  if (Number(input.rateValue) <= 0) {
    throw new TeamError("Le tarif doit être supérieur à zéro.");
  }

  if (input.userId) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId },
    });
    if (!user) throw new TeamError("Utilisateur invalide.");
  }
  if (input.affiliateId) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { id: input.affiliateId, organizationId: input.organizationId },
    });
    if (!affiliate) throw new TeamError("Affilié invalide.");
  }

  return prisma.commissionRule.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      payeeType: input.payeeType,
      userId: input.userId ?? null,
      affiliateId: input.affiliateId ?? null,
      roleKind: input.roleKind,
      rateType: input.rateType,
      rateValue: input.rateValue,
      effectiveFrom: input.effectiveFrom,
    },
  });
}

export async function listCommissionRules(organizationId: string) {
  return prisma.commissionRule.findMany({
    where: { organizationId },
    include: { user: true, affiliate: true },
    orderBy: [{ effectiveFrom: "desc" }],
  });
}
