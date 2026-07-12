import { CONFIG } from '@shared/config';
import { merchantUnitPrice, pressureAfterRecovery } from '@shared/economy';
import { prisma } from './db.js';

/**
 * Economy instrumentation (E4): classify every Bolts movement in the
 * ledger into faucets (created) and sinks (destroyed), plus the health
 * numbers the balance dashboard needs. Player↔player and player↔cache
 * moves are conservation — counted as volume, never as creation. The
 * nightly rollup writes one EconomySummary row per UTC day: the data
 * spine of the future City Ledger.
 */

export interface DayMetrics {
  /** UTC day 'YYYY-MM-DD' the window belongs to. */
  date: string;
  windowFromMs: number;
  windowToMs: number;
  faucets: Record<string, number>;
  sinks: Record<string, number>;
  faucetBolts: number;
  sinkBolts: number;
  netBolts: number;
  supplyBolts: number;
  /** Net creation as a % of total supply (day-over-day growth). */
  growthPct: number;
  medianBolts: number;
  p90Bolts: number;
  playerCount: number;
  tradeCount: number;
  tradeVolumeEst: number;
  anomalyCount: number;
  shopVolumeBolts: number;
  chargeAmperite: number;
  bands: Record<string, { unit: number; floor: number; ceiling: number; pressure: number }>;
}

interface LedgerRow {
  type: string;
  data: {
    side?: string;
    sink?: string;
    /** EBT onboarding faucet bucket (starterBonus / manifestFind / weeklyGoal). */
    source?: string;
    bolts?: number;
    feeBolts?: number;
    questId?: string;
    itemId?: string;
    qty?: number;
    gaveEstValue?: number;
  };
}

