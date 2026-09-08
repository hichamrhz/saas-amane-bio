"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createConsumableVariantAction, type FormState } from "./actions";

const CONSUMABLE_TYPES = [
  "LABEL",
  "CARTON",
  "BUBBLE_WRAP",
  "TAPE",
  "SALT",
  "SALT_SACHET",
  "CARD",
  "NOTICE",
  "GIFT",
  "OTHER",
] as const;

export function PackagingForm({
  productVariants,
}: {
  productVariants: { id: string; sku: string; label: string; articleName: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createConsumableVariantAction,
    undefined
  );
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {t("newConsumable")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("consumableType")}
          <select
            name="consumableType"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue="LABEL"
          >
            {CONSUMABLE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`consumableTypeLabel.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <Field name="articleName" label={tCommon("name")} required placeholder="Étiquette Vinaigre de figue" />
        <Field name="sku" label={t("sku")} required placeholder="ETQ-VIN-FIGUE-500" />
        <Field name="label" label={t("label")} required placeholder="500ml" />
        <Field name="purchaseUnitLabel" label={t("purchaseUnit")} placeholder="rouleau" />
        <Field name="stockUnitLabel" label={t("stockUnit")} placeholder="m" />
        <Field
          name="purchaseToStockFactor"
          label={t("purchaseToStockFactor")}
          placeholder="100"
        />
        <Field name="widthCm" label={t("widthCmOptional")} placeholder="120" />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="isIntegerStock" defaultChecked />
          {t("integerOnlyHint")}
        </label>
        <label className="col-span-full flex flex-col gap-1 text-sm text-neutral-700">
          {t("linkedProduct")}
          <select
            name="productVariantId"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">{tCommon("none")}</option>
            {productVariants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.articleName} · {p.label} ({p.sku})
              </option>
            ))}
          </select>
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
