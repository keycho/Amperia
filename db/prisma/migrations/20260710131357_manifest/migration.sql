-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "titlesJson" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ManifestEntry" (
    "accountId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManifestEntry_pkey" PRIMARY KEY ("accountId","entryId")
);

-- AddForeignKey
ALTER TABLE "ManifestEntry" ADD CONSTRAINT "ManifestEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
