"use client";

import { useState, useTransition } from "react";
import { receiveReturnAction } from "../actions";

type ExpectedLine = {
  id: string;
  articleName: string;
  label: string;
  expectedQuantity: string;
  alreadyReceived: string;
};

export function ReceiveReturnForm({
  orderId,
  returnId,
  expectedLines,
}: {
  orderId: string;
  returnId: string;
  expectedLines: ExpectedLine[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-brand-100 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-neutral-800">Réceptionner le retour</h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            try {
              await receiveReturnAction(returnId, orderId, formData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Erreur.");
            }
          });
        }}
      >
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-medium">Article</th>
              <th className="px-2 py-1 font-medium">Attendu / déjà reçu</th>
              <th className="px-2 py-1 font-medium">Reçu (cette réception)</th>
              <th className="px-2 py-1 font-medium">Sain</th>
              <th className="px-2 py-1 font-medium">Abîmé</th>
            </tr>
          </thead>
          <tbody>
            {expectedLines.map((line) => (
              <tr key={line.id} className="border-t border-neutral-100">
                <td className="px-2 py-1">
                  {line.articleName} · {line.label}
                </td>
                <td className="px-2 py-1 text-neutral-500">
                  {line.expectedQuantity} / {line.alreadyReceived}
                </td>
                <td className="px-2 py-1">
                  <input type="hidden" name="expectedLineId" value={line.id} />
                  <input name="receivedQuantity" defaultValue="0" inputMode="decimal" className="w-20 rounded-md border border-neutral-300 px-2 py-1" />
                </td>
                <td className="px-2 py-1">
                  <input name="healthyQuantity" defaultValue="0" inputMode="decimal" className="w-20 rounded-md border border-neutral-300 px-2 py-1" />
                </td>
                <td className="px-2 py-1">
                  <input name="damagedQuantity" defaultValue="0" inputMode="decimal" className="w-20 rounded-md border border-neutral-300 px-2 py-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          Enregistrer la réception
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
