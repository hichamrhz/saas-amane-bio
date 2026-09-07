import { prisma } from "@/lib/db/prisma";
import { parseCsv } from "./csv";
import { parseXlsx } from "./xlsx";
import { normalizeHeader } from "./normalize";
import { classifyImportBatch, executeImportBatch, type ImportOptions, type ExecutedRow } from "./pipeline";
import type { ColumnMapping } from "./mapping";
import type { DateFormat } from "./normalize";

export function parseSource(source: "CSV" | "PASTE" | "XLSX", content: string | ArrayBuffer): string[][] {
  if (source === "XLSX") {
    return parseXlsx(content as ArrayBuffer);
  }
  return parseCsv(content as string);
}

export async function getLastColumnMapping(organizationId: string): Promise<ColumnMapping | null> {
  const last = await prisma.importBatch.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return (last?.columnMapping as ColumnMapping | undefined) ?? null;
}

export type RunImportInput = {
  organizationId: string;
  userId: string;
  sourceFormat: "CSV" | "PASTE" | "XLSX";
  rows: string[][]; // includes header as rows[0]
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  skipStockImpact: boolean;
};

export type ImportSummary = {
  batchId: string;
  created: number;
  updated: number;
  duplicates: number;
  invalid: number;
  regressionsSkipped: number;
  rows: ExecutedRow[];
};

/** Runs the full pipeline (classify -> execute) and persists an audit trail
 * (ImportBatch + one ImportRow per order group) so every import is
 * reviewable afterwards. */
export async function runImport(input: RunImportInput): Promise<ImportSummary> {
  const [header, ...dataRows] = input.rows;
  if (!header) {
    throw new Error("Fichier vide : aucune ligne d'en-tête trouvée.");
  }
  const normalizedHeader = header.map(normalizeHeader);
  const normalizedMapping: ColumnMapping = {};
  for (const [key, value] of Object.entries(input.mapping)) {
    normalizedMapping[normalizeHeader(key)] = value;
  }

  const defaultLocation = await prisma.location.findFirst({
    where: { organizationId: input.organizationId, kind: "INTERNAL" },
    orderBy: { isDefault: "desc" },
  });
  if (!defaultLocation) {
    throw new Error("Aucun emplacement interne configuré pour cette organisation.");
  }

  const options: ImportOptions = {
    organizationId: input.organizationId,
    userId: input.userId,
    dateFormat: input.dateFormat,
    defaultLocationId: defaultLocation.id,
    skipStockImpact: input.skipStockImpact,
  };

  const classified = await classifyImportBatch(options, dataRows, normalizedHeader, normalizedMapping);
  const executed = await executeImportBatch(options, classified);

  const summary = {
    created: executed.filter((r) => r.status === "VALID_NEW").length,
    updated: executed.filter((r) => r.status === "VALID_UPDATE").length,
    duplicates: executed.filter((r) => r.status === "DUPLICATE_NO_CHANGE").length,
    invalid: executed.filter((r) => r.status === "INVALID").length,
    regressionsSkipped: executed.filter((r) => r.status === "REGRESSION_SKIPPED").length,
  };

  const batch = await prisma.importBatch.create({
    data: {
      organizationId: input.organizationId,
      sourceFormat: input.sourceFormat,
      columnMapping: input.mapping,
      summary,
      createdById: input.userId,
      rows: {
        create: executed.map((row) => ({
          rowNumbers: row.rowNumbers,
          orderNumber: row.orderNumber,
          rawData: {},
          status: row.status,
          message: row.message,
          orderId: row.orderId,
        })),
      },
    },
  });

  return { batchId: batch.id, ...summary, rows: executed };
}
