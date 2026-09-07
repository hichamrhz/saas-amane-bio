import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";

/**
 * On-hand quantity is always derived by summing the immutable movement
 * ledger — never a mutated counter — so it can never silently drift from
 * the audit trail (see ARCHITECTURE.md §4).
 */
export async function getOnHandByVariant(
  organizationId: string,
  articleVariantIds: string[]
): Promise<Map<string, string>> {
  if (articleVariantIds.length === 0) return new Map();

  const totals = await prisma.stockMovement.groupBy({
    by: ["articleVariantId"],
    where: { organizationId, articleVariantId: { in: articleVariantIds } },
    _sum: { quantityDelta: true },
  });

  const map = new Map<string, string>();
  for (const row of totals) {
    map.set(row.articleVariantId, (row._sum.quantityDelta ?? 0).toString());
  }
  return map;
}

export async function getOnHandByVariantAndLocation(
  organizationId: string,
  articleVariantId: string
): Promise<{ locationId: string; locationName: string; quantity: string }[]> {
  const totals = await prisma.stockMovement.groupBy({
    by: ["locationId"],
    where: { organizationId, articleVariantId },
    _sum: { quantityDelta: true },
  });

  const locations = await prisma.location.findMany({
    where: { organizationId, id: { in: totals.map((t) => t.locationId) } },
  });
  const nameById = new Map(locations.map((l) => [l.id, l.name]));

  return totals.map((t) => ({
    locationId: t.locationId,
    locationName: nameById.get(t.locationId) ?? t.locationId,
    quantity: (t._sum.quantityDelta ?? 0).toString(),
  }));
}

export async function listStockMovements(organizationId: string, limit = 100) {
  return prisma.stockMovement.findMany({
    where: { organizationId },
    include: {
      articleVariant: { include: { article: true } },
      location: true,
      createdBy: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
}

export async function getOnHandSummary(organizationId: string) {
  const totals = await prisma.stockMovement.groupBy({
    by: ["articleVariantId", "locationId"],
    where: { organizationId },
    _sum: { quantityDelta: true },
  });

  const nonZero = totals.filter(
    (t) => !new Decimal(t._sum.quantityDelta?.toString() ?? "0").isZero()
  );

  const [variants, locations] = await Promise.all([
    prisma.articleVariant.findMany({
      where: { id: { in: nonZero.map((t) => t.articleVariantId) } },
      include: { article: true },
    }),
    prisma.location.findMany({
      where: { id: { in: nonZero.map((t) => t.locationId) } },
    }),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  return nonZero
    .map((t) => ({
      variant: variantById.get(t.articleVariantId),
      location: locationById.get(t.locationId),
      quantity: (t._sum.quantityDelta ?? 0).toString(),
    }))
    .filter((row) => row.variant && row.location)
    .sort((a, b) => a.variant!.article.name.localeCompare(b.variant!.article.name));
}

export async function getOnHandAt(
  organizationId: string,
  articleVariantId: string,
  locationId: string
): Promise<Decimal> {
  const result = await prisma.stockMovement.aggregate({
    where: { organizationId, articleVariantId, locationId },
    _sum: { quantityDelta: true },
  });
  return new Decimal(result._sum.quantityDelta?.toString() ?? "0");
}
