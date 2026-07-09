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
}
defineTypes(PlayerState, {
  sparkName: 'string',
  tileX: 'int16',
  tileY: 'int16',
  gathering: 'boolean',
});

export class NodeState extends Schema {
  depleted = false;
}
defineTypes(NodeState, { depleted: 'boolean' });

export class FilamentState extends Schema {
  players = new MapSchema<PlayerState>();
  /** Keyed by node id (stringified). */
  nodes = new MapSchema<NodeState>();
}
defineTypes(FilamentState, {
  players: { map: PlayerState },
  nodes: { map: NodeState },
});
