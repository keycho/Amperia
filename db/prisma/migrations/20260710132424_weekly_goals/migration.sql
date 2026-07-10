-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "goalTokens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GoalProgress" (
    "accountId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "claimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GoalProgress_pkey" PRIMARY KEY ("accountId","weekKey","goalId")
);

-- CreateIndex
CREATE INDEX "GoalProgress_accountId_weekKey_idx" ON "GoalProgress"("accountId", "weekKey");
