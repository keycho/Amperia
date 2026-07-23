-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "restingPose" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "restingUntil" TIMESTAMP(3);
