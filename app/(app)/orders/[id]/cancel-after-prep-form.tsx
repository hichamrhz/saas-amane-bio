"use client";

import { useState, useTransition } from "react";
import { cancelAfterPrepAction } from "../actions";

type Movement = { id: string; articleName: string; label: string; quantity: string };

export function CancelAfterPrepForm({
  orderId,
  movements,
  title,
}: {
  orderId: string;
  movements: Movement[];
  title: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="rounded-lg border border-red-200 bg-red-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-red-800">{title}</summary>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            try {
              await cancelAfterPrepAction(orderId, formData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Erreur.");
            }
          });
        }}
      >
        <p className="text-xs text-neutral-600">
          Indiquez uniquement ce qui est réellement récupérable. Le reste reste consommé.
        </p>
        {movements.map((m) => (
          <div key={m.id} className="grid grid-cols-3 items-center gap-2 text-sm">
            <span>
              {m.articleName} · {m.label}
            </span>
            <span className="text-neutral-500">sorti : {m.quantity}</span>
            <input
              type="hidden"
              name="recoverMovementId"
              value={m.id}
            />
            <input
              name="recoverQuantity"
              placeholder="Récupérable"
              inputMode="decimal"
              defaultValue="0"
              className="rounded-md border border-neutral-300 px-2 py-1"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Confirmer l&apos;annulation
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </details>
  );
}
