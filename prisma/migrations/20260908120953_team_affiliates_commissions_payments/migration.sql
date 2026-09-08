-- CreateEnum
CREATE TYPE "PayeeType" AS ENUM ('USER', 'AFFILIATE');

-- CreateEnum
CREATE TYPE "CommissionRoleKind" AS ENUM ('CONFIRMATION', 'DELIVERY', 'AFFILIATE_REFERRAL', 'FIXED_SALARY');

-- CreateEnum
CREATE TYPE "CommissionRateType" AS ENUM ('FIXED_PER_ORDER', 'PERCENT_OF_SUBTOTAL', 'FIXED_PER_MONTH');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "affiliateId" TEXT;

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payeeType" "PayeeType" NOT NULL,
    "userId" TEXT,
    "affiliateId" TEXT,
    "roleKind" "CommissionRoleKind" NOT NULL,
    "rateType" "CommissionRateType" NOT NULL,
    "rateValue" DECIMAL(12,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payeeType" "PayeeType" NOT NULL,
    "userId" TEXT,
    "affiliateId" TEXT,
    "roleKind" "CommissionRoleKind" NOT NULL,
    "orderId" TEXT,
    "commissionRuleId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "periodYear" INTEGER,
    "periodMonth" INTEGER,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payeeType" "PayeeType" NOT NULL,
    "userId" TEXT,
    "affiliateId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "clientRequestId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Affiliate_organizationId_idx" ON "Affiliate"("organizationId");

-- CreateIndex
CREATE INDEX "CommissionRule_organizationId_userId_roleKind_effectiveFrom_idx" ON "CommissionRule"("organizationId", "userId", "roleKind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionRule_organizationId_affiliateId_roleKind_effectiv_idx" ON "CommissionRule"("organizationId", "affiliateId", "roleKind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Commission_organizationId_userId_idx" ON "Commission"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Commission_organizationId_affiliateId_idx" ON "Commission"("organizationId", "affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_orderId_userId_affiliateId_roleKind_key" ON "Commission"("orderId", "userId", "affiliateId", "roleKind");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_organizationId_userId_affiliateId_roleKind_perio_key" ON "Commission"("organizationId", "userId", "affiliateId", "roleKind", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Payment_organizationId_userId_idx" ON "Payment"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_affiliateId_idx" ON "Payment"("organizationId", "affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_clientRequestId_key" ON "Payment"("organizationId", "clientRequestId");

-- CreateIndex
CREATE INDEX "Order_organizationId_affiliateId_idx" ON "Order"("organizationId", "affiliateId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
