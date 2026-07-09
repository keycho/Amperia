import { CONFIG, type NodeKind } from './config';

/**
 * Skill Mastery 1–50 (Game Bible B3): OSRS-style curve — early levels come
 * in a session, late levels are long-horizon goals. Unlocks are breadth
 * flags; the only rate effect is the modest config gather-speed curve.
 */
export const SKILLS = [
  'scavving',
  'delving',
  'skimming',
  'tuning',
  'brawling',
  'griddling',
] as const;
export type SkillId = (typeof SKILLS)[number];

export type SkillXp = Record<SkillId, number>;

export function makeSkillXp(): SkillXp {
  return { scavving: 0, delving: 0, skimming: 0, tuning: 0, brawling: 0, griddling: 0 };
}

/** Which skill each gather kind trains. */
export const SKILL_BY_NODE: Record<NodeKind, SkillId> = {
  junkHeap: 'scavving',
  brassSeam: 'delving',
  amperite: 'delving',
  glowkoi: 'skimming',
  antenna: 'tuning',
};

/** Total XP required to BE a given level (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const { curveBase, curveGrowth, maxLevel } = CONFIG.mastery;
  const n = Math.min(Math.max(1, Math.floor(level)), maxLevel);
  // Geometric sum: sum_{i=2..n} curveBase * curveGrowth^(i-2)
  let total = 0;
  let step = curveBase;
  for (let i = 2; i <= n; i++) {
    total += Math.floor(step);
    step *= curveGrowth;
  }
  return total;
}

/** Mastery level for an XP total (1..maxLevel). */
export function levelForXp(xp: number): number {
  const { maxLevel } = CONFIG.mastery;
  let level = 1;
  while (level < maxLevel && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Progress toward the next level, 0..1 (1 when maxed). */
export function levelProgress(xp: number): number {
  const level = levelForXp(xp);
  if (level >= CONFIG.mastery.maxLevel) return 1;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return (xp - cur) / (next - cur);
}

/**
 * The modest gather-speed curve (the ONLY rate effect Mastery has):
 * seconds shrink by speedPerLevel per level, capped by speedCap.
 */
export function effectiveSeconds(baseSeconds: number, level: number): number {
  const { speedPerLevel, speedCap } = CONFIG.mastery;
  const factor = Math.max(speedCap, 1 - speedPerLevel * (level - 1));
  return baseSeconds * factor;
}

/** Next unlock (breadth flag) above the given level, if any. */
export function nextUnlock(
  skill: SkillId,
  level: number,
): { level: number; label: string } | null {
  const flags = CONFIG.mastery.unlocks[skill];
  for (const [lvlStr, label] of Object.entries(flags)) {
    const lvl = Number(lvlStr);
    if (lvl > level) return { level: lvl, label };
  }
  return null;
}
