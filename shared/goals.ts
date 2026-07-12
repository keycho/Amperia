import { chargeWeekKey } from './charge';
import { CONFIG } from './config';
import { makeRng } from './rng';

/**
 * The weekly goal board (S2). Eight goals every UTC-Monday week (the same
 * week key as the Citywide Charge), progress counts on all of them,
 * rewards are claimable on any five — and that's the ceiling. No streaks,
 * no penalties, no catch-up debt: miss a week and nothing happens, ever.
 *
 * Copy rule: goals REWARD. They never "earn", never "yield" (CLAUDE.md 11).
 */

export type GoalKind =
  | 'gather'
  | 'craft'
  | 'donate'
  | 'sellNpc'
  | 'shopSale'
  | 'trade'
  | 'discover'
  | 'brawl'
  | 'travel'
  | 'deliver'
  | 'tend'
  | 'hunt';

export interface GoalDef {
  id: string;
  label: string;
  kind: GoalKind;
  /** Progress needed to complete. */
  target: number;
  /** Bolts reward on claim (modest — daily-cap discipline). */
  bolts: number;
  /** Optional filter: itemId for gather, min tier for craft. */
  itemId?: string;
  minTier?: number;
  /** Optional filter: only counts in this district (D3 district goals). */
  district?: string;
}

/** Matchable fact emitted by the server when something goal-shaped happens. */
export interface GoalEvent {
  kind: GoalKind;
  qty: number;
  itemId?: string;
  tier?: number;
  /** District the event happened in (rooms stamp their own id). */
  district?: string;
}

export function goalWeekKey(now: number): string {
  return chargeWeekKey(now);
}

/** Does an event advance this goal? (Pure — unit-tested.) */
export function goalMatches(goal: GoalDef, ev: GoalEvent): boolean {
  if (goal.kind !== ev.kind) return false;
  if (goal.itemId !== undefined && goal.itemId !== ev.itemId) return false;
  if (goal.minTier !== undefined && (ev.tier ?? 0) < goal.minTier) return false;
  if (goal.district !== undefined && goal.district !== ev.district) return false;
  return true;
}

/**
 * The week's eight goals, chosen deterministically from the config pool by
 * the week key — every client and the server agree with zero scheduling.
 */
export function weeklyGoals(weekKey: string): GoalDef[] {
  const pool = CONFIG.goals.pool as readonly GoalDef[];
  let seed = 0;
  for (let i = 0; i < weekKey.length; i++) seed = (seed * 31 + weekKey.charCodeAt(i)) >>> 0;
  const rng = makeRng(seed);
  const picks = [...pool];
  // Fisher-Yates, take the first `perWeek`.
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = picks[i] as GoalDef;
    picks[i] = picks[j] as GoalDef;
    picks[j] = a;
  }
  return picks.slice(0, CONFIG.goals.perWeek);
}
