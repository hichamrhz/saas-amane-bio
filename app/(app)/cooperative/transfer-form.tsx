"use client";

import { useActionState } from "react";
import { createTransferAction, type FormState } from "./actions";

type ArticleOption = { id: string; sku: string; label: string; articleName: string };
type LocationOption = { id: string; name: string };

export function TransferForm({
  articles,
  locations,
}: {
  articles: ArticleOption[];
  locations: LocationOption[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createTransferAction,
    undefined
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4" open>
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + Nouveau transfert
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Étiquette / consommable
          <select
            name="articleVariantId"
            required
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              — Choisir —
            </option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.articleName} · {a.label} ({a.sku})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Quantité
          <input
            name="quantity"
            required
            inputMode="decimal"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Depuis
          <select
            name="fromLocationId"
            required
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              — Choisir —
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Vers
          <select
            name="toLocationId"
            required
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              — Choisir —
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Date de l&apos;événement
          <input
            type="date"
            name="eventDate"
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
            Transférer
          </button>
        </div>
      </form>
    </details>
  );
}
