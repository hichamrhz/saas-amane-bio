"use client";

import { useActionState } from "react";
import { createOrderAction, type FormState } from "./actions";

type ArticleOption = { id: string; sku: string; label: string; articleName: string };
type LocationOption = { id: string; name: string };

export function NewOrderForm({
  products,
  locations,
}: {
  products: ArticleOption[];
  locations: LocationOption[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(createOrderAction, undefined);

  return (
    <details className="rounded-lg border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">+ Nouvelle commande</summary>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Client
            <input name="customerName" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Téléphone
            <input name="customerPhone" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Adresse de livraison
            <input name="deliveryAddress" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Canal
            <select name="channel" defaultValue="WHATSAPP" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SITE">Site</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Source marketing
            <select name="marketingSource" defaultValue="UNKNOWN" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="UNKNOWN">Inconnue</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="TIKTOK">TikTok</option>
              <option value="GOOGLE">Google</option>
              <option value="AFFILIATE">Affilié</option>
              <option value="OTHER">Autre</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Emplacement de sortie
            <select name="locationId" required defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
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
            Frais de livraison (MAD)
            <input name="deliveryFeeAmount" inputMode="decimal" defaultValue="0" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="withSalt" defaultChecked />
            Avec sel
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-700">Articles (jusqu&apos;à 5 lignes)</p>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select name="lineSku" defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="">— Aucun —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.articleName} · {p.label} ({p.sku})
                  </option>
                ))}
              </select>
              <input name="lineQuantity" placeholder="Quantité" inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <input name="lineUnitPrice" placeholder="Prix unitaire" inputMode="decimal" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Notes
          <input name="notes" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>

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
            Créer la commande
          </button>
        </div>
      </form>
    </details>
  );
}
