import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { countItem, makeInventory, type Inventory } from '@shared/inventory';
import type { ItemId } from '@shared/items';
import { makeSkillXp, SKILLS, type SkillId, type SkillXp } from '@shared/mastery';
import type { InventorySync, SkillsSync } from '@shared/protocol';

/**
 * Client mirror of server-authoritative state. The server owns inventories;
 * the client renders the last sync and sends intents. Only pure UI
 * preferences (active hotbar slot) live client-side.
 */
export const GameEvents = {
  inventoryChanged: 'inventory:changed',
  hotbarChanged: 'hotbar:changed',
  skillsChanged: 'skills:changed',
} as const;

class GameStateStore {
  readonly events = new Phaser.Events.EventEmitter();
  inventory: Inventory = makeInventory(CONFIG.inventory.slots);
  hotbar: Inventory = makeInventory(CONFIG.inventory.hotbarSlots);
  skills: SkillXp = makeSkillXp();
  activeHotbarSlot = 0;

  applySkills(sync: SkillsSync): void {
    for (const skill of SKILLS) {
      const v = sync.xp[skill];
      if (typeof v === 'number') this.skills[skill as SkillId] = v;
    }
    this.events.emit(GameEvents.skillsChanged);
  }

  applySync(sync: InventorySync): void {
    this.inventory = { slots: [...sync.pack] };
    this.hotbar = { slots: [...sync.hotbar] };
    this.events.emit(GameEvents.inventoryChanged);
    this.events.emit(GameEvents.hotbarChanged);
  }

  /** Total across pack + hotbar (what the player "has"). */
  count(itemId: ItemId): number {
    return countItem(this.inventory, itemId) + countItem(this.hotbar, itemId);
  }

  setActiveHotbarSlot(idx: number): void {
    this.activeHotbarSlot = idx;
    this.events.emit(GameEvents.hotbarChanged);
  }
}

export const gameState = new GameStateStore();
