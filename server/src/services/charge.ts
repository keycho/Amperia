import { CONFIG } from '@shared/config';
import { chargeThresholds, chargeTier, chargeWeekKey, weekendXpMultiplier } from '@shared/charge';
import { prisma } from './db.js';
import { ledger } from './ledger.js';

/**
 * The Citywide Charge service (E3): the server-persisted weekly Amperite
 * meter at the Dynamo. Contributions key on the UTC-Monday weekKey — the
 * "Monday reset" is the key rolling over, so nothing needs a cron to
 * zero out. Past weeks finalize into top-contributor awards on sweep.
 *
 * REGALIA ONLY (load-bearing — see shared/charge.ts): awards are the
 * untradeable name-glow trim + a Manifest entry. No Bolts, nothing
 * tradeable, ever.
 */

export interface ChargeMeter {
  weekKey: string;
  total: number;
  tier: number;
  thresholds: number[];
  activePlayers: number;
  buffPct: number;
}

export interface ChargeRank {
  sparkName: string;
  amperite: number;
}

class ChargeService {
  private cached: ChargeMeter | null = null;
  private cachedAtMs = 0;
  private activeCache = { count: 0, atMs: 0 };

  /** Distinct characters seen inside the active window (cached ~10 min). */
  private async activePlayers(now: number): Promise<number> {
    if (now - this.activeCache.atMs < 600_000) return this.activeCache.count;
    const since = new Date(now - CONFIG.charge.activeWindowDays * 86_400_000);
    const count = await prisma.character.count({ where: { updatedAt: { gte: since } } });
    this.activeCache = { count, atMs: now };
    return count;
  }

  async meter(now: number): Promise<ChargeMeter> {
    const weekKey = chargeWeekKey(now);
    if (this.cached !== null && this.cached.weekKey === weekKey && now - this.cachedAtMs < 30_000) {
      return this.cached;
    }
    const [sum, active] = await Promise.all([
      prisma.chargeContribution.aggregate({
        where: { weekKey },
        _sum: { amperite: true },
      }),
      this.activePlayers(now),
    ]);
    const total = sum._sum.amperite ?? 0;
    const thresholds = chargeThresholds(active);
    const tier = chargeTier(total, thresholds);
    this.cached = {
      weekKey,
      total,
      tier,
      thresholds,
      activePlayers: active,
      buffPct: Math.round(CONFIG.charge.weekendXpBonusPerTier * tier * 100),
    };
    this.cachedAtMs = now;
    return this.cached;
  }

  /** Cached tier for hot paths (gather XP); 0 until the first meter read. */
  tierNow(): number {
    return this.cached?.tier ?? 0;
  }

  /** Gather-XP multiplier for the weekend city buff (hot path, sync). */
  xpMultiplier(now: number): number {
    return weekendXpMultiplier(this.tierNow(), now);
  }

  async donate(accountId: string, sparkName: string, qty: number, now: number): Promise<ChargeMeter> {
    const weekKey = chargeWeekKey(now);
    await prisma.chargeContribution.upsert({
      where: { weekKey_accountId: { weekKey, accountId } },
      create: { weekKey, accountId, sparkName, amperite: qty },
      update: { amperite: { increment: qty }, sparkName },
    });
    this.cached = null; // meter moved — recompute on next read
    return this.meter(now);
  }

  async leaderboard(weekKey: string, n: number): Promise<ChargeRank[]> {
    const rows = await prisma.chargeContribution.findMany({
      where: { weekKey },
      orderBy: { amperite: 'desc' },
      take: n,
    });
    return rows.map((r) => ({ sparkName: r.sparkName, amperite: r.amperite }));
  }

  /**
   * Turn every finished week's top contributors into award rows (idempotent
   * — a week with any award rows is already finalized). Awards deliver on
   * the winner's next login.
   */
  async finalizePastWeeks(now: number): Promise<void> {
    const currentWeek = chargeWeekKey(now);
    const weeks = await prisma.chargeContribution.groupBy({ by: ['weekKey'] });
    for (const w of weeks) {
      if (w.weekKey >= currentWeek) continue;
      const already = await prisma.chargeAward.count({ where: { weekKey: w.weekKey } });
      if (already > 0) continue;
      const top = await prisma.chargeContribution.findMany({
        where: { weekKey: w.weekKey, amperite: { gt: 0 } },
        orderBy: { amperite: 'desc' },
        take: CONFIG.charge.topContributors,
      });
      for (const [i, row] of top.entries()) {
        await prisma.chargeAward.create({
          data: { accountId: row.accountId, weekKey: w.weekKey, rank: i + 1 },
        });
        // Manifest entry: the trim is regalia, logged like a trophy.
        ledger.log({
          type: 'trophy',
          account: row.accountId,
          data: {
            source: 'citywideCharge',
            weekKey: w.weekKey,
            rank: i + 1,
            cosmetic: CONFIG.charge.trimCosmetic,
            amperite: row.amperite,
          },
        });
      }
      if (top.length > 0) {
        console.log(`[charge] week ${w.weekKey} finalized — ${top.length} trims awarded`);
      }
    }
  }

  /** Awards waiting for this Spark (delivered + marked on login). */
  async undeliveredAwards(accountId: string): Promise<Array<{ id: string; weekKey: string; rank: number }>> {
    const rows = await prisma.chargeAward.findMany({
      where: { accountId, deliveredAt: null },
    });
    return rows.map((r) => ({ id: r.id, weekKey: r.weekKey, rank: r.rank }));
  }

  async markDelivered(id: string): Promise<void> {
    await prisma.chargeAward.update({ where: { id }, data: { deliveredAt: new Date() } });
  }
}

export const charge = new ChargeService();
