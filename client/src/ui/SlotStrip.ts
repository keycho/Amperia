import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { mixPalette, PALETTE_INT, UI_TEXT_WARM, type PaletteKey } from '@shared/palette';
import type { Inventory } from '@shared/inventory';

export const SLOT_SIZE = 52;
export const SLOT_GAP = 7;

export interface SlotStripOptions {
  cols: number;
  rows: number;
  title?: string;
  /** Draw a panel behind the slots. */
  panel?: boolean;
}

/**
 * A grid of item slots (inventory panel or hotbar) rendered warm-and-minimal:
 * structureMid panel, ink slots, neonAmber active highlight. Pure view — the
 * scene owns drag logic and calls refresh() with current inventory data.
 */
export class SlotStrip {
  readonly container: Phaser.GameObjects.Container;
  readonly source: 'inventory' | 'hotbar';
  private readonly opts: SlotStripOptions;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private activeSlot = -1;
  private slotCount: number;

  constructor(
    scene: Phaser.Scene,
    source: 'inventory' | 'hotbar',
    opts: SlotStripOptions,
    onPointerDown: (strip: SlotStrip, pointer: Phaser.Input.Pointer) => void,
  ) {
    this.source = source;
    this.opts = opts;
    this.slotCount = opts.cols * opts.rows;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(source === 'hotbar' ? 1000 : 1100);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    const { w, h } = this.pixelSize();
    this.hitZone = scene.add.zone(0, 0, w, h);
    this.hitZone.setOrigin(0, 0);
    this.hitZone.setInteractive();
    this.hitZone.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onPointerDown(this, pointer);
      },
    );
    this.container.add(this.hitZone);

    for (let i = 0; i < this.slotCount; i++) {
      const icon = scene.add.image(0, 0, 'icon-salvage');
      icon.setVisible(false);
      const count = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UI_TEXT_WARM,
      });
      count.setOrigin(1, 1);
      count.setVisible(false);
      this.container.add(icon);
      this.container.add(count);
      this.icons.push(icon);
      this.counts.push(count);
    }

    if (opts.title !== undefined) {
      const title = scene.add.text(12, -26, opts.title, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: UI_TEXT_WARM,
        fontStyle: 'bold',
      });
      this.container.add(title);
    }

    // Hotbar slots show their key binding (1-6).
    if (source === 'hotbar') {
      const cell = SLOT_SIZE + SLOT_GAP;
      for (let i = 0; i < this.slotCount; i++) {
        const hint = scene.add.text(SLOT_GAP + i * cell + 6, SLOT_GAP + 4, String(i + 1), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: UI_TEXT_WARM,
        });
        hint.setAlpha(0.85);
        this.container.add(hint);
      }
    }
  }

  pixelSize(): { w: number; h: number } {
    return {
      w: this.opts.cols * SLOT_SIZE + (this.opts.cols + 1) * SLOT_GAP,
      h: this.opts.rows * SLOT_SIZE + (this.opts.rows + 1) * SLOT_GAP,
    };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    if (visible) this.hitZone.setInteractive();
    else this.hitZone.disableInteractive();
  }

  get visible(): boolean {
    return this.container.visible;
  }

  /** Slot index under a screen point, or null. */
  slotIndexAt(px: number, py: number): number | null {
    const lx = px - this.container.x;
    const ly = py - this.container.y;
    const cell = SLOT_SIZE + SLOT_GAP;
    const cx = Math.floor((lx - SLOT_GAP) / cell);
    const cy = Math.floor((ly - SLOT_GAP) / cell);
    if (cx < 0 || cy < 0 || cx >= this.opts.cols || cy >= this.opts.rows) return null;
    // Inside the cell (not the gap)?
    const ox = lx - SLOT_GAP - cx * cell;
    const oy = ly - SLOT_GAP - cy * cell;
    if (ox > SLOT_SIZE || oy > SLOT_SIZE) return null;
    return cy * this.opts.cols + cx;
  }

  slotCenter(idx: number): { x: number; y: number } {
    const cell = SLOT_SIZE + SLOT_GAP;
    const cx = idx % this.opts.cols;
    const cy = Math.floor(idx / this.opts.cols);
    return {
      x: this.container.x + SLOT_GAP + cx * cell + SLOT_SIZE / 2,
      y: this.container.y + SLOT_GAP + cy * cell + SLOT_SIZE / 2,
    };
  }

  setActiveSlot(idx: number): void {
    this.activeSlot = idx;
  }

  /** Redraw panel + slots and populate icons/counts from inventory data. */
  refresh(inv: Inventory, hiddenSlot: number | null = null): void {
    const g = this.bg;
    const { w, h } = this.pixelSize();
    g.clear();
    if (this.opts.panel === true) {
      g.fillStyle(PALETTE_INT.structureMid, 0.94);
      g.fillRoundedRect(0, this.opts.title !== undefined ? -36 : 0, w, h + (this.opts.title !== undefined ? 36 : 0), 12);
      g.lineStyle(2, PALETTE_INT.ink, 1);
      g.strokeRoundedRect(0, this.opts.title !== undefined ? -36 : 0, w, h + (this.opts.title !== undefined ? 36 : 0), 12);
    }
    const cell = SLOT_SIZE + SLOT_GAP;
    for (let i = 0; i < this.slotCount; i++) {
      const cx = SLOT_GAP + (i % this.opts.cols) * cell;
      const cy = SLOT_GAP + Math.floor(i / this.opts.cols) * cell;
      g.fillStyle(mixPalette('ink', 'structureMid', 0.35), 0.9);
      g.fillRoundedRect(cx, cy, SLOT_SIZE, SLOT_SIZE, 8);
      if (i === this.activeSlot) {
        g.lineStyle(2.5, PALETTE_INT.neonAmber, 1);
        g.strokeRoundedRect(cx - 1, cy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2, 9);
      } else {
        g.lineStyle(1.5, mixPalette('ink', 'structureMid', 0.7), 0.8);
        g.strokeRoundedRect(cx, cy, SLOT_SIZE, SLOT_SIZE, 8);
      }

      const icon = this.icons[i];
      const count = this.counts[i];
      if (icon === undefined || count === undefined) continue;
      const stack = inv.slots[i];
      if (stack !== null && stack !== undefined && i !== hiddenSlot) {
        const def = ITEMS[stack.itemId];
        icon.setTexture(def.icon);
        if (def.iconTint !== undefined) icon.setTint(PALETTE_INT[def.iconTint as PaletteKey]);
        else icon.clearTint();
        icon.setPosition(cx + SLOT_SIZE / 2, cy + SLOT_SIZE / 2);
        icon.setDisplaySize(SLOT_SIZE - 12, SLOT_SIZE - 12);
        icon.setVisible(true);
        count.setPosition(cx + SLOT_SIZE - 4, cy + SLOT_SIZE - 2);
        count.setText(stack.qty > 1 ? String(stack.qty) : '');
        count.setVisible(true);
        // Durability sliver under gear: warm when healthy, rose when low.
        if (stack.durability !== undefined) {
          const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
          const frac = Math.max(0, Math.min(1, stack.durability / max));
          g.fillStyle(PALETTE_INT.ink, 0.85);
          g.fillRect(cx + 5, cy + SLOT_SIZE - 7, SLOT_SIZE - 10, 3);
          g.fillStyle(
            frac > 0.3 ? PALETTE_INT.warmGlow : PALETTE_INT.neonRose,
            0.95,
          );
          g.fillRect(cx + 5, cy + SLOT_SIZE - 7, Math.max(2, (SLOT_SIZE - 10) * frac), 3);
        }
      } else {
        icon.setVisible(false);
        count.setVisible(false);
      }
    }
  }
}
