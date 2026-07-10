-- CreateTable
CREATE TABLE "Loftpod" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "berth" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "dye" TEXT NOT NULL DEFAULT 'plum',
    "trophyTitle" TEXT NOT NULL DEFAULT '',
    "trophySkill" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loftpod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loftpod_accountId_key" ON "Loftpod"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Loftpod_berth_key" ON "Loftpod"("berth");

-- AddForeignKey
ALTER TABLE "Loftpod" ADD CONSTRAINT "Loftpod_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
