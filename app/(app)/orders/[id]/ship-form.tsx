"use client";

import { useState, useTransition } from "react";
import { shipOrderAction } from "../actions";

export function ShipForm({ orderId, carriers }: { orderId: string; carriers: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            await shipOrderAction(orderId, formData);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur.");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Transporteur
        <select name="carrierId" defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">— Aucun —</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Numéro de suivi
        <input name="trackingNumber" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Marquer en livraison
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
