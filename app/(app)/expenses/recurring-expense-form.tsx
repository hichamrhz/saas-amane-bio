"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { generateRecurringExpenseAction, type FormState } from "./actions";
import type { ExpenseCategory } from "@/app/generated/prisma/enums";

export function RecurringExpenseForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    generateRecurringExpenseAction,
    undefined
  );
  const t = useTranslations("expenses");
  const tCommon = useTranslations("common");
  const [category, setCategory] = useState<ExpenseCategory>("OTHER");
  const now = new Date();

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newRecurring")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("category")}
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="ADVERTISING">{t("categoryAdvertising")}</option>
            <option value="OTHER">{t("categoryOther")}</option>
          </select>
        </label>
        {category === "ADVERTISING" && (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("platform")}
            <select name="platform" defaultValue="FACEBOOK" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="FACEBOOK">Facebook</option>
              <option value="TIKTOK">TikTok</option>
              <option value="GOOGLE">Google</option>
              <option value="OTHER">{tCommon("other")}</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("label")}
          <input name="label" required placeholder={t("recurrenceKeyPlaceholder")} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("recurrenceKey")}
          <input name="recurrenceKey" required placeholder="abonnement-canva" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("amount")} (MAD)
          <input name="amount" required inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("month")}
          <input
            name="month"
            type="number"
            min={1}
            max={12}
            required
            defaultValue={now.getMonth() + 1}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("year")}
          <input
            name="year"
            type="number"
            required
            defaultValue={now.getFullYear()}
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
            {t("generate")}
          </button>
        </div>
      </form>
    </details>
  );
}
