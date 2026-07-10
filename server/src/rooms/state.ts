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
  hp = 0;
  maxHp = 0;
  cosmetic = '';
}
defineTypes(PlayerState, {
  sparkName: 'string',
  tileX: 'int16',
  tileY: 'int16',
  gathering: 'boolean',
  hp: 'int16',
  maxHp: 'int16',
  cosmetic: 'string',
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

export class LampState extends Schema {
  tileX = 0;
  tileY = 0;
}
defineTypes(LampState, { tileX: 'int16', tileY: 'int16' });

export class FilamentState extends Schema {
  players = new MapSchema<PlayerState>();
  /** Keyed by node id (stringified). */
  nodes = new MapSchema<NodeState>();
  /** Keyed by mob id. */
  mobs = new MapSchema<MobState>();
  /** Keyed by lamp id. */
  lamps = new MapSchema<LampState>();
}
defineTypes(FilamentState, {
  players: { map: PlayerState },
  nodes: { map: NodeState },
  mobs: { map: MobState },
  lamps: { map: LampState },
});
