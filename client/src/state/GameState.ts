import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { addItem, countItem, makeInventory, transfer, type Inventory } from '@shared/inventory';
import type { ItemId } from '@shared/items';

/**
 * Client-side session state (single-player prototype). Mutations go through
 * methods that call the shared pure functions and emit change events for the
 * UI. When the server arrives (M2) this becomes a mirror of server state.
 */
export const GameEvents = {
  inventoryChanged: 'inventory:changed',
  hotbarChanged: 'hotbar:changed',
  loot: 'loot',
} as const;

class GameStateStore {
  readonly events = new Phaser.Events.EventEmitter();
  inventory: Inventory = makeInventory(CONFIG.inventory.slots);
  hotbar: Inventory = makeInventory(CONFIG.inventory.hotbarSlots);
  activeHotbarSlot = 0;

  /** Add loot; returns how much actually fit. */
  addItem(itemId: ItemId, qty: number): number {
    const r = addItem(this.inventory, itemId, qty, CONFIG.inventory.stackMax);
    this.inventory = r.inv;
    if (r.added > 0) {
      this.events.emit(GameEvents.inventoryChanged);
      this.events.emit(GameEvents.loot, { itemId, qty: r.added });
    }
    return r.added;
  }

  /** Total across pack + hotbar (what the player "has"). */
  count(itemId: ItemId): number {
    return countItem(this.inventory, itemId) + countItem(this.hotbar, itemId);
  }

  /** Move/merge/swap between inventory and/or hotbar containers. */
  moveStack(
    from: 'inventory' | 'hotbar',
    fromIdx: number,
    to: 'inventory' | 'hotbar',
    toIdx: number,
  ): void {
    const src = from === 'inventory' ? this.inventory : this.hotbar;
    const dst = to === 'inventory' ? this.inventory : this.hotbar;
    const r = transfer(src, fromIdx, dst, toIdx, CONFIG.inventory.stackMax);
    if (from === 'inventory') this.inventory = r.src;
    else this.hotbar = r.src;
    if (to === 'inventory') this.inventory = r.dst;
    else this.hotbar = r.dst;
    // Same-container moves: transfer() returns one shared object.
    if (from === to) {
      if (from === 'inventory') this.inventory = r.dst;
      else this.hotbar = r.dst;
    }
    this.events.emit(GameEvents.inventoryChanged);
    this.events.emit(GameEvents.hotbarChanged);
  }

  setActiveHotbarSlot(idx: number): void {
    this.activeHotbarSlot = idx;
    this.events.emit(GameEvents.hotbarChanged);
  }
}

export const gameState = new GameStateStore();
