import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS, rarityLabel, type ItemDef } from '@shared/items';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { fullDurability, stackFor, type Inventory } from '@shared/inventory';
import { itemThumbKey } from '../render/itemThumbs';
import { gameState } from '../state/GameState';
import { tooltip } from './Tooltip';
import { kitPanelPop, kitPlate, kitText } from './kit';

export const SLOT_SIZE = 52;
export const SLOT_GAP = 7;

export interface SlotStripOptions {
  cols: number;
  rows: number;
  title?: string;
  /** Draw a panel behind the slots. */
  panel?: boolean;
  /** F2: a small header action (the Pack's sort button). */
  headerAction?: { label: string; onClick(): void };
}

/** Rarity edge-glow color for a filled slot (I4): Manifest rares amber,
 *  Brassbound warm ochre, Coilworked teal, plain gear none. */
function rarityGlow(def: ItemDef): number | null {
  if (def.rare === true) return PALETTE_INT.neonAmber;
  if (def.tier === 3) return PALETTE_INT.neonTeal;
  if (def.tier === 2) return mixPalette('neonAmber', 'groundAccent', 0.35);
  return null;
}

/**
 * A grid of item slots (inventory panel or hotbar): Kenney 9-slice chrome
 * re-tinted to the palette (never stock-colored), voxel-baked thumbnails on
 * plum cards, empty slots as dim insets, rarity edge-glow on filled ones.
 * Pure view — the scene owns drag logic and calls refresh() with data.
 */
export class SlotStrip {
  readonly container: Phaser.GameObjects.Container;
  readonly source: 'inventory' | 'hotbar';
  private readonly sceneRef: Phaser.Scene;
  private readonly opts: SlotStripOptions;
  private bg!: Phaser.GameObjects.Graphics;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly insets: Phaser.GameObjects.NineSlice[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private activeSlot = -1;
  private slotCount: number;
  /** F5 hover state: the slot under the pointer lifts a shade. */
  private hoverSlot = -1;
  private lastInv: Inventory | null = null;
  private lastHidden: number | null = null;

  constructor(
    scene: Phaser.Scene,
    source: 'inventory' | 'hotbar',
    opts: SlotStripOptions,
    onPointerDown: (strip: SlotStrip, pointer: Phaser.Input.Pointer) => void,
  ) {
    this.source = source;
    this.sceneRef = scene;
    this.opts = opts;
    this.slotCount = opts.cols * opts.rows;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(source === 'hotbar' ? 1000 : 1100);

    const { w, h } = this.pixelSize();
    // Panel chrome: Kenney 9-slice, ALWAYS re-tinted to the plum family.
    if (opts.panel === true) {
      const headroom = opts.title !== undefined ? 36 : 0;
      // PP1: the kit plate (was a tinted Kenney nineslice).
      const chrome = kitPlate(scene, w, h + headroom);
      chrome.setPosition(0, -headroom);
      this.container.add(chrome);
    }
    // Slot insets (dim when empty, lit when filled/active).
    const cellSize = SLOT_SIZE + SLOT_GAP;
    for (let i = 0; i < this.slotCount; i++) {
      const inset = scene.add.nineslice(
        SLOT_GAP + (i % opts.cols) * cellSize,
        SLOT_GAP + Math.floor(i / opts.cols) * cellSize,
        'ui-slot-inset',
        undefined,
        SLOT_SIZE,
        SLOT_SIZE,
        10,
        10,
        10,
        10,
      );
      inset.setOrigin(0, 0);
      this.container.add(inset);
      this.insets.push(inset);
    }

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

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
    // U3c: hovering a stocked slot shows the item card.
    this.hitZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const idx = this.slotIndexAt(pointer.x, pointer.y);
      this.setHover(idx ?? -1);
      const inv = this.source === 'inventory' ? gameState.inventory : gameState.hotbar;
      const stack = idx === null ? null : (inv.slots[idx] ?? null);
      if (stack === null) {
        tooltip.hide();
        return;
      }
      const def = ITEMS[stack.itemId];
      const mx = pointer.event instanceof MouseEvent ? pointer.event.clientX : pointer.x;
      const my = pointer.event instanceof MouseEvent ? pointer.event.clientY : pointer.y;
      // F2 item card: category · rarity (+ wear for gear), flavor, then the
      // meta line — stack state and the merchant's posted unit price when
      // one exists. In-game Bolts prices are city facts, not price talk.
      const full = fullDurability(stack.itemId);
      const wear =
        stack.durability !== undefined && full !== undefined
          ? ` · ${stack.durability}/${full}`
          : '';
      const sub = `${def.category} · ${rarityLabel(def)}${wear}`;
      const meta: string[] = [];
      if (def.tool !== true) {
        meta.push(`stack ×${stack.qty} of ${stackFor(stack.itemId)}`);
      }
      const unit = gameState.prices[stack.itemId];
      if (unit !== undefined && unit > 0) {
        meta.push(`the Merchant pays ${unit} Bolts each`);
      }
      if (def.rare === true) meta.push('the Manifest remembers this');
      tooltip.show(mx, my, {
        title: def.name,
        sub,
        lines: [def.flavor, ...(meta.length > 0 ? [meta.join(' · ')] : [])],
        thumb: { scene: this.sceneRef, key: itemThumbKey(def) },
      });
    });
    this.hitZone.on('pointerout', () => {
      this.setHover(-1);
      tooltip.hide();
    });
    this.container.add(this.hitZone);

