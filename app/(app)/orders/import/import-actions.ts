"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { classifyImportBatch } from "@/lib/imports/pipeline";
import { runImport } from "@/lib/imports/service";
import { normalizeHeader } from "@/lib/imports/normalize";
import type { ColumnMapping } from "@/lib/imports/mapping";
import type { DateFormat } from "@/lib/imports/normalize";
import { prisma } from "@/lib/db/prisma";

const ROLES = ["CONFIRMATION", "STOCK"] as const;

export type PreviewResult = {
  orderNumber: string | null;
  rowNumbers: number[];
  kind: string;
  message: string | null;
}[];

export async function previewImportAction(
  rows: string[][],
  mapping: ColumnMapping,
  dateFormat: DateFormat,
  skipStockImpact: boolean
): Promise<PreviewResult> {
  const session = await requireRole([...ROLES]);
  const [header, ...dataRows] = rows;
  if (!header) return [];

  const normalizedHeader = header.map(normalizeHeader);
  const normalizedMapping: ColumnMapping = {};
  for (const [key, value] of Object.entries(mapping)) {
    normalizedMapping[normalizeHeader(key)] = value;
  }

  const defaultLocation = await prisma.location.findFirst({
    where: { organizationId: session.organizationId, kind: "INTERNAL" },
    orderBy: { isDefault: "desc" },
  });

  const classified = await classifyImportBatch(
    {
      organizationId: session.organizationId,
      userId: session.userId,
      dateFormat,
      defaultLocationId: defaultLocation?.id ?? "",
      skipStockImpact,
    },
    dataRows,
    normalizedHeader,
    normalizedMapping
  );

  return classified.map((c) => ({
    orderNumber: c.group.orderNumber,
    rowNumbers: c.group.rowNumbers,
    kind: c.kind,
    message: "message" in c ? c.message : null,
  }));
}

export async function commitImportAction(
  rows: string[][],
  mapping: ColumnMapping,
  dateFormat: DateFormat,
  skipStockImpact: boolean,
  sourceFormat: "CSV" | "PASTE" | "XLSX"
) {
  const session = await requireRole([...ROLES]);
  const result = await runImport({
    organizationId: session.organizationId,
    userId: session.userId,
    sourceFormat,
    rows,
    mapping,
    dateFormat,
    skipStockImpact,
  });
  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/");
  return result;
}
