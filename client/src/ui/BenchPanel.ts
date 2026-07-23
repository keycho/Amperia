import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { COSMETICS } from '@shared/cosmetics';
import { canCraft, repairQuote, type Recipe } from '@shared/crafting';
import { ITEMS, type ItemId } from '@shared/items';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { HEADER_H, kitButton, kitClampLines, kitHeader, kitPlate, kitText, SPACE } from './kit';

const PANEL_W = 520;
const ROW_H = 24;
/** Column geometry (F4): label | cost | button — nothing crosses a boundary. */
const COST_X = 216;
const BUTTON_W = 64;
const LABEL_W = COST_X - SPACE.md - SPACE.sm;
const COST_W = PANEL_W - 70 - SPACE.sm - COST_X;

/**
 * The Tinkerbench window: craft gear from recipes (Bolts + resources) and
 * mend worn gear. Tiers: Tinker → Brassbound → Coilworked. Comms rules:
 * costs and mends, never "earn".
 */
export class BenchPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);
    session.events.on(SessionEvents.openBench, () => this.setVisible(true));
  }

  /** Flow-computed on refresh; the pre-first-open value is an estimate. */
  private lastH = 0;

  pixelSize(): { w: number; h: number } {
    const recipes = CONFIG.gear.recipes.length;
    return { w: PANEL_W, h: this.lastH > 0 ? this.lastH : 106 + recipes * ROW_H + 40 + 6 * ROW_H };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  /**
   * F4 flow layout: recipe and mend rows are label | cost | button COLUMNS —
   * the label clamps to its column, the cost wraps inside its own (it used to
   * run 135px past the plate and under the craft button), and each row's
   * pitch is measured from its tallest cell. The plate takes the flowed height.
   */
  refresh(): void {
    this.container.removeAll(true);
    const w = PANEL_W;

    const txt = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      wrapW?: number,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
      if (wrapW !== undefined) {
        t.setWordWrapWidth(wrapW);
        kitClampLines(t, 2);
      }
      this.container.add(t);
      return t;
    };

    const top = HEADER_H + SPACE.sm;
    txt(SPACE.md, top, `Bolts: ${gameState.bolts}`, PALETTE.warmGlow);
    txt(SPACE.md, top + 22, 'CRAFT', PALETTE.neonAmber);
    let y = top + 44;

    (CONFIG.gear.recipes as readonly Recipe[]).forEach((r) => {
      const mats = Object.entries(r.materials)
        .map(([mid, q]) => `${q} ${mid}`)
        .join(' + ');
      const check = canCraft(r, gameState.bolts, (id) => gameState.count(id));
      // Cosmetic recipes (I3): wardrobe shine, zero stats — labeled honestly.
      const label = r.output.startsWith('cosmetic:')
        ? `${COSMETICS[r.output.slice(9)]?.label ?? r.output} (cosmetic)`
        : ITEMS[r.output as ItemId].name;
      const lt = txt(SPACE.md, y, label, UI_TEXT_WARM, LABEL_W);
      const ct = txt(COST_X, y, `${r.bolts} B + ${mats}`, check.ok ? PALETTE.warmGlow : PALETTE.neonRose, COST_W);
      if (check.ok) {
        this.container.add(
          kitButton(this.scene, w - 70, y, 'craft', {
            width: BUTTON_W,
            height: 22,
            primary: true,
            onClick: () => {
              if (session.room !== null) send.craft(session.room, { recipeId: r.id });
            },
          }),
        );
      }
      y += Math.max(Math.ceil(lt.height), Math.ceil(ct.height), 22) + 4;
    });

    y += 12;
    txt(SPACE.md, y, 'MEND — worn gear, from your belt and Pack', PALETTE.neonAmber);
    y += 22;
    let row = 0;
    const listGear = (source: 'hotbar' | 'pack', slots: typeof gameState.hotbar.slots) => {
      slots.forEach((slot, idx) => {
        if (slot === null || slot.durability === undefined || row >= 6) return;
        const def = ITEMS[slot.itemId];
        const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
        if (slot.durability >= max) return;
        row += 1;
        const quote = repairQuote(slot.itemId, max - slot.durability);
        const mats = quote.materials.map((m) => ` + ${m.qty} ${m.itemId}`).join('');
        const lt = txt(SPACE.md, y, `${def.name} (${slot.durability}/${max})`, UI_TEXT_WARM, LABEL_W);
        const ct = txt(COST_X, y, `${quote.bolts} B${mats}`, PALETTE.warmGlow, COST_W);
        this.container.add(
          kitButton(this.scene, w - 70, y, 'mend', {
            width: BUTTON_W,
            height: 22,
            primary: true,
            onClick: () => {
              if (session.room !== null) send.repair(session.room, { source, slot: idx });
            },
          }),
        );
        y += Math.max(Math.ceil(lt.height), Math.ceil(ct.height), 22) + 4;
      });
    };
    listGear('hotbar', gameState.hotbar.slots);
    listGear('pack', gameState.inventory.slots);
    if (row === 0) {
      txt(SPACE.md, y, 'Everything is good as built.', UI_TEXT_WARM);
      y += 22;
    }

    // Plate LAST (from the flowed height), slid underneath; header on top.
    this.lastH = y + SPACE.md;
    this.container.addAt(kitPlate(this.scene, w, this.lastH), 0);
    kitHeader(this.scene, this.container, w, 'The Tinkerbench — craft and mend', () =>
      this.setVisible(false),
    );
    // Recentre with the real height (layout() used the estimate).
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - w) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}
