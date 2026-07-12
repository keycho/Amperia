import { CONFIG } from '@shared/config';
import { type GoalDef, type GoalEvent, goalMatches, weeklyGoals } from '@shared/goals';
import { prisma } from './db.js';

/**
 * Weekly goal board (S2) — server-side progress + claims. Progress bumps
 * ride existing verified actions (the room calls goalEvent off the same
 * paths that grant loot / settle trades / etc.), so nothing here trusts
 * the client. Claims cap at CONFIG.goals.maxClaims per week: the any-5
 * rule. No streaks are stored anywhere, by design.
 */

export interface GoalRow {
  goalId: string;
  progress: number;
  claimed: boolean;
}

export async function loadGoals(accountId: string, weekKey: string): Promise<GoalRow[]> {
  const rows = await prisma.goalProgress.findMany({ where: { accountId, weekKey } });
  return rows.map((r) => ({ goalId: r.goalId, progress: r.progress, claimed: r.claimed }));
}

/** Advance every matching goal for this week; returns the changed rows. */
export async function bumpGoals(
  accountId: string,
  weekKey: string,
  ev: GoalEvent,
): Promise<GoalRow[]> {
  const goals = weeklyGoals(weekKey).filter((g) => goalMatches(g, ev));
  const out: GoalRow[] = [];
  for (const goal of goals) {
    const key = { accountId, weekKey, goalId: goal.id };
    const row = await prisma.goalProgress.findUnique({
      where: { accountId_weekKey_goalId: key },
    });
    if (row === null) {
      const created = await prisma.goalProgress.create({
        data: { ...key, progress: Math.min(goal.target, ev.qty) },
      });
      out.push({ goalId: goal.id, progress: created.progress, claimed: created.claimed });
    } else if (row.progress < goal.target) {
      const updated = await prisma.goalProgress.update({
        where: { accountId_weekKey_goalId: key },
        data: { progress: Math.min(goal.target, row.progress + ev.qty) },
      });
      out.push({ goalId: goal.id, progress: updated.progress, claimed: updated.claimed });
    } else {
      out.push({ goalId: goal.id, progress: row.progress, claimed: row.claimed });
    }
  }
  return out;
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  bolts?: number;
  claimsUsed?: number;
  /** True exactly on the 5th claim of the week → one regalia token. */
  tokenAwarded?: boolean;
}

/** Claim a completed goal (server-validated, any-5 ceiling). */
export async function claimGoal(
  accountId: string,
  weekKey: string,
  goalId: string,
): Promise<ClaimResult> {
  const goal = weeklyGoals(weekKey).find((g) => g.id === goalId) as GoalDef | undefined;
  if (goal === undefined) return { ok: false, error: 'Not on this week’s board.' };
  const row = await prisma.goalProgress.findUnique({
    where: { accountId_weekKey_goalId: { accountId, weekKey, goalId } },
  });
  if (row === null || row.progress < goal.target) {
    return { ok: false, error: 'Not finished yet.' };
  }
  if (row.claimed) return { ok: false, error: 'Already claimed.' };
  const claimsUsed = await prisma.goalProgress.count({
    where: { accountId, weekKey, claimed: true },
  });
  if (claimsUsed >= CONFIG.goals.maxClaims) {
    return { ok: false, error: `The board rewards ${CONFIG.goals.maxClaims} a week — all claimed.` };
  }
  await prisma.goalProgress.update({
    where: { accountId_weekKey_goalId: { accountId, weekKey, goalId } },
    data: { claimed: true },
  });
  return {
    ok: true,
    bolts: goal.bolts,
    claimsUsed: claimsUsed + 1,
    tokenAwarded: claimsUsed + 1 === CONFIG.goals.maxClaims,
  };
}

/** Persist the regalia-token counter (claim handler). */
export async function saveGoalTokens(characterId: string, tokens: number): Promise<void> {
  await prisma.character.update({ where: { id: characterId }, data: { goalTokens: tokens } });
}
