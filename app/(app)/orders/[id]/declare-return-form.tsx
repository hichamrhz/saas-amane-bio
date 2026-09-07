"use client";

import { useState, useTransition } from "react";
import { declareReturnAction } from "../actions";

type Movement = { id: string; articleName: string; label: string; quantity: string };

export function DeclareReturnForm({ orderId, movements }: { orderId: string; movements: Movement[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-amber-800">Déclarer un retour</summary>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            try {
              await declareReturnAction(orderId, formData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Erreur.");
            }
          });
        }}
      >
        <p className="text-xs text-neutral-600">
          Indiquez la quantité attendue en retour pour chaque article sorti. Aucune
          réintégration n&apos;a lieu ici — seulement la déclaration.
        </p>
        {movements.map((m) => (
          <div key={m.id} className="grid grid-cols-3 items-center gap-2 text-sm">
            <span>
              {m.articleName} · {m.label}
            </span>
            <span className="text-neutral-500">sorti : {m.quantity}</span>
            <div className="flex items-center gap-1">
              <input type="hidden" name="expectMovementId" value={m.id} />
              <input name="expectQuantity" placeholder="Attendu" inputMode="decimal" defaultValue="0" className="w-full rounded-md border border-neutral-300 px-2 py-1" />
            </div>
          </div>
        ))}
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Déclarer le retour
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </details>
  );
}
