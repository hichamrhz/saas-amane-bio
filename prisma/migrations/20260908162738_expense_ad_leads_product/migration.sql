-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "articleId" TEXT,
ADD COLUMN     "leads" INTEGER;

-- CreateIndex
CREATE INDEX "Expense_articleId_idx" ON "Expense"("articleId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
