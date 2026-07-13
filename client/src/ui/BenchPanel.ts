import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { COSMETICS } from '@shared/cosmetics';
import { canCraft, repairQuote, type Recipe } from '@shared/crafting';
import { ITEMS, type ItemId } from '@shared/items';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE } from './kit';

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
    return { w: PANEL_W, h: 106 + recipes * ROW_H + 40 + 6 * ROW_H };
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
    this.container.add(kitPlate(this.scene, w, h));
    kitHeader(this.scene, this.container, w, 'The Tinkerbench — craft and mend', () =>
      this.setVisible(false),
    );

    const txt = (x: number, y: number, text: string, color = UI_TEXT_WARM): void => {
      this.container.add(kitText(this.scene, x, y, text, 'body', { color }));
    };

    const top = HEADER_H + SPACE.sm;
    txt(SPACE.md, top, `Bolts: ${gameState.bolts}`, PALETTE.warmGlow);
    txt(SPACE.md, top + 22, 'CRAFT', PALETTE.neonAmber);

    (CONFIG.gear.recipes as readonly Recipe[]).forEach((r, i) => {
      const y = top + 44 + i * ROW_H;
      const mats = Object.entries(r.materials)
        .map(([mid, q]) => `${q} ${mid}`)
        .join(' + ');
      const check = canCraft(r, gameState.bolts, (id) => gameState.count(id));
      // Cosmetic recipes (I3): wardrobe shine, zero stats — labeled honestly.
      const label = r.output.startsWith('cosmetic:')
        ? `${COSMETICS[r.output.slice(9)]?.label ?? r.output} (cosmetic)`
        : ITEMS[r.output as ItemId].name;
      txt(SPACE.md, y, label, UI_TEXT_WARM);
      txt(216, y, `${r.bolts} B + ${mats}`, check.ok ? PALETTE.warmGlow : PALETTE.neonRose);
      if (check.ok) {
        this.container.add(
          kitButton(this.scene, w - 70, y, 'craft', {
            width: 64,
            height: 22,
            primary: true,
            onClick: () => {
              if (session.room !== null) send.craft(session.room, { recipeId: r.id });
            },
          }),
        );
      }
    });

    const mendY = top + 44 + CONFIG.gear.recipes.length * ROW_H + 12;
    txt(SPACE.md, mendY, 'MEND — worn gear, from your belt and Pack', PALETTE.neonAmber);
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
        txt(SPACE.md, y, `${def.name} (${slot.durability}/${max})`, UI_TEXT_WARM);
        txt(280, y, `${quote.bolts} B${mats}`, PALETTE.warmGlow);
        this.container.add(
          kitButton(this.scene, w - 70, y, 'mend', {
            width: 64,
            height: 22,
            primary: true,
            onClick: () => {
              if (session.room !== null) send.repair(session.room, { source, slot: idx });
            },
          }),
        );
      });
    };
    listGear('hotbar', gameState.hotbar.slots);
    listGear('pack', gameState.inventory.slots);
    if (row === 0) txt(SPACE.md, mendY + 22, 'Everything is good as built.', UI_TEXT_WARM);
  }
}
