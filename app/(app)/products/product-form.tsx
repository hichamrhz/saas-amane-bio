"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createProductVariantAction, type FormState } from "./actions";

export function ProductForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createProductVariantAction,
    undefined
  );
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newProductVariant")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="articleName" label={t("productName")} required placeholder="Vinaigre de figue" />
        <Field name="category" label={t("category")} placeholder="Vinaigres" />
        <Field name="sku" label={t("sku")} required placeholder="VIN-FIGUE-500" />
        <Field name="label" label={t("label")} required placeholder="500ml" />
        <Field name="purchaseUnitLabel" label={t("purchaseUnit")} placeholder="unité" />
        <Field name="stockUnitLabel" label={t("stockUnit")} placeholder="unité" />
        <Field
          name="purchaseToStockFactor"
          label={t("purchaseToStockFactor")}
          placeholder="1"
        />
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

function Field({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-700">
      {label}
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
    </label>
  );
}
