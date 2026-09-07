"use client";

import { useState } from "react";
import { parseCsv } from "@/lib/imports/csv";
import { parseXlsx } from "@/lib/imports/xlsx";
import { IMPORT_FIELD_KEYS, IMPORT_FIELD_LABELS, type ImportFieldKey, type ColumnMapping } from "@/lib/imports/mapping";
import type { DateFormat } from "@/lib/imports/normalize";
import { previewImportAction, commitImportAction, type PreviewResult } from "./import-actions";

const KIND_LABELS: Record<string, string> = {
  READY: "Prête",
  INVALID: "Invalide",
  REGRESSION_SKIPPED: "Régression ignorée",
  DUPLICATE_NO_CHANGE: "Doublon (aucun changement)",
};

export function ImportWizard({ initialMapping }: { initialMapping: ColumnMapping | null }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [sourceFormat, setSourceFormat] = useState<"CSV" | "PASTE" | "XLSX">("PASTE");
  const [pasteText, setPasteText] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping ?? {});
  const [dateFormat, setDateFormat] = useState<DateFormat>("DD/MM/YYYY");
  const [skipStockImpact, setSkipStockImpact] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof commitImportAction>> | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleParsedRows(parsed: string[][], format: "CSV" | "PASTE" | "XLSX") {
    setRows(parsed);
    setSourceFormat(format);
    setPreview(null);
    setSummary(null);
    setError(null);
  }

  function handlePasteAnalyze() {
    if (!pasteText.trim()) return;
    handleParsedRows(parseCsv(pasteText), "PASTE");
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const buffer = await file.arrayBuffer();
      handleParsedRows(parseXlsx(buffer), "XLSX");
    } else {
      const text = await file.text();
      handleParsedRows(parseCsv(text), "CSV");
    }
  }

  const header = rows?.[0] ?? [];

  async function handlePreview() {
    if (!rows) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await previewImportAction(rows, mapping, dateFormat, skipStockImpact);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la prévisualisation.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await commitImportAction(rows, mapping, dateFormat, skipStockImpact, sourceFormat);
      setSummary(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'import.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-800">1. Coller ou charger le fichier</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Collez ici les lignes copiées depuis Google Sheets ou Excel…"
          rows={5}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handlePasteAnalyze}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Analyser le texte collé
          </button>
          <span className="text-sm text-neutral-400">ou</span>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-sm"
          />
        </div>
      </section>

      {rows && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">
            2. Faire correspondre les colonnes ({rows.length - 1} ligne(s) de données)
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {header.map((h) => (
              <label key={h} className="flex flex-col gap-1 text-xs text-neutral-600">
                {h || "(colonne sans en-tête)"}
                <select
                  value={mapping[h.trim().toLowerCase()] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [h.trim().toLowerCase()]: (e.target.value || null) as ImportFieldKey | null,
                    }))
                  }
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="">— Ignorer —</option>
                  {IMPORT_FIELD_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {IMPORT_FIELD_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Format de date
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
                <option value="MM/DD/YYYY">MM/JJ/AAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-JJ</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={skipStockImpact} onChange={(e) => setSkipStockImpact(e.target.checked)} />
              Commandes historiques (ne pas impacter le stock actuel)
            </label>
            <button
              type="button"
              disabled={isBusy}
              onClick={handlePreview}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Prévisualiser
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && !summary && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">3. Aperçu ({preview.length} commande(s))</h2>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Commande</th>
                  <th className="px-2 py-1 font-medium">Lignes</th>
                  <th className="px-2 py-1 font-medium">Statut</th>
                  <th className="px-2 py-1 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="px-2 py-1 font-mono text-xs">{p.orderNumber ?? "—"}</td>
                    <td className="px-2 py-1">{p.rowNumbers.join(", ")}</td>
                    <td className="px-2 py-1">{KIND_LABELS[p.kind] ?? p.kind}</td>
                    <td className="px-2 py-1 text-neutral-500">{p.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleCommit}
            className="mt-4 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Confirmer l&apos;import
          </button>
        </section>
      )}

      {summary && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-green-800">Import terminé</h2>
          <p>Créées : {summary.created}</p>
          <p>Mises à jour : {summary.updated}</p>
          <p>Doublons (sans changement) : {summary.duplicates}</p>
          <p>Invalides : {summary.invalid}</p>
          <p>Régressions ignorées : {summary.regressionsSkipped}</p>
        </section>
      )}
    </div>
  );
}
