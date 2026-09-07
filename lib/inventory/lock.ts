import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Serializes concurrent transactions that touch the same (article variant,
 * location) stock row, using a Postgres transaction-scoped advisory lock.
 *
 * Without this, two concurrent "last unit" operations could both read the
 * same available-quantity snapshot, both pass the check, and both insert
 * movements — producing negative stock. The lock is released automatically
 * when the enclosing transaction commits or rolls back.
 *
 * Call this BEFORE reading the current on-hand quantity inside a
 * transaction, for every stock row the transaction is about to consume
 * from. When locking more than one row in the same transaction, callers
 * must lock them in a stable order (e.g. sorted by articleVariantId) to
 * avoid deadlocks between transactions that lock the same rows in
 * different orders.
 */
export async function lockStockRow(
  tx: Prisma.TransactionClient,
  organizationId: string,
  articleVariantId: string,
  locationId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${articleVariantId}`}), hashtext(${locationId}))`;
}
