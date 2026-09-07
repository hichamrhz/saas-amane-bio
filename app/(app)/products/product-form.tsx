"use client";

import { useActionState } from "react";
import { createProductVariantAction, type FormState } from "./actions";

export function ProductForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createProductVariantAction,
    undefined
  );

  return (
    <details className="rounded-lg border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + Nouvelle variante de produit
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="articleName" label="Nom du produit" required placeholder="Vinaigre de figue" />
        <Field name="category" label="Famille" placeholder="Vinaigres" />
        <Field name="sku" label="SKU" required placeholder="VIN-FIGUE-500" />
        <Field name="label" label="Format" required placeholder="500ml" />
        <Field name="purchaseUnitLabel" label="Unité d'achat" placeholder="unité" />
        <Field name="stockUnitLabel" label="Unité de stock" placeholder="unité" />
        <Field
          name="purchaseToStockFactor"
          label="1 unité d'achat = X unités de stock"
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
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Créer
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
