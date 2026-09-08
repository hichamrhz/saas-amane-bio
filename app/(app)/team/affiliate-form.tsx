"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createAffiliateAction, type FormState } from "./actions";

export function AffiliateForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createAffiliateAction,
    undefined
  );
  const t = useTranslations("team");
  const tSuppliers = useTranslations("suppliers");
  const tCommon = useTranslations("common");

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newAffiliate")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tSuppliers("name")}
          <input name="name" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tSuppliers("phone")}
          <input name="phone" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
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
