import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session } from '../net/session';
import { gameState, GameEvents } from '../state/GameState';
import { SlotStrip } from '../ui/SlotStrip';

interface DragState {
  strip: SlotStrip;
  slotIdx: number;
  ghost: Phaser.GameObjects.Image;
  ghostCount: Phaser.GameObjects.Text;
}

/**
 * Screen-space UI: the Pack (inventory) panel, the hotbar, and the loot chip.
 * `I` toggles the Pack, Esc closes the top panel, 1-6 select hotbar slots,
 * dragging moves/merges/swaps stacks between any two slots.
 */
export class UIScene extends Phaser.Scene {
  private inventoryPanel!: SlotStrip;
  private hotbar!: SlotStrip;
  private drag: DragState | null = null;
  private lootChip!: Phaser.GameObjects.Text;

  constructor() {
    super('ui');
  }

  create(): void {
    const onStripPointerDown = (strip: SlotStrip, pointer: Phaser.Input.Pointer) =>
      this.beginDrag(strip, pointer);

    this.hotbar = new SlotStrip(
      this,
      'hotbar',
      { cols: CONFIG.inventory.hotbarSlots, rows: 1 },
      onStripPointerDown,
    );
    this.inventoryPanel = new SlotStrip(
      this,
      'inventory',
      { cols: 6, rows: CONFIG.inventory.slots / 6, title: 'Pack', panel: true },
      onStripPointerDown,
    );
    this.inventoryPanel.setVisible(false);
    this.hotbar.setActiveSlot(gameState.activeHotbarSlot);

    this.lootChip = this.add.text(12, 10, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: UI_TEXT_WARM,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.lootChip.setDepth(900);

    this.layout();
    this.refreshAll();
    this.scale.on('resize', () => this.layout());
    gameState.events.on(GameEvents.inventoryChanged, () => this.refreshAll());
    gameState.events.on(GameEvents.hotbarChanged, () => this.refreshAll());

    this.setupKeys();
    this.setupDragHandlers();
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const hb = this.hotbar.pixelSize();
    this.hotbar.setPosition((w - hb.w) / 2, h - hb.h - 12);
    const inv = this.inventoryPanel.pixelSize();
    this.inventoryPanel.setPosition((w - inv.w) / 2, (h - inv.h) / 2 - 20);
    this.refreshAll();
  }

  private refreshAll(): void {
    this.hotbar.setActiveSlot(gameState.activeHotbarSlot);
    this.hotbar.refresh(
      gameState.hotbar,
      this.drag !== null && this.drag.strip.source === 'hotbar' ? this.drag.slotIdx : null,
    );
    this.inventoryPanel.refresh(
      gameState.inventory,
      this.drag !== null && this.drag.strip.source === 'inventory' ? this.drag.slotIdx : null,
    );
    const salvage = gameState.count('salvage');
    const gilded = gameState.count('gildedScrap');
    this.lootChip.setText(
      `${ITEMS.salvage.name} × ${salvage}` +
        (gilded > 0 ? `   ${ITEMS.gildedScrap.name} × ${gilded}` : ''),
    );
  }

  private setupKeys(): void {
    const kb = this.input.keyboard;
    if (kb === null) return;
    kb.on('keydown-I', () => {
      this.inventoryPanel.setVisible(!this.inventoryPanel.visible);
    });
    kb.on('keydown-ESC', () => {
      if (this.inventoryPanel.visible) this.inventoryPanel.setVisible(false);
    });
    const keyNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    keyNames.slice(0, CONFIG.inventory.hotbarSlots).forEach((name, i) => {
      kb.on(`keydown-${name}`, () => gameState.setActiveHotbarSlot(i));
    });
  }

  private beginDrag(strip: SlotStrip, pointer: Phaser.Input.Pointer): void {
    const idx = strip.slotIndexAt(pointer.x, pointer.y);
    if (idx === null) return;
    const inv = strip.source === 'inventory' ? gameState.inventory : gameState.hotbar;
    const stack = inv.slots[idx];
    if (stack === null || stack === undefined) return;

    const ghost = this.add.image(pointer.x, pointer.y, ITEMS[stack.itemId].icon);
    ghost.setDisplaySize(44, 44);
    ghost.setAlpha(0.85);
    ghost.setDepth(2000);
    const ghostCount = this.add.text(pointer.x + 18, pointer.y + 20, String(stack.qty), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
    });
    ghostCount.setOrigin(1, 1);
    ghostCount.setDepth(2001);
    this.drag = { strip, slotIdx: idx, ghost, ghostCount };
    this.refreshAll();
  }

  private setupDragHandlers(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      this.drag.ghost.setPosition(pointer.x, pointer.y);
      this.drag.ghostCount.setPosition(pointer.x + 18, pointer.y + 20);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      const d = this.drag;
      this.drag = null;
      d.ghost.destroy();
      d.ghostCount.destroy();

      const targets: SlotStrip[] = [this.inventoryPanel, this.hotbar];
      for (const strip of targets) {
        if (!strip.visible) continue;
        const idx = strip.slotIndexAt(pointer.x, pointer.y);
        if (idx !== null && session.room !== null) {
          // Server-authoritative: send the intent; the echo re-renders.
          send.moveStack(session.room, {
            from: d.strip.source === 'inventory' ? 'pack' : 'hotbar',
            fromIdx: d.slotIdx,
            to: strip.source === 'inventory' ? 'pack' : 'hotbar',
            toIdx: idx,
          });
          this.refreshAll();
          return;
        }
      }
      // Dropped nowhere: no change.
      this.refreshAll();
    });
  }
}
