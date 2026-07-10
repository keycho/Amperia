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
  craft: 'craft',
  repair: 'repair',
  quest: 'quest',
  quests: 'quests',
  donate: 'donate',
  travel: 'travel',
  travelGo: 'travelGo',
  reclaim: 'reclaim',
  ptrade: 'ptrade',
  tradeAsk: 'tradeAsk',
  tradeSync: 'tradeSync',
  tradeEnd: 'tradeEnd',
  shop: 'shop',
  shopSync: 'shopSync',
  chargeInfo: 'chargeInfo',
  chargeSync: 'chargeSync',
  selectSlot: 'selectSlot',
  moveStack: 'moveStack',
  chat: 'chat',
  appearance: 'appearance',
  wardrobe: 'wardrobe',
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
  identity: 'identity',
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

/** Player → server: craft a recipe at the Tinkerbench. */
export interface CraftIntent {
  recipeId: string;
}

/** Player → server: repair gear at the Tinkerbench. */
export interface RepairIntent {
  source: 'pack' | 'hotbar';
  slot: number;
}

/** Player → server: accept or turn in a quest at the Dispatcher. */
export interface QuestIntent {
  action: 'accept' | 'turnIn';
  id: string;
}

/** Player → server: donate to the Charge Warden (future Citywide Charge). */
export interface DonateIntent {
  itemId: string;
  qty: number;
}

/** Server → player: the full personal quest log. */
export interface QuestsSync {
  log: Record<string, { state: string; progress: number; day?: string }>;
}

/** Player → server: ride the tram to another district (Bolts toll). */
export interface TravelIntent {
  to: 'filament' | 'tangle';
}

/** Server → player: leave this room and join the named district. */
export interface TravelGo {
  to: 'filament' | 'tangle';
}

/** Player → server: reclaim your Scrapcache (owner-only, small fee). */
export interface ReclaimIntent {
  cacheId: string;
}

/**
 * Player → server: direct trade flow. Staging references PACK slots (the
 * server snapshots itemId/durability itself — quantities and identities are
 * never client-trusted). Any offer change resets BOTH confirmations.
 */
export type PlayerTradeIntent =
  | { action: 'request'; targetSessionId: string }
  | { action: 'accept'; tradeId: string }
  | { action: 'decline'; tradeId: string }
  | { action: 'stage'; tradeId: string; bolts: number; items: Array<{ slot: number; qty: number }> }
  | { action: 'confirm'; tradeId: string }
  | { action: 'unconfirm'; tradeId: string }
  | { action: 'cancel'; tradeId: string };

/** Server → the invited player: someone offers to trade. */
export interface TradeAskEvent {
  tradeId: string;
  fromSessionId: string;
  fromName: string;
}

/** One side of a trade window as the client renders it. */
export interface TradeSideView {
  bolts: number;
  items: Array<{ itemId: ItemId; qty: number; durability?: number }>;
  confirmed: boolean;
}

/** Server → both traders: full window snapshot after every change. */
export interface TradeSyncEvent {
  tradeId: string;
  partnerName: string;
  you: TradeSideView;
  them: TradeSideView;
}

/** Server → both traders: the window closed (and why). */
export interface TradeEndEvent {
  tradeId: string;
  outcome: 'completed' | 'declined' | 'cancelled' | 'timeout' | 'disconnected' | 'failed';
  text: string;
}

/**
 * Player → server: shop stall actions (E2). Stocking references PACK slots
 * (the server snapshots the goods itself); everything else references the
 * stall's stock lines by index as last synced.
 */
export type ShopIntent =
  | { action: 'browse'; stallId: number }
  | { action: 'rent'; stallId: number }
  | { action: 'renew'; stallId: number }
  | { action: 'stock'; stallId: number; slot: number; qty: number; priceBolts: number }
  | { action: 'unstock'; stallId: number; lineIdx: number; qty: number }
  | { action: 'setPrice'; stallId: number; lineIdx: number; priceBolts: number }
  | { action: 'buy'; stallId: number; lineIdx: number; qty: number }
  | { action: 'collect'; stallId: number };

/** Server → the asking client: one stall's full detail for the shop panel. */
export interface ShopSyncEvent {
  stallId: number;
  ownerName: string;
  /** True when the asking Spark rents this stall (owner view). */
  mine: boolean;
  /** Epoch ms the rent runs out (null = vacant). */
  rentPaidUntilMs: number | null;
  stock: Array<{ itemId: ItemId; qty: number; priceBolts: number; durability?: number }>;
  /** Owner view only: uncollected sale proceeds. */
  cashboxBolts: number;
}

/** Mirror of the synced StallState schema (client-side typing only). */
export interface StallStateShape {
  ownerName: string;
  /** Up to three stocked item ids, comma-joined — counter presence props. */
  goods: string;
}

/**
 * Server → the asking client: the Citywide Charge in detail (the warden's
 * panel / the /charge command). The always-synced ChargeState carries the
 * meter for lighting; this adds the leaderboard.
 */
export interface ChargeSyncEvent {
  weekKey: string;
  total: number;
  tier: number;
  thresholds: number[];
  activePlayers: number;
  /** True while the weekend city buff glows. */
  buffActive: boolean;
  /** Gather-XP bonus percent while buffed. */
  buffPct: number;
  top: Array<{ sparkName: string; amperite: number }>;
}

/** Mirror of the synced ChargeState schema (client-side typing only). */
export interface ChargeStateShape {
  weekTotal: number;
  tier: number;
  t1: number;
  t2: number;
  t3: number;
  buffActive: boolean;
  buffPct: number;
}

/** Mirror of the synced CacheState schema (client-side typing only). */
export interface CacheStateShape {
  tileX: number;
  tileY: number;
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
/** Client → server: wear/remove cosmetics (full worn-state set). */
export interface WardrobeIntent {
  /** shared/cosmetics.ts wire form; server validates against OWNED. */
  equipped: string;
}

/** Client → server: creator confirm (name only settable on first login). */
export interface AppearanceIntent {
  code: string;
  name?: string;
}

/**
 * Server → client (own client only): identity snapshot on join + the
 * result of each appearance intent. chosen=false → show the creator.
 */
export interface IdentityEvent {
  appearance: string;
  sparkName: string;
  chosen: boolean;
  /** Cosmetics this Spark OWNS (wardrobe list) — all untradeable. */
  owned: string[];
  /** Worn wire form (shared/cosmetics.ts). */
  equipped: string;
  error?: string;
}

export interface PlayerStateShape {
  sparkName: string;
  tileX: number;
  tileY: number;
  gathering: boolean;
  /** Working-pose tool id while gathering ('' = none) — presentation only. */
  pose: string;
  /** Creator appearance code (shared/appearance.ts) — presentation only. */
  appearance: string;
  hp: number;
  maxHp: number;
  /** Worn wardrobe cosmetics (shared/cosmetics.ts wire) — never gameplay. */
  equipped: string;
  /** Name-glow trim id ('' = none) — Charge regalia, never gameplay. */
  trim: string;
}

export interface NodeStateShape {
  depleted: boolean;
}
