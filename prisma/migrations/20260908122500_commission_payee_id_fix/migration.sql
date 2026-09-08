-- Fix: userId/affiliateId are both nullable on Commission, and Postgres
-- unique indexes never consider two NULLs equal — so the original
-- (orderId, userId, affiliateId, roleKind) and (organizationId, userId,
-- affiliateId, roleKind, periodYear, periodMonth) constraints silently
-- never fired for any row (every row has exactly one of userId/affiliateId
-- null). Denormalize the actual payee id into a non-nullable column and
-- key the idempotency constraints on that instead.

DROP INDEX "Commission_orderId_userId_affiliateId_roleKind_key";
DROP INDEX "Commission_organizationId_userId_affiliateId_roleKind_perio_key";

ALTER TABLE "Commission" ADD COLUMN "payeeId" TEXT NOT NULL DEFAULT '';
UPDATE "Commission" SET "payeeId" = COALESCE("userId", "affiliateId", '');
ALTER TABLE "Commission" ALTER COLUMN "payeeId" DROP DEFAULT;

CREATE UNIQUE INDEX "Commission_orderId_payeeId_roleKind_key" ON "Commission"("orderId", "payeeId", "roleKind");
CREATE UNIQUE INDEX "Commission_organizationId_payeeId_roleKind_periodYear_peri_key" ON "Commission"("organizationId", "payeeId", "roleKind", "periodYear", "periodMonth");
