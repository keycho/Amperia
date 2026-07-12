-- CreateTable
CREATE TABLE "EconomySummary" (
    "date" TEXT NOT NULL,
    "faucetsJson" JSONB NOT NULL DEFAULT '{}',
    "sinksJson" JSONB NOT NULL DEFAULT '{}',
    "faucetBolts" INTEGER NOT NULL DEFAULT 0,
    "sinkBolts" INTEGER NOT NULL DEFAULT 0,
    "netBolts" INTEGER NOT NULL DEFAULT 0,
    "supplyBolts" INTEGER NOT NULL DEFAULT 0,
    "growthPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medianBolts" INTEGER NOT NULL DEFAULT 0,
    "p90Bolts" INTEGER NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "tradeVolumeEst" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "shopVolumeBolts" INTEGER NOT NULL DEFAULT 0,
    "chargeAmperite" INTEGER NOT NULL DEFAULT 0,
    "bandsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomySummary_pkey" PRIMARY KEY ("date")
);
