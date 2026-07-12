-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "bolts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cosmeticsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dailySaleBolts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailySaleDate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "district" TEXT NOT NULL DEFAULT 'filament',
ADD COLUMN     "questsJson" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "MerchantState" (
    "resourceId" TEXT NOT NULL,
    "pressure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantState_pkey" PRIMARY KEY ("resourceId")
);
