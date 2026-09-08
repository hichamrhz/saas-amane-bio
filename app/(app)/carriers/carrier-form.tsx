"use client";

import { useActionState } from "react";
import { createCarrierAction, type FormState } from "./actions";

export function CarrierForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(createCarrierAction, undefined);

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">+ Nouveau transporteur</summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Nom
          <input name="name" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Frais par défaut (MAD)
          <input name="defaultFee" inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Notes
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
            Créer
          </button>
        </div>
      </form>
    </details>
  );
}
