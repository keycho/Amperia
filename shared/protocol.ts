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
  moveStack: 'moveStack',
  chat: 'chat',
  // server → client (results/events)
  moveAccepted: 'moveAccepted',
  gatherStart: 'gatherStart',
  gatherStop: 'gatherStop',
  glintShow: 'glintShow',
  glintHide: 'glintHide',
  loot: 'loot',
  inventory: 'inventory',
  chatMsg: 'chatMsg',
  notice: 'notice',
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

export interface ChatBroadcast {
  from: string;
  text: string;
  ts: number;
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
