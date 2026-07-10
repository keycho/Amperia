import { CONFIG } from './config';

/**
 * The Citywide Charge (Game Bible B9) — pure math for the communal weekly
 * meter. Sparks donate Amperite at the Dynamo; the meter climbs through
 * tiers whose thresholds INDEX TO THE ACTIVE-PLAYER COUNT (a small city
 * and a big one both get a reachable festival), resets every Monday (UTC),
 * and pays out REGALIA ONLY.
 *
 * LOAD-BEARING RULE (comment kept next to the math on purpose): Charge
 * rewards are never tradeable and never Bolts — an untradeable name-glow
 * trim, a Manifest entry, and a citywide weekend buff. The moment the
 * meter prints value, donations become a farmable faucet and the future
 * token layer inherits an RMT pump. Regalia only, forever.
 */

/** UTC Monday (ISO date) of the week containing `now` — the meter's key. */
export function chargeWeekKey(now: number): string {
  const d = new Date(now);
  // getUTCDay(): 0 = Sunday … 6 = Saturday; Monday-based offset:
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
  return monday.toISOString().slice(0, 10);
}

/** Tier thresholds (Amperite) scaled to the week's active-player count. */
export function chargeThresholds(activePlayers: number): number[] {
  const cfg = CONFIG.charge;
  const base = Math.max(activePlayers, cfg.minActivePlayers);
  return cfg.tierPerActivePlayer.map((per) => Math.ceil(per * base));
}

/** Current tier (0 = dim … thresholds.length = full festival blaze). */
export function chargeTier(total: number, thresholds: number[]): number {
  let tier = 0;
  for (const t of thresholds) {
    if (total >= t) tier += 1;
  }
  return tier;
}

/** Saturday/Sunday in UTC — when the threshold buff glows. */
export function isWeekendUtc(now: number): boolean {
  const day = new Date(now).getUTCDay();
  return day === 6 || day === 0;
}

/**
 * The weekend city buff: gather XP × this. Active only on weekend days
 * when the week's meter has reached at least tier 1.
 */
export function weekendXpMultiplier(tier: number, now: number): number {
  if (tier < 1 || !isWeekendUtc(now)) return 1;
  return 1 + CONFIG.charge.weekendXpBonusPerTier * tier;
}
