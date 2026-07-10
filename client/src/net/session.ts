import Phaser from 'phaser';
import type { FilamentRoom } from './NetClient';

/**
 * The active room connection + a client-side event bus for net events that
 * cross scenes (chat, presence, notices). Set on join, cleared on leave.
 */
export const session: {
  room: FilamentRoom | null;
  events: Phaser.Events.EventEmitter;
} = {
  room: null,
  events: new Phaser.Events.EventEmitter(),
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
  /** Open the Tinkerbench panel (world → UI scene). */
  openBench: 'openBench',
  /** Open the Dispatcher's quest board (world → UI scene). */
  openQuests: 'openQuests',
  /** Personal quest log sync: payload QuestsSync. */
  quests: 'quests',
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
} as const;
