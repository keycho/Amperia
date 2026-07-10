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
} as const;
