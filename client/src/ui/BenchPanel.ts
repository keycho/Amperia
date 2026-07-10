import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { canCraft, repairQuote, type Recipe } from '@shared/crafting';
import { ITEMS, type ItemId } from '@shared/items';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';

const PANEL_W = 520;
const ROW_H = 24;

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

  pixelSize(): { w: number; h: number } {
    const recipes = CONFIG.gear.recipes.length;
    return { w: PANEL_W, h: 96 + recipes * ROW_H + 40 + 6 * ROW_H };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  refresh(): void {
    this.container.removeAll(true);

    const { w, h } = this.pixelSize();
    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.94);
    g.fillRoundedRect(0, 0, w, h, 10);
    g.lineStyle(2, PALETTE_INT.neonTeal, 0.6);
    g.strokeRoundedRect(0, 0, w, h, 10);
    this.container.add(g);

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      onClick?: () => void,
    ): void => {
      const t = this.scene.add.text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color,
      });
      if (onClick !== undefined) {
        t.setInteractive({ useHandCursor: true });
        t.on(
          'pointerdown',
          (_p: unknown, _lx: unknown, _ly: unknown, ev: { stopPropagation(): void }) => {
            ev.stopPropagation();
            onClick();
          },
        );
        t.on('pointerover', () => t.setColor(PALETTE.neonTeal));
        t.on('pointerout', () => t.setColor(color));
      }
      this.container.add(t);
    };

    add(16, 12, 'The Tinkerbench — craft and mend', PALETTE.neonTeal);
    add(w - 90, 12, '[close]', UI_TEXT_WARM, () => this.setVisible(false));
    add(16, 34, `Bolts: ${gameState.bolts}`, PALETTE.warmGlow);
    add(16, 56, 'CRAFT', PALETTE.neonAmber);

    (CONFIG.gear.recipes as readonly Recipe[]).forEach((r, i) => {
      const y = 78 + i * ROW_H;
      const mats = Object.entries(r.materials)
        .map(([mid, q]) => `${q} ${mid}`)
        .join(' + ');
      const check = canCraft(r, gameState.bolts, (id) => gameState.count(id));
      add(16, y, ITEMS[r.output as ItemId].name, UI_TEXT_WARM);
      add(216, y, `${r.bolts} B + ${mats}`, check.ok ? PALETTE.warmGlow : PALETTE.neonRose);
      if (check.ok) {
        add(w - 70, y, '[craft]', PALETTE.neonTeal, () => {
          if (session.room !== null) send.craft(session.room, { recipeId: r.id });
        });
      }
    });

    const mendY = 78 + CONFIG.gear.recipes.length * ROW_H + 12;
    add(16, mendY, 'MEND — worn gear, from your belt and Pack', PALETTE.neonAmber);
    let row = 0;
    const listGear = (source: 'hotbar' | 'pack', slots: typeof gameState.hotbar.slots) => {
      slots.forEach((slot, idx) => {
        if (slot === null || slot.durability === undefined || row >= 6) return;
        const def = ITEMS[slot.itemId];
        const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
        if (slot.durability >= max) return;
        const y = mendY + 22 + row * ROW_H;
        row += 1;
        const quote = repairQuote(slot.itemId, max - slot.durability);
        const mats = quote.materials.map((m) => ` + ${m.qty} ${m.itemId}`).join('');
        add(16, y, `${def.name} (${slot.durability}/${max})`, UI_TEXT_WARM);
        add(280, y, `${quote.bolts} B${mats}`, PALETTE.warmGlow);
        add(w - 70, y, '[mend]', PALETTE.neonTeal, () => {
          if (session.room !== null) send.repair(session.room, { source, slot: idx });
        });
      });
    };
    listGear('hotbar', gameState.hotbar.slots);
    listGear('pack', gameState.inventory.slots);
    if (row === 0) add(16, mendY + 22, 'Everything is good as built.', UI_TEXT_WARM);
  }
}
