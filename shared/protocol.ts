import type { InventorySlot } from './inventory';
import type { ItemId } from './items';
import type { DistrictId } from './map';
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
  bar: 'bar',
  idle: 'idle',
  craft: 'craft',
  repair: 'repair',
  quest: 'quest',
  quests: 'quests',
  donate: 'donate',
  travel: 'travel',
  travelGo: 'travelGo',
  cityPresence: 'cityPresence',
  delivery: 'delivery',
  deliverySync: 'deliverySync',
  tend: 'tend',
  tendState: 'tendState',
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
  inspect: 'inspect',
  goalClaim: 'goalClaim',
  coilSpin: 'coilSpin',
  bank: 'bank',
  sortPack: 'sortPack',
  crafted: 'crafted',
  loftpod: 'loftpod',
  loftpodSync: 'loftpodSync',
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
  inspectInfo: 'inspectInfo',
  manifest: 'manifest',
  manifestFound: 'manifestFound',
  goals: 'goals',
  rested: 'rested',
  coilResult: 'coilResult',
  coilShow: 'coilShow',
  coilState: 'coilState',
  bankSync: 'bankSync',
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
  /** F2 split: move only this many (≤ stack). Omitted = the whole stack. */
  qty?: number;
}

/** Player → server (F2): sort the Pack — merge stacks, order by category. */
export interface SortPackIntent {
  target: 'pack';
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

/** Player → server: the Amped Bar (city-life L2). 'buy' pours one drink
 *  in hand; 'round' pours for every Spark at the bar (bigger sink, one
 *  toast). Purely visual/social — drinks never touch stats or inventory. */
export interface BarIntent {
  action: 'buy' | 'round';
  drinkId: string;
}

/** Player → server: start (or clear) a persistent idle loop (L3).
 *  Presentation only — the pose replicates so everyone sees it. */
export interface IdleIntent {
  pose: 'sit' | 'lean' | 'warm' | '';
}

/** Server → own client (F3): a craft landed — drives the result-card moment. */
export interface CraftedEvent {
  itemId: string;
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

/** Player → server: ride the tram to another district (Bolts toll per hop). */
export interface TravelIntent {
  to: DistrictId;
}

/** Server → player: leave this room and join the named district. */
export interface TravelGo {
  to: DistrictId;
}

/** Server → all: live seated-Spark counts per district (world map M3).
 *  Presence facts only — no value, no identities. */
export interface CityPresenceEvent {
  counts: Partial<Record<DistrictId, number>>;
}

/** U1a player → server: take a parcel at the post / drop it at the landing. */
export interface DeliveryIntent {
  action: 'take' | 'drop';
}

/** U1a server → player: your active parcel run (null dest = none). */
export interface DeliverySync {
  active: boolean;
  destId?: string;
  tower?: string;
  recipient?: string;
  line?: string;
  landing?: { x: number; y: number };
}

/** U1b player → server: start tending a planter / hit the bloom cue. */
export interface TendIntent {
  action: 'start' | 'cue';
  bed?: number;
}

/** U1b server → player: the tend channel began (cue lands at cueInMs). */
export interface TendStateEvent {
  bed: number;
  seconds: number;
  cueInMs: number;
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

/** Synced Loftpod display facts (D2b) as the client reads them. */
export interface LoftpodStateShape {
  berth: number;
  tier: number;
  dye: string;
  ownerName: string;
  trophyTitle: string;
  trophySkill: string;
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
  /** U4c: set on whispers — the target's Spark name. Delivered only to the
   *  two parties; never renders a public bubble. */
  whisperTo?: string;
}

export interface AttackIntent {
  mobId: string;
}

/** Combat happenings that need timing/feedback beyond schema sync. */
export type CombatEvent =
  | { type: 'mobBite'; mobId: string; sessionId: string; damage: number; hp: number }
  | { type: 'playerDown'; sessionId: string }
  | { type: 'playerHit'; mobId: string; bySessionId: string; damage: number; hp: number }
  | { type: 'mobDown'; mobId: string; bySessionId: string }
  | {
      /** U3d: sent to the fallen Spark only — the death recap's facts. */
      type: 'youDown';
      district: DistrictId;
      cacheBolts: number;
      cacheStacks: number;
    };

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

/** The social flourishes (U4b) — pure presentation, no gameplay effect. */
export type EmoteId = 'wave' | 'sit' | 'cheer' | 'point';

export const EMOTE_IDS: readonly EmoteId[] = ['wave', 'sit', 'cheer', 'point'];

export interface EmoteBroadcast {
  sessionId: string;
  from: string;
  emote: EmoteId;
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
/** Client → server: claim a completed weekly goal (S2). */
export interface GoalClaimIntent {
  goalId: string;
}

/**
 * Server → client (S2): the week's board state. Rows may be PARTIAL
 * (merge by goalId) on progress ticks; join sends everything. Clients
 * derive the goal list itself from shared/goals.ts + weekKey.
 */
export interface GoalsSync {
  weekKey: string;
  rows: Array<{ goalId: string; progress: number; claimed: boolean }>;
  claimsUsed?: number;
  tokens?: number;
}

/** Client → server (S5): Ledgerhouse actions — valid only in the hall. */
export type BankIntent =
  | { action: 'open' }
  | { action: 'deposit'; slot: number; qty: number }
  | { action: 'withdraw'; slot: number; qty: number }
  | { action: 'expand' };

/** Server → client (S5): the banked slots + expansion state. */
export interface BankSync {
  slots: Array<{ itemId: string; qty: number; durability?: number } | null>;
  slotCount: number;
  /** Bolts price of the next +8 expansion, or null at the cap. */
  nextCost: number | null;
}

/**
 * Client → server (D2b): Loftpod actions — Terrarium only, one pod per
 * Spark, everything display + sinks. /haul also routes here via chat.
 */
export type LoftpodIntent =
  | { action: 'place'; berth: number }
  | { action: 'haul'; berth: number }
  | { action: 'upgrade' }
  | { action: 'dye'; dye: string }
  | { action: 'trophy'; title?: string; skill?: string };

/** Server → client (D2b): your pod + what the next steps cost. */
export interface LoftpodSync {
  /** Your pod, or null if you haven't placed one. */
  pod: { berth: number; tier: number; dye: string; trophyTitle: string; trophySkill: string } | null;
  /** Berth indexes currently free (for place/haul pickers). */
  freeBerths: number[];
  /** Next upgrade cost, or null at tier cap. */
  nextUpgrade: { bolts: number; materials: Record<string, number> } | null;
  placeCostBolts: number;
  haulCostBolts: number;
  dyeCostBolts: number;
  dyes: string[];
  /** Titles you own (trophy picker) — server-validated on set. */
  titles: string[];
}

/**
 * Server → client: the spinner's Fortune Coil outcome (S4). The client
 * animates the wheel to `index`, then shows the prize. The wheel took no
 * currency — there is no field for one anywhere in this flow.
 */
export interface CoilResultEvent {
  index: number;
  label: string;
  kind: 'bolts' | 'item' | 'shard';
  amount: number;
  itemId?: string;
  converted: boolean;
  shards: number;
  shardsTarget: number;
}

/** Server → room (except spinner): a bystander-visible spin. */
export interface CoilShowEvent {
  sessionId: string;
  index: number;
}

/** Server → client on join: has today's free spin been used? */
export interface CoilStateEvent {
  spunToday: boolean;
  shards: number;
  shardsTarget: number;
}

/** Server → client (own client only): Rested Charge state (S3). */
export interface RestedSync {
  /** Boosted-gathering milliseconds left today (0 = spent). */
  msLeft: number;
  /** Gather-XP multiplier while rested (display only). */
  multiplier: number;
}

/** Server → client: full Manifest sync on join (S1). */
export interface ManifestSync {
  entries: Array<{ entryId: string; count: number; firstAtMs: number }>;
  titles: string[];
}

/** Server → client: a Manifest tick — first discoveries make the moment. */
export interface ManifestFoundEvent {
  entryId: string;
  count: number;
  first: boolean;
  newTitles: string[];
}

/** Client → server: look another Spark over (click-to-inspect, I5). */
export interface InspectIntent {
  sessionId: string;
}

/** Server → client: the inspect card's facts — all presentation-safe. */
export interface InspectInfoEvent {
  sessionId: string;
  sparkName: string;
  /** Crew system lands later — null renders the placeholder line. */
  crew: string | null;
  /** Latest Manifest title, or null. */
  title: string | null;
  appearance: string;
  equipped: string;
  /** Top Mastery lines, highest first (max 3, level ≥ 2). */
  topSkills: Array<{ skill: string; level: number }>;
}

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
  /** The drink riding in hand ('' = none) — presentation only (L2). */
  drink: string;
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
