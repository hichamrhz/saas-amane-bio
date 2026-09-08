"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createExpenseAction, type FormState } from "./actions";
import type { ExpenseCategory } from "@/app/generated/prisma/enums";

type ProductOption = { id: string; name: string };

export function ExpenseForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createExpenseAction,
    undefined
  );
  const t = useTranslations("expenses");
  const tCommon = useTranslations("common");
  const [category, setCategory] = useState<ExpenseCategory>("ADVERTISING");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newExpense")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        {category === "ADVERTISING" ? (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("platform")}
            <select name="platform" defaultValue="FACEBOOK" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="FACEBOOK">Facebook</option>
              <option value="TIKTOK">TikTok</option>
              <option value="GOOGLE">Google</option>
              <option value="OTHER">{tCommon("other")}</option>
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("label")}
            <input name="label" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("amount")} (MAD)
          <input name="amount" required inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>

        {category === "ADVERTISING" && (
          <>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              {t("leads")}
              <input name="leads" type="number" min={0} step={1} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              {t("product")}
              <select name="articleId" defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="">{t("productNone")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("eventDate")}
          <input
            type="date"
            name="eventDate"
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
            {tCommon("create")}
          </button>
        </div>
      </form>
    </details>
  );
}
