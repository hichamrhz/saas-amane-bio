"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

type ArticleOption = { id: string; sku: string; label: string; articleName: string };
type LocationOption = { id: string; name: string; kind: string };

type FormState = { error?: string } | undefined;

export function ReceptionForm({
  title,
  action,
  kindOptions,
  articles,
  locations,
}: {
  title: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  kindOptions: { value: string; label: string }[];
  articles: ArticleOption[];
  locations: LocationOption[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);
  const [kind, setKind] = useState(kindOptions[0]?.value ?? "SUPPLIER_PURCHASE");
  const today = new Date().toISOString().slice(0, 10);
  const t = useTranslations("purchases");
  const tCommon = useTranslations("common");

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4" open>
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">{title}</summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kindOptions.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            {t("receptionType")}
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {kindOptions.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="kind" value={kind} />
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tCommon("article")}
          <select
            name="articleVariantId"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              {tCommon("choose")}
            </option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.articleName} · {a.label} ({a.sku})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tCommon("quantity")}
          <input
            name="quantity"
            required
            inputMode="decimal"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("unitCost")} (MAD)
          <input
            name="unitCost"
            inputMode="decimal"
            defaultValue="0"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("destination")}
          <select
            name="locationId"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              {tCommon("choose")}
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        {kind === "COOPERATIVE_PRODUCT" && (
          <>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              {t("cooperativeSource")}
              <select
                name="cooperativeLocationId"
                required
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  {tCommon("choose")}
                </option>
                {locations
                  .filter((l) => l.kind === "COOPERATIVE")
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="costIncludesLabel" />
              {t("costIncludesLabel")}
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("eventDate")}
          <input
            type="date"
            name="eventDate"
            required
            defaultValue={today}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("referenceOptional")}
          <input name="reference" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
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
            {t("saveReception")}
          </button>
        </div>
      </form>
    </details>
  );
}
