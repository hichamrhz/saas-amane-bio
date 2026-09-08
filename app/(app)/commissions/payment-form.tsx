"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordPaymentAction, type FormState } from "./actions";
import type { PayeeType } from "@/app/generated/prisma/enums";

type UserOption = { id: string; name: string };
type AffiliateOption = { id: string; name: string };

export function PaymentForm({
  users,
  affiliates,
}: {
  users: UserOption[];
  affiliates: AffiliateOption[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    recordPaymentAction,
    undefined
  );
  const t = useTranslations("team");
  const tCommissions = useTranslations("commissions");
  const tCommon = useTranslations("common");
  const [payeeType, setPayeeType] = useState<PayeeType>("USER");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {tCommissions("newPayment")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("payeeType")}
          <select
            name="payeeType"
            value={payeeType}
            onChange={(e) => setPayeeType(e.target.value as PayeeType)}
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
          {tCommissions("amount")} (MAD)
          <input name="amount" required inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tCommissions("paidAt")}
          <input
            type="date"
            name="paidAt"
            required
            defaultValue={today}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="col-span-full flex flex-col gap-1 text-sm text-neutral-700">
          {tCommon("notes")}
          <input name="notes" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
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
            {tCommon("save")}
          </button>
        </div>
      </form>
    </details>
  );
}
