"use client";

import { useActionState } from "react";
import { createRecipeAction, type FormState } from "./actions";

const MODE_LABELS: Record<string, string> = {
  PER_BOTTLE: "Par bouteille",
  PER_PACKAGE: "Par colis",
  PER_ORDER: "Par commande",
};

export function RecipeForm({
  consumables,
}: {
  consumables: { id: string; sku: string; label: string; articleName: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(createRecipeAction, undefined);

  return (
    <details className="rounded-lg border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">+ Nouvelle recette d&apos;emballage</summary>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Nom
            <input name="name" required placeholder="1 à 5 bouteilles" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Min. bouteilles
            <input name="minBottles" required inputMode="numeric" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Max. bouteilles
            <input name="maxBottles" required inputMode="numeric" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Bouteilles par colis (facultatif)
            <input name="bottlesPerPackage" inputMode="numeric" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-700">Composants d&apos;emballage (jusqu&apos;à 6)</p>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                name={`component-${i}-articleVariantId`}
                defaultValue=""
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">— Aucun —</option>
                {consumables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.articleName} · {c.label} ({c.sku})
                  </option>
                ))}
              </select>
              <select
                name={`component-${i}-mode`}
                defaultValue="PER_ORDER"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                name={`component-${i}-quantityPerUnit`}
                placeholder="Quantité"
                inputMode="decimal"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        {state?.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <div>
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
