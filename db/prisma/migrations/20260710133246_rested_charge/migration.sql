-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "restedDate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "restedMsUsed" INTEGER NOT NULL DEFAULT 0;
