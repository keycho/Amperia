import type { InventorySlot } from './inventory';
import type { ItemId } from './items';
import type { TilePoint } from './pathfinding';

/**
 * Client ⇄ server message names and payloads (Colyseus room messages).
 * The server is authoritative for everything with value: clients send
 * intents, the server simulates and answers with results/state.
 */
export const MSG = {
  // client → server (intents)
  move: 'move',
  gather: 'gather',
  glintClick: 'glintClick',
  nodeAction: 'nodeAction',
  attack: 'attack',
  placeHeatlamp: 'placeHeatlamp',
  trade: 'trade',
  prices: 'prices',
  useItem: 'useItem',
  selectSlot: 'selectSlot',
  moveStack: 'moveStack',
  chat: 'chat',
  // server → client (results/events)
  moveAccepted: 'moveAccepted',
  gatherStart: 'gatherStart',
  gatherStop: 'gatherStop',
  glintShow: 'glintShow',
  glintHide: 'glintHide',
  nodeEvent: 'nodeEvent',
  loot: 'loot',
  inventory: 'inventory',
  skills: 'skills',
  xpGain: 'xpGain',
  chatMsg: 'chatMsg',
  notice: 'notice',
  emote: 'emote',
  combat: 'combat',
} as const;

export interface MoveIntent {
  x: number;
  y: number;
}

export interface GatherIntent {
  nodeId: number;
}

export interface GlintClickIntent {
  nodeId: number;
}

export interface MoveStackIntent {
  from: 'pack' | 'hotbar';
  fromIdx: number;
  to: 'pack' | 'hotbar';
  toIdx: number;
}

export interface ChatIntent {
  text: string;
}

/** Kind-specific minigame inputs, validated against the server's own clock. */
export type NodeActionIntent =
  | { nodeId: number; action: 'forkPick'; side: 0 | 1 }
  | { nodeId: number; action: 'strike' }
  | { nodeId: number; action: 'cast' }
  | { nodeId: number; action: 'reel' }
  | { nodeId: number; action: 'tune'; needle: number };

export interface SelectSlotIntent {
  slot: number;
}

/** Kind-specific minigame cues/results (server → the gathering client). */
export type NodeEventPayload =
  | { type: 'brassSegment'; nodeId: number; segment: number; amount: number }
  | { type: 'brassFork'; nodeId: number; liveSide: 0 | 1; cueSeconds: number }
  | { type: 'brassEnd'; nodeId: number; total: number; completed: boolean }
  | {
      type: 'amperiteStart';
      nodeId: number;
      periodSeconds: number;
      phaseSeconds: number;
      windowSeconds: number;
      strikes: number;
    }
  | {
      type: 'amperiteStrike';
      nodeId: number;
      onPulse: boolean;
      amount: number;
      strikesLeft: number;
    }
  | { type: 'koiShadow'; nodeId: number; sizeIdx: number; rare: boolean; shadowSeconds: number }
  | {
      type: 'koiTension';
      nodeId: number;
      periodSeconds: number;
      sweetStart: number;
      sweetLen: number;
    }
  | { type: 'koiResult'; nodeId: number; caught: boolean }
  | {
      type: 'tuneStart';
      nodeId: number;
      seconds: number;
      phase: number;
      driftSpeed: number;
      amplitude: number;
      tolerance: number;
    }
  | { type: 'tuneResult'; nodeId: number; lockRatio: number };

export interface MoveAcceptedEvent {
  sessionId: string;
  path: TilePoint[];
}

export interface GatherStartEvent {
  nodeId: number;
  seconds: number;
}

export interface GatherStopEvent {
  nodeId: number;
}

export interface GlintShowEvent {
  nodeId: number;
  /** 0..1 — where on the heap the glint pops (visual only). */
  offset: number;
  windowSeconds: number;
}

export interface GlintHideEvent {
  nodeId: number;
}

export interface LootEvent {
  nodeId: number;
  itemId: ItemId;
  qty: number;
  /** Rare Manifest find granted alongside, if any. */
  rare: ItemId | null;
  glintHit: boolean;
}

export interface InventorySync {
  pack: InventorySlot[];
  hotbar: InventorySlot[];
  /** Soft-currency balance (server-owned; display only on the client). */
  bolts: number;
}

/** Player → server: trade with the Nightstalls merchant. */
export type TradeIntent =
  | { action: 'sellResource'; itemId: string; qty: number }
  | { action: 'buyItem'; itemId: string };

/** Server → room: current merchant unit prices (published band positions). */
export interface PricesSync {
  buy: Record<string, number>;
}

/** Player → server: use a consumable from a pack slot. */
export interface UseItemIntent {
  slot: number;
}

export interface SkillsSync {
  xp: Record<string, number>;
}

export interface XpGainEvent {
  skill: string;
  amount: number;
}

export interface ChatBroadcast {
  from: string;
  /** Sender's room session id — lets clients hang a bubble on the Spark. */
  sessionId: string;
  text: string;
  ts: number;
}

export interface AttackIntent {
  mobId: string;
}

/** Combat happenings that need timing/feedback beyond schema sync. */
export type CombatEvent =
  | { type: 'mobBite'; mobId: string; sessionId: string; damage: number; hp: number }
  | { type: 'playerDown'; sessionId: string }
  | { type: 'playerHit'; mobId: string; bySessionId: string; damage: number; hp: number }
  | { type: 'mobDown'; mobId: string; bySessionId: string };

/** Mirror of the synced LampState schema (client-side typing only). */
export interface LampStateShape {
  tileX: number;
  tileY: number;
}

/** Mirror of the synced MobState schema (client-side typing only). */
export interface MobStateShape {
  kind: string;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  ai: string;
}

export interface EmoteBroadcast {
  sessionId: string;
  from: string;
  emote: 'wave';
}

export interface NoticeEvent {
  text: string;
}

/** Limits enforced server-side (and mirrored in client UI). */
export const CHAT_LIMITS = {
  maxLength: 200,
  minIntervalMs: 900,
} as const;

/**
 * Read-side shapes of the synced room state (mirrors server schema classes;
 * lets the client stay `any`-free when reading Colyseus state).
 */
export interface PlayerStateShape {
  sparkName: string;
  tileX: number;
  tileY: number;
  gathering: boolean;
  hp: number;
  maxHp: number;
}

export interface NodeStateShape {
  depleted: boolean;
}
