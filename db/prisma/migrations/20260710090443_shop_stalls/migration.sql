-- CreateTable
CREATE TABLE "ShopStall" (
    "id" INTEGER NOT NULL,
    "ownerAccountId" TEXT,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "rentPaidUntil" TIMESTAMP(3),
    "stockJson" JSONB NOT NULL DEFAULT '[]',
    "cashboxBolts" INTEGER NOT NULL DEFAULT 0,
    "awaySaleBolts" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopStall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallReturn" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "boltsAmount" INTEGER NOT NULL DEFAULT 0,
    "stockJson" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL DEFAULT 'rentExpired',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StallReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StallReturn_accountId_idx" ON "StallReturn"("accountId");