function bump(m: Record<string, number>, k: string, v: number): void {
  m[k] = (m[k] ?? 0) + v;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

/** Compute economy metrics for [fromMs, toMs) against the live DB. */
export async function computeMetrics(fromMs: number, toMs: number): Promise<DayMetrics> {
  const rows = (await prisma.ledgerEvent.findMany({
    where: { ts: { gte: new Date(fromMs), lt: new Date(toMs) } },
    select: { type: true, data: true },
  })) as unknown as LedgerRow[];

  const faucets: Record<string, number> = {};
  const sinks: Record<string, number> = {};
  let tradeCount = 0;
  let tradeVolumeEst = 0;
  let anomalyCount = 0;
  let shopVolumeBolts = 0;
  let chargeAmperite = 0;

  for (const r of rows) {
    const d = r.data;
    if (r.type === 'trade' && d.side === 'npcBuys' && typeof d.bolts === 'number') {
      bump(faucets, 'npcSale', d.bolts);
    } else if (r.type === 'quest' && typeof d.source === 'string' && typeof d.bolts === 'number') {
      // EBT onboarding faucets get their OWN buckets (starterBonus,
      // manifestFind) so they read distinctly on the balance dashboard.
      bump(faucets, d.source, d.bolts);
    } else if (r.type === 'quest' && typeof d.bolts === 'number') {
      bump(faucets, `quest:${d.questId ?? '?'}`, d.bolts);
    } else if (r.type === 'trade' && d.side === 'npcSells' && typeof d.bolts === 'number') {
      bump(sinks, 'wareBuy', Math.abs(d.bolts));
    } else if (r.type === 'trade' && d.side === 'scrapcacheReclaim' && typeof d.feeBolts === 'number') {
      bump(sinks, 'scrapcacheFee', d.feeBolts);
    } else if (r.type === 'spend' && typeof d.bolts === 'number') {
      bump(sinks, d.sink ?? 'other', d.bolts);
    } else if (r.type === 'trade' && d.side === 'playerTrade') {
      // Two rows per trade; each row's gave-value counts toward volume.
      tradeCount += 0.5;
      tradeVolumeEst += typeof d.gaveEstValue === 'number' ? d.gaveEstValue : 0;
    } else if (r.type === 'trade' && d.side === 'shopBuy' && typeof d.bolts === 'number') {
      shopVolumeBolts += Math.abs(d.bolts);
    } else if (r.type === 'anomaly') {
      anomalyCount += 1;
    } else if (r.type === 'quest' && d.sink === 'donation' && d.itemId === 'amperite') {
      chargeAmperite += typeof d.qty === 'number' ? d.qty : 0;
    }
  }

  const faucetBolts = Object.values(faucets).reduce((a, b) => a + b, 0);
  const sinkBolts = Object.values(sinks).reduce((a, b) => a + b, 0);
  const netBolts = faucetBolts - sinkBolts;

  const characters = await prisma.character.findMany({ select: { bolts: true } });
  const stalls = await prisma.shopStall.aggregate({ _sum: { cashboxBolts: true } });
  const balances = characters.map((c) => c.bolts).sort((a, b) => a - b);
  const supplyBolts =
    balances.reduce((a, b) => a + b, 0) + (stalls._sum.cashboxBolts ?? 0);

  // NPC band positions from the persisted merchant pressure state.
  const bands: DayMetrics['bands'] = {};
  const pressureRows = await prisma.merchantState.findMany();
  const nowMs = Date.now();
  for (const [resource, band] of Object.entries(CONFIG.economy.merchant.buy)) {
    const row = pressureRows.find((p) => p.resourceId === resource);
    const hours = row === undefined ? 0 : Math.max(0, nowMs - row.updatedAt.getTime()) / 3_600_000;
    const pressure = pressureAfterRecovery(row?.pressure ?? 0, hours, band);
    bands[resource] = {
      unit: merchantUnitPrice(pressure, band),
      floor: band.floor,
      ceiling: band.ceiling,
      pressure: Number(pressure.toFixed(3)),
    };
  }

  return {
    date: new Date(fromMs).toISOString().slice(0, 10),
    windowFromMs: fromMs,
    windowToMs: toMs,
    faucets,
    sinks,
    faucetBolts,
    sinkBolts,
    netBolts,
    supplyBolts,
    growthPct: supplyBolts > 0 ? Number(((netBolts / supplyBolts) * 100).toFixed(2)) : 0,
    medianBolts: percentile(balances, 0.5),
    p90Bolts: percentile(balances, 0.9),
    playerCount: balances.length,
    tradeCount: Math.round(tradeCount),
    tradeVolumeEst,
    anomalyCount,
    shopVolumeBolts,
    chargeAmperite,
    bands,
  };
}

/** Today-so-far (UTC) — what /metrics shows live. */
export async function computeTodayMetrics(now: number): Promise<DayMetrics> {
  const dayStart = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return computeMetrics(dayStart, now);
}

/**
 * The nightly rollup: one summary row for the JUST-FINISHED UTC day
 * (idempotent upsert — safe to re-run). Returns what it wrote.
 */
export async function runNightlyRollup(now: number): Promise<DayMetrics> {
  const todayStart = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const m = await computeMetrics(todayStart - 86_400_000, todayStart);
  await prisma.economySummary.upsert({
    where: { date: m.date },
    create: summaryData(m),
    update: summaryData(m),
  });
  console.log(
    `[metrics] rollup ${m.date}: faucets ${m.faucetBolts} · sinks ${m.sinkBolts} · net ${m.netBolts} (${m.growthPct}% of supply)`,
  );
  return m;
}

function summaryData(m: DayMetrics): {
  date: string;
  faucetsJson: object;
  sinksJson: object;
  faucetBolts: number;
  sinkBolts: number;
  netBolts: number;
  supplyBolts: number;
  growthPct: number;
  medianBolts: number;
  p90Bolts: number;
  tradeCount: number;
  tradeVolumeEst: number;
  anomalyCount: number;
  shopVolumeBolts: number;
  chargeAmperite: number;
  bandsJson: object;
} {
  return {
    date: m.date,
    faucetsJson: m.faucets,
    sinksJson: m.sinks,
    faucetBolts: m.faucetBolts,
    sinkBolts: m.sinkBolts,
    netBolts: m.netBolts,
    supplyBolts: m.supplyBolts,
    growthPct: m.growthPct,
    medianBolts: m.medianBolts,
    p90Bolts: m.p90Bolts,
    tradeCount: m.tradeCount,
    tradeVolumeEst: m.tradeVolumeEst,
    anomalyCount: m.anomalyCount,
    shopVolumeBolts: m.shopVolumeBolts,
    chargeAmperite: m.chargeAmperite,
    bandsJson: m.bands,
  };
}

/** Chain the nightly rollup to every next UTC midnight. */
export function scheduleNightlyRollup(): void {
  const arm = (): void => {
    const now = Date.now();
    const next = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000;
    setTimeout(() => {
      runNightlyRollup(Date.now()).catch((err) => console.error('[metrics] rollup failed', err));
      arm();
    }, next - now + 5_000);
  };
  arm();
}
