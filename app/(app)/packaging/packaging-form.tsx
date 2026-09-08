"use client";

import { useActionState } from "react";
import { createConsumableVariantAction, type FormState } from "./actions";

const CONSUMABLE_TYPE_LABELS: Record<string, string> = {
  LABEL: "Étiquette",
  CARTON: "Carton",
  BUBBLE_WRAP: "Papier bulle",
  TAPE: "Ruban adhésif",
  SALT: "Sel",
  SALT_SACHET: "Sachet de sel",
  CARD: "Carte",
  NOTICE: "Notice",
  GIFT: "Cadeau",
  OTHER: "Autre",
};

export function PackagingForm({
  productVariants,
}: {
  productVariants: { id: string; sku: string; label: string; articleName: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createConsumableVariantAction,
    undefined
  );

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + Nouveau consommable
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Type de consommable
          <select
            name="consumableType"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue="LABEL"
          >
            {Object.entries(CONSUMABLE_TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <Field name="articleName" label="Nom" required placeholder="Étiquette Vinaigre de figue" />
        <Field name="sku" label="SKU" required placeholder="ETQ-VIN-FIGUE-500" />
        <Field name="label" label="Format" required placeholder="500ml" />
        <Field name="purchaseUnitLabel" label="Unité d'achat" placeholder="rouleau" />
        <Field name="stockUnitLabel" label="Unité de stock" placeholder="m" />
        <Field
          name="purchaseToStockFactor"
          label="1 unité d'achat = X unités de stock"
          placeholder="100"
        />
        <Field name="widthCm" label="Largeur (cm), si applicable" placeholder="120" />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="isIntegerStock" defaultChecked />
          Quantités entières uniquement (bouteilles, cartons, sachets…)
        </label>
        <label className="col-span-full flex flex-col gap-1 text-sm text-neutral-700">
          Produit associé (uniquement pour une étiquette)
          <select
            name="productVariantId"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">— Aucun —</option>
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
