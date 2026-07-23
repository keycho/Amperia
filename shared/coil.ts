import type { Rng } from './rng';

/**
 * The Fortune Coil (S4) — ONE free spin daily. HARD RULE, asserted here
 * and in the server handler: the wheel takes NO currency input of any
 * kind. No $AMP, no ETH, no Bolts — there is no paid-spin codepath, and
 * even Bolts spins wait for a separate legal review (CLAUDE.md rule 6:
 * no randomness downstream of a premium payment; the free spin sits
 * upstream of every payment). All prizes are untradeable.
 */

export type CoilPrizeKind = 'bolts' | 'item' | 'shard';

export interface CoilPrizeDef {
  id: string;
  label: string;
  kind: CoilPrizeKind;
  /** Relative wheel weight (integer). */
  weight: number;
  /** Bolts amount or item qty. */
  amount: number;
  /** For kind 'item'. */
  itemId?: string;
}

/**
 * Compile-time guarantee that the spin intent has NO currency fields —
 * adding one is a type error here before it is a runtime hazard.
 */
export interface CoilSpinIntent {
  /** The spin takes nothing. This brand field documents exactly that. */
  free?: true;
}
type ForbiddenCurrencyKeys = 'bolts' | 'amp' | 'eth' | 'payment' | 'price' | 'cost';
type AssertNoCurrency<T> = keyof T & ForbiddenCurrencyKeys extends never ? true : never;
export const COIL_TAKES_NO_CURRENCY: AssertNoCurrency<CoilSpinIntent> = true;

/** Runtime guard for the handler: reject any payload smuggling currency. */
export function assertFreeSpin(msg: unknown): void {
  if (typeof msg !== 'object' || msg === null) return;
  for (const key of ['bolts', 'amp', 'eth', 'payment', 'price', 'cost']) {
    if (key in (msg as Record<string, unknown>)) {
      throw new Error(`Fortune Coil: currency input path does not exist (got '${key}')`);
    }
  }
}

export interface CoilRollOpts {
  /** Shards collected so far toward the Coil-exclusive cosmetic. */
  shards: number;
  shardsTarget: number;
  /** True once the Coil cosmetic is owned — shard prizes convert. */
  cosmeticOwned: boolean;
  /** Spins since the last shard (duplicate-pity ramps the shard odds). */
  pity: number;
  /** Extra shard weight per pity point (config). */
  pityWeightStep: number;
}

export interface CoilRoll {
  /** Index into the prize table (the wheel segment to land on). */
  index: number;
  prize: CoilPrizeDef;
  /** True when pity/dupe rules converted a shard into the fallback. */
  converted: boolean;
}

/**
 * Server-side roll. Pure and seeded for tests. Pity: every shardless spin
 * adds weight to shard segments; once the cosmetic is owned (or shards are
 * capped) shard rolls convert to the fallback prize so nothing is wasted.
 */
export function rollCoil(table: readonly CoilPrizeDef[], rng: Rng, opts: CoilRollOpts): CoilRoll {
  const weights = table.map((p) =>
    p.kind === 'shard' ? p.weight + opts.pity * opts.pityWeightStep : p.weight,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  let index = 0;
  for (let i = 0; i < table.length; i++) {
    pick -= weights[i] as number;
    if (pick <= 0) {
      index = i;
      break;
    }
  }
  const prize = table[index] as CoilPrizeDef;
  const shardsDone = opts.cosmeticOwned || opts.shards >= opts.shardsTarget;
  if (prize.kind === 'shard' && shardsDone) {
    // Duplicate-pity: convert to the first Bolts prize (never a dead spin).
    const fallbackIdx = table.findIndex((p) => p.kind === 'bolts');
    const fb = table[Math.max(0, fallbackIdx)] as CoilPrizeDef;
    return { index: Math.max(0, fallbackIdx), prize: fb, converted: true };
  }
  return { index, prize, converted: false };
}

/** UTC day key — one free spin per key. */
export function coilDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