    for (let i = 0; i < this.slotCount; i++) {
      const icon = scene.add.image(0, 0, 'thumb:icon-salvage');
      icon.setVisible(false);
      const count = kitText(scene, 0, 0, '', 'body', { color: UI_TEXT_WARM });
      count.setOrigin(1, 1);
      count.setVisible(false);
      this.container.add(icon);
      this.container.add(count);
      this.icons.push(icon);
      this.counts.push(count);
    }

    if (opts.title !== undefined) {
      const title = kitText(scene, 12, -27, opts.title, 'heading', {
        color: PALETTE.neonAmber,
        bold: true,
      });
      this.container.add(title);
    }
    // F2: the header action (the Pack's ⇅ sort) rides the title row.
    if (opts.headerAction !== undefined) {
      const act = opts.headerAction;
      const label = kitText(scene, w - 12, -22, act.label, 'caption', {
        color: PALETTE.neonAmber,
        bold: true,
      }).setOrigin(1, 0);
      label.setInteractive({ useHandCursor: true });
      label.on('pointerover', () => label.setColor(PALETTE.warmGlow));
      label.on('pointerout', () => label.setColor(PALETTE.neonAmber));
      label.on(
        'pointerdown',
        (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          act.onClick();
        },
      );
      this.container.add(label);
    }

    // Hotbar slots show their key binding (1-6).
    if (source === 'hotbar') {
      const cell = SLOT_SIZE + SLOT_GAP;
      for (let i = 0; i < this.slotCount; i++) {
        const hint = kitText(scene, SLOT_GAP + i * cell + 6, SLOT_GAP + 4, String(i + 1), 'caption', {
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
    if (this.opts.panel !== true) {
      // The hotbar has no plate and never pops — it's always-on chrome.
      this.container.setVisible(visible);
    } else {
      // F5: the Pack opens/closes through the one 120ms kit pop. The plate
      // rides 36px above the container origin; the ~0.7px centre error from
      // folding that headroom into the size is invisible at 4% scale.
      const { w, h } = this.pixelSize();
      if (visible) this.container.setVisible(true);
      kitPanelPop(this.sceneRef, this.container, { w, h }, visible);
    }
    if (visible) this.hitZone.setInteractive();
    else {
      this.hitZone.disableInteractive();
      this.setHover(-1);
    }
  }

  /** F5 hover: retint just the slots that changed — no full redraw. */
  private setHover(idx: number): void {
    if (idx === this.hoverSlot) return;
    const prev = this.hoverSlot;
    this.hoverSlot = idx;
    this.tintInset(prev);
    this.tintInset(idx);
  }

  /** One slot's inset tint/alpha from active > hover > filled state. */
  private tintInset(i: number): void {
    const inset = this.insets[i];
    if (inset === undefined) return;
    const stack = this.lastInv?.slots[i];
    const filled = stack !== null && stack !== undefined && i !== this.lastHidden;
    const hovered = i === this.hoverSlot;
    inset.setTint(
      i === this.activeSlot
        ? mixPalette('neonAmber', 'structureMid', 0.45)
        : hovered && filled
          ? mixPalette('warmGlow', 'structureMid', 0.72)
          : mixPalette('ink', 'structureMid', hovered ? 0.4 : 0.55),
    );
    inset.setAlpha(filled ? 1 : hovered ? 0.7 : 0.5);
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

  /** Redraw slot states and populate thumbnails/counts from inventory. */
  refresh(inv: Inventory, hiddenSlot: number | null = null): void {
    this.lastInv = inv;
    this.lastHidden = hiddenSlot;
    const g = this.bg;
    g.clear();
    const cell = SLOT_SIZE + SLOT_GAP;
    for (let i = 0; i < this.slotCount; i++) {
      const cx = SLOT_GAP + (i % this.opts.cols) * cell;
      const cy = SLOT_GAP + Math.floor(i / this.opts.cols) * cell;
      const stack = inv.slots[i];
      const filled = stack !== null && stack !== undefined && i !== hiddenSlot;
      // Slot states (I4): EMPTY = dim inset · FILLED = lit card + glow.
      // Tint/alpha live in tintInset so the F5 hover lift shares the logic.
      this.tintInset(i);
      if (i === this.activeSlot) {
        g.lineStyle(2.5, PALETTE_INT.neonAmber, 1);
        g.strokeRoundedRect(cx - 1, cy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2, 9);
      }

      const icon = this.icons[i];
      const count = this.counts[i];
      if (icon === undefined || count === undefined) continue;
      if (filled) {
        const def = ITEMS[stack.itemId];
        // Voxel-baked thumbnail on its plum card (never a tint wash).
        icon.setTexture(itemThumbKey(def));
        icon.setPosition(cx + SLOT_SIZE / 2, cy + SLOT_SIZE / 2);
        icon.setDisplaySize(SLOT_SIZE - 8, SLOT_SIZE - 8);
        icon.setVisible(true);
        // Rarity edge-glow.
        const glow = rarityGlow(def);
        if (glow !== null) {
          g.lineStyle(4, glow, 0.22);
          g.strokeRoundedRect(cx + 1, cy + 1, SLOT_SIZE - 2, SLOT_SIZE - 2, 9);
          g.lineStyle(1.5, glow, 0.85);
          g.strokeRoundedRect(cx + 2.5, cy + 2.5, SLOT_SIZE - 5, SLOT_SIZE - 5, 8);
        }
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
