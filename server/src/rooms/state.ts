import { defineTypes, MapSchema, Schema } from '@colyseus/schema';

/**
 * Synced room state. Only presentation-safe facts live here — inventories and
 * value rolls are per-client messages, never broadcast state.
 *
 * defineTypes (not decorators): schema v3's decorator metadata does not
 * survive esbuild/tsx transforms, so we register types explicitly.
 */
export class PlayerState extends Schema {
  sparkName = '';
  tileX = 0;
  tileY = 0;
  /** True while the server is gathering for this Spark (busy pose). */
  gathering = false;
  /** Working-pose tool id while gathering ('' = none) — presentation only. */
  pose = '';
  /** Creator appearance code (shared/appearance.ts) — presentation only. */
  appearance = '';
  hp = 0;
  maxHp = 0;
  /** Worn wardrobe cosmetics (shared/cosmetics.ts wire form). */
  equipped = '';
  /** Charge-regalia name-glow trim ('' = none) — never gameplay. */
  trim = '';
}
defineTypes(PlayerState, {
  sparkName: 'string',
  tileX: 'int16',
  tileY: 'int16',
  gathering: 'boolean',
  pose: 'string',
  appearance: 'string',
  hp: 'int16',
  maxHp: 'int16',
  equipped: 'string',
  trim: 'string',
});

export class MobState extends Schema {
  kind = 'scuttlebot';
  tileX = 0;
  tileY = 0;
  hp = 0;
  maxHp = 0;
  /** AI state string — clients render telegraphs from transitions. */
  ai = 'idle';
}
defineTypes(MobState, {
  kind: 'string',
  tileX: 'int16',
  tileY: 'int16',
  hp: 'int16',
  maxHp: 'int16',
  ai: 'string',
});

export class NodeState extends Schema {
  depleted = false;
}
defineTypes(NodeState, { depleted: 'boolean' });

export class CacheState extends Schema {
  tileX = 0;
  tileY = 0;
}
defineTypes(CacheState, { tileX: 'int16', tileY: 'int16' });

export class LampState extends Schema {
  tileX = 0;
  tileY = 0;
}
defineTypes(LampState, { tileX: 'int16', tileY: 'int16' });

/**
 * A rentable shop stall's public face: the shingle name and up to three
 * stocked item ids (comma-joined) rendered as counter goods. Prices and
 * quantities go per-client via shopSync — never broadcast state.
 */
export class StallState extends Schema {
  ownerName = '';
  goods = '';
}
defineTypes(StallState, { ownerName: 'string', goods: 'string' });

/**
 * A Loftpod on its Terrarium berth (D2b) — display facts only: the tier,
 * the dye, whose home it is, and what they hang on the trophy hooks.
 */
export class LoftpodState extends Schema {
  berth = 0;
  tier = 1;
  dye = 'plum';
  ownerName = '';
  trophyTitle = '';
  trophySkill = '';
}
defineTypes(LoftpodState, {
  berth: 'int8',
  tier: 'uint8',
  dye: 'string',
  ownerName: 'string',
  trophyTitle: 'string',
  trophySkill: 'string',
});

/**
 * The Citywide Charge meter as the whole room sees it: total, tier and the
 * three thresholds (for meter rendering + lighting density), plus whether
 * the weekend buff is glowing. Leaderboard detail goes per-client.
 */
export class ChargeState extends Schema {
  weekTotal = 0;
  tier = 0;
  t1 = 0;
  t2 = 0;
  t3 = 0;
  buffActive = false;
  buffPct = 0;
}
defineTypes(ChargeState, {
  weekTotal: 'int32',
  tier: 'int8',
  t1: 'int32',
  t2: 'int32',
  t3: 'int32',
  buffActive: 'boolean',
  buffPct: 'int8',
});

/** U1b: a tended planter blooms for everyone (keyed by gardenbed index). */
export class BloomState extends Schema {
  untilMs = 0;
}
defineTypes(BloomState, { untilMs: 'float64' });

export class FilamentState extends Schema {
  players = new MapSchema<PlayerState>();
  /** Keyed by node id (stringified). */
  nodes = new MapSchema<NodeState>();
  /** Keyed by mob id. */
  mobs = new MapSchema<MobState>();
  /** Keyed by lamp id. */
  lamps = new MapSchema<LampState>();
  /** Keyed by cache id (Tangle Scrapcaches). */
  caches = new MapSchema<CacheState>();
  /** Keyed by stall id (Filament market lane only). */
  stalls = new MapSchema<StallState>();
  /** The Citywide Charge meter (shared across districts). */
  charge = new ChargeState();
  /** Keyed by berth index (Terrarium Loftpods, D2b). */
  loftpods = new MapSchema<LoftpodState>();
  /** Keyed by gardenbed prop index (Terrarium tending, U1b). */
  blooms = new MapSchema<BloomState>();
}
defineTypes(FilamentState, {
  players: { map: PlayerState },
  nodes: { map: NodeState },
  mobs: { map: MobState },
  blooms: { map: BloomState },
  lamps: { map: LampState },
  caches: { map: CacheState },
  stalls: { map: StallState },
  charge: ChargeState,
  loftpods: { map: LoftpodState },
});
