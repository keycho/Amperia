import { CONFIG } from '@shared/config';
import { type CoilRoll, coilDayKey, rollCoil } from '@shared/coil';
import { makeRng } from '@shared/rng';
import { prisma } from './db.js';

/**
 * The Fortune Coil (S4) — server side of the ONE free daily spin. There
 * is no other entry point: no currency parameter exists anywhere in this
 * file, and the room handler asserts the intent carries none. Prizes are
 * all untradeable; pity state lives on the Character row.
 */

export interface CoilSpinOutcome {
  ok: true;
  roll: CoilRoll;
  shards: number;
  /** True when this spin completed the shard set → grant the cosmetic. */
  cosmeticEarned: boolean;
}

export interface CoilSpinDenied {
  ok: false;
  error: string;
}

export async function spinCoil(
  characterId: string,
  cosmeticOwned: boolean,
  now: number,
  seed: number,
): Promise<CoilSpinOutcome | CoilSpinDenied> {
  const c = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { coilDate: true, coilPity: true, coilShards: true },
  });
  const day = coilDayKey(now);
  if (c.coilDate === day) {
    return { ok: false, error: 'The Coil rests until tomorrow.' };
  }
  const cfg = CONFIG.coil;
  const roll = rollCoil(cfg.prizes, makeRng(seed), {
    shards: c.coilShards,
    shardsTarget: cfg.shardsForCosmetic,
    cosmeticOwned,
    pity: c.coilPity,
    pityWeightStep: cfg.pityWeightStep,
  });
  const gotShard = roll.prize.kind === 'shard';
  const shards = gotShard ? c.coilShards + roll.prize.amount : c.coilShards;
  await prisma.character.update({
    where: { id: characterId },
    data: {
      coilDate: day,
      coilPity: gotShard ? 0 : c.coilPity + 1,
      coilShards: shards,
    },
  });
  return {
    ok: true,
    roll,
    shards,
    cosmeticEarned: !cosmeticOwned && shards >= cfg.shardsForCosmetic,
  };
}

/** Has today's free spin been used? (HUD state on join.) */
export async function coilSpunToday(characterId: string, now: number): Promise<boolean> {
  const c = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { coilDate: true },
  });
  return c.coilDate === coilDayKey(now);
}
