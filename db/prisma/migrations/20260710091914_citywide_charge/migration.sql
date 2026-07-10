-- CreateTable
CREATE TABLE "ChargeContribution" (
    "weekKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sparkName" TEXT NOT NULL DEFAULT '',
    "amperite" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeContribution_pkey" PRIMARY KEY ("weekKey","accountId")
);

-- CreateTable
CREATE TABLE "ChargeAward" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChargeContribution_weekKey_amperite_idx" ON "ChargeContribution"("weekKey", "amperite");

-- CreateIndex
CREATE INDEX "ChargeAward_accountId_deliveredAt_idx" ON "ChargeAward"("accountId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeAward_weekKey_accountId_key" ON "ChargeAward"("weekKey", "accountId");
