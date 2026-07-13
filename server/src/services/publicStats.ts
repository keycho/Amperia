import {
  cityStatTiles,
  districtName,
  LEDGER_FOOTER,
  TOKEN_LEDGER_PLACEHOLDER,
  TOKEN_LEDGER_TILES,
  type PublicStats,
  type PublicStatsResponse,
} from '@shared/publicStats';
import { prisma } from './db.js';
import { computeTodayMetrics } from './metrics.js';
import { charge } from './charge.js';

/**
 * PUBLIC STATS (P1) — aggregate, non-personal city numbers for the public
 * `/ledger` dashboard and any marketing page. No usernames, no per-player
 * data, no wallet anything. Backward-looking only.
 *
 * `computeTodayMetrics` already classifies today's faucets/sinks/trades and
 * the point-in-time supply, so we reuse it (one source of truth for the sink
 * classification) and layer the week/all-time/charge/district aggregates on
 * top. The route caches the result for 60s.
 */
export async function computePublicStats(now: number): Promise<PublicStats> {
  const dayStart = new Date(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);

  const today = await computeTodayMetrics(now);
  const [activeToday, weekSinkRows, allTrades, meter, districts] = await Promise.all([
    prisma.character.count({ where: { updatedAt: { gte: dayStart } } }),
    // The 6 most-recent FINISHED UTC days; + today's partial = a rolling week.
    prisma.economySummary.findMany({
      orderBy: { date: 'desc' },
      take: 6,
      select: { sinkBolts: true },
    }),
    prisma.economySummary.aggregate({ _sum: { tradeCount: true } }),
    charge.meter(now),
    prisma.character.groupBy({
      by: ['district'],
      where: { updatedAt: { gte: dayStart } },
      _count: { _all: true },
    }),
  ]);

  const boltsSunkThisWeek =
    today.sinkBolts + weekSinkRows.reduce((sum, r) => sum + r.sinkBolts, 0);
  const tradesCompleted = today.tradeCount + (allTrades._sum.tradeCount ?? 0);

  let topDistrict: PublicStats['topDistrict'] = null;
  let topCount = 0;
  for (const row of districts) {
    if (row._count._all > topCount) {
      topCount = row._count._all;
      topDistrict = { id: row.district, name: districtName(row.district) };
    }
  }

  return {
    asOfMs: now,
    sparksRegistered: today.playerCount,
    sparksActiveToday: activeToday,
    boltsInCirculation: today.supplyBolts,
    boltsSunkThisWeek,
    tradesCompleted,
    chargeTier: meter.tier,
    chargeTierMax: meter.thresholds.length,
    topDistrict,
  };
}

/** The full cached response — raw stats + tiles formatted via the shared helper. */
export async function computePublicStatsResponse(now: number): Promise<PublicStatsResponse> {
  const stats = await computePublicStats(now);
  return {
    stats,
    tiles: cityStatTiles(stats),
    tokenTiles: [...TOKEN_LEDGER_TILES],
    tokenPlaceholder: TOKEN_LEDGER_PLACEHOLDER,
    updatedIso: new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };
}

export { LEDGER_FOOTER };
