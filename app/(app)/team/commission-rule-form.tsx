"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createCommissionRuleAction, type FormState } from "./actions";
import type { CommissionRoleKind, PayeeType } from "@/app/generated/prisma/enums";

type UserOption = { id: string; name: string };
type AffiliateOption = { id: string; name: string };

const ROLES_FOR_PAYEE: Record<PayeeType, CommissionRoleKind[]> = {
  USER: ["CONFIRMATION", "DELIVERY", "FIXED_SALARY"],
  AFFILIATE: ["AFFILIATE_REFERRAL"],
};

export function CommissionRuleForm({
  users,
  affiliates,
}: {
  users: UserOption[];
  affiliates: AffiliateOption[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createCommissionRuleAction,
    undefined
  );
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const [payeeType, setPayeeType] = useState<PayeeType>("USER");
  const [roleKind, setRoleKind] = useState<CommissionRoleKind>("CONFIRMATION");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newCommissionRule")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("payeeType")}
          <select
            name="payeeType"
            value={payeeType}
            onChange={(e) => {
              const next = e.target.value as PayeeType;
              setPayeeType(next);
              setRoleKind(ROLES_FOR_PAYEE[next][0]);
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="USER">{t("payeeUser")}</option>
            <option value="AFFILIATE">{t("payeeAffiliate")}</option>
          </select>
        </label>

        {payeeType === "USER" ? (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("teamMember")}
            <select name="userId" required defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="" disabled>
                {tCommon("choose")}
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("affiliate")}
            <select name="affiliateId" required defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="" disabled>
                {tCommon("choose")}
              </option>
              {affiliates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("role")}
          <select
            name="roleKind"
            value={roleKind}
            onChange={(e) => setRoleKind(e.target.value as CommissionRoleKind)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {ROLES_FOR_PAYEE[payeeType].map((r) => (
              <option key={r} value={r}>
                {t(`roleKind.${r}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("rateTypeLabel")}
          <select name="rateType" defaultValue={roleKind === "FIXED_SALARY" ? "FIXED_PER_MONTH" : "FIXED_PER_ORDER"} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" key={roleKind}>
            {roleKind === "FIXED_SALARY" ? (
              <option value="FIXED_PER_MONTH">{t("rateType.FIXED_PER_MONTH")}</option>
            ) : (
              <>
                <option value="FIXED_PER_ORDER">{t("rateType.FIXED_PER_ORDER")}</option>
                <option value="PERCENT_OF_SUBTOTAL">{t("rateType.PERCENT_OF_SUBTOTAL")}</option>
              </>
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("rateValue")}
          <input name="rateValue" required inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("effectiveFrom")}
          <input
            type="date"
            name="effectiveFrom"
            required
            defaultValue={today}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        {state?.error && (
          <p className="col-span-full text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <div className="col-span-full">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {tCommon("create")}
          </button>
        </div>
      </form>
    </details>
  );
}
