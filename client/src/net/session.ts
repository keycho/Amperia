import Phaser from 'phaser';
import type { FilamentRoom } from './NetClient';

/**
 * The active room connection + a client-side event bus for net events that
 * cross scenes (chat, presence, notices). Set on join, cleared on leave.
 */
export const session: {
  room: FilamentRoom | null;
  events: Phaser.Events.EventEmitter;
  /**
   * C2: true while the Spark is within reach of a world interactable, so the
   * E key interacts (handled in WorldScene) instead of opening the emote
   * wheel (UIScene). WorldScene refreshes this every frame.
   */
  eInteractActive: boolean;
  /**
   * F1: true while any UI panel (merchant, bank, manifest, map, …) is open.
   * UIScene refreshes this every frame; the camera wheel-zoom stands down so
   * a wheel over a panel never zooms the world behind it.
   */
  panelOpen: boolean;
} = {
  room: null,
  events: new Phaser.Events.EventEmitter(),
  eInteractActive: false,
  panelOpen: false,
};

export const SessionEvents = {
  chat: 'chat',
  presence: 'presence',
  notice: 'notice',
  /** Own Spark's HP changed: payload { hp, maxHp }. */
  hp: 'hp',
  /** Merchant unit prices changed: payload PricesSync. */
  prices: 'prices',
  /** Open the merchant panel (world → UI scene). */
  openMerchant: 'openMerchant',
  /** Open the Cosmetic Foundry (premium shop showcase). */
  openFoundry: 'openFoundry',
  /** Open the Tinkerbench panel (world → UI scene). */
  openBench: 'openBench',
  /** Open the Amped Bar menu (world → UI scene, city-life L2). */
  openBar: 'openBar',
  /** L3: the menu's take-a-seat — WorldScene walks to a stool + sits. */
  takeSeat: 'takeSeat',
  /** Open the Dispatcher's quest board (world → UI scene). */
  openQuests: 'openQuests',
  /** Personal quest log sync: payload QuestsSync. */
  quests: 'quests',
  /** F3: a craft landed — payload CraftedEvent (drives the result card). */
  crafted: 'crafted',
  /** HUD tracker line for the first active quest (string). */
  questTracker: 'questTracker',
  /** Direct trade flow (world → UI scene): payloads from @shared/protocol. */
  tradeAsk: 'tradeAsk',
  tradeSync: 'tradeSync',
  tradeEnd: 'tradeEnd',
  /** Shop stall detail answered by the server: payload ShopSyncEvent. */
  shopSync: 'shopSync',
  /** Synced Charge meter changed: payload ChargeStateShape. */
  charge: 'charge',
  /** Charge detail (meter + leaderboard): payload ChargeSyncEvent. */
  chargeSync: 'chargeSync',
  /** Open the wardrobe (limited creator) — /wardrobe chat command. */
  openWardrobe: 'openWardrobe',
  /** Identity snapshot / creator save result: payload IdentityEvent. */
  identity: 'identity',
  /** Another Spark's inspect card facts: payload InspectInfoEvent. */
  inspect: 'inspect',
  /** Manifest sync on join: payload ManifestSync (S1). */
  manifest: 'manifest',
  /** A Manifest tick / first discovery: payload ManifestFoundEvent. */
  manifestFound: 'manifestFound',
  /** Weekly goal board state (S2): payload GoalsSync (rows may be partial). */
  goals: 'goals',
  /** Rested Charge state (S3): payload RestedSync. */
  rested: 'rested',
  /** Ledgerhouse vault state (S5): payload BankSync. */
  bank: 'bank',
  /** H1: a brand-new Spark finished the creator — show the intro cards. */
  howToPlay: 'howToPlay',
  /** R3: First-Bolts checklist model → UIScene. Payload TutorialModel. */
  tutorial: 'tutorial',
  /** R3: one-line unlock/announce toast during the guided first loop. */
  tutorialToast: 'tutorialToast',
  /** R6b: a rare CENTER-STAGE banner (level-ups, first Bolts). Payload
   *  { text, sub? }; the UI rate-limits these to at most one a minute. */
  banner: 'banner',
  /** U3d: you went down — payload the youDown combat event. */
  deathRecap: 'deathRecap',
  /** F5: loot landed — fly a thumb chip from the node's screen point to the
   *  hotbar. Payload { itemId, sx, sy } (screen coords from WorldScene). */
  lootChipFly: 'lootChipFly',
  /** Map M3: live seated-Spark counts per district. Payload CityPresenceEvent. */
  cityPresence: 'cityPresence',
} as const;
