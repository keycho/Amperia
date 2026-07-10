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
}

export interface NodeStateShape {
  depleted: boolean;
}
