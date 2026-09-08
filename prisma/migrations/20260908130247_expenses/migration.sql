-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ADVERTISING', 'OTHER');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('FACEBOOK', 'TIKTOK', 'GOOGLE', 'OTHER');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "platform" "AdPlatform",
    "label" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "recurrenceKey" TEXT,
    "periodYear" INTEGER,
    "periodMonth" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_organizationId_eventDate_idx" ON "Expense"("organizationId", "eventDate");

-- CreateIndex
CREATE INDEX "Expense_organizationId_category_idx" ON "Expense"("organizationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_organizationId_recurrenceKey_periodYear_periodMonth_key" ON "Expense"("organizationId", "recurrenceKey", "periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Commission_organizationId_payeeId_roleKind_periodYear_peri_key" RENAME TO "Commission_organizationId_payeeId_roleKind_periodYear_perio_key";
