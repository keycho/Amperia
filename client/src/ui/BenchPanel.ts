import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { COSMETICS } from '@shared/cosmetics';
import { canCraft, repairQuote, type Recipe } from '@shared/crafting';
import { ITEMS, rarityLabel, type ItemId } from '@shared/items';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { cosmeticThumbKey, itemThumbKey } from '../render/itemThumbs';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';
import { HEADER_H, kitButton, kitClampLines, kitHeader, kitPlate, kitText, SPACE, UIK, kitPanelPop } from './kit';

const PANEL_W = 560;
/** Master–detail lanes (F3): recipe list | the result showcase. */
const LIST_X = SPACE.md;
const LIST_W = 208;
const SHOW_X = LIST_X + LIST_W + SPACE.md;
const SHOW_W = PANEL_W - SHOW_X - SPACE.md;
const LIST_ROW = 32;

/** A recipe's display name + thumb key (cosmetic outputs live elsewhere). */
function recipeCard(r: Recipe): { name: string; flavor: string; thumb: string; tier: number } {
  if (r.output.startsWith('cosmetic:')) {
    const id = r.output.slice(9);
    return {
      name: `${COSMETICS[id]?.label ?? id} (cosmetic)`,
      flavor: 'Wardrobe shine, zero stats — worn, never wielded.',
      thumb: cosmeticThumbKey(id),
      tier: 0,
    };
  }
  const def = ITEMS[r.output as ItemId];
  return { name: def.name, flavor: def.flavor, thumb: itemThumbKey(def), tier: def.tier ?? 0 };
}

/**
 * The Tinkerbench window (F3): a master–detail crafting UI — the recipe
 * list on the left, the SELECTED result shown LARGE on the right (icon,
 * name, rarity read, flavor — stats-free), its ingredients as icon rows
 * with have/need counts (rose when short), and the craft button. Mending
 * keeps the F4 flow below. Comms rules: costs and mends, never "earn".
 */
export class BenchPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private selectedId: string | null = null;
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
    return { w: PANEL_W, h: this.lastH > 0 ? this.lastH : 120 + recipes * LIST_ROW + 120 };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    // F5: open/close through the one 120ms kit pop.
    kitPanelPop(this.scene, this.container, { w: PANEL_W, h: this.lastH }, v);
  }

  refresh(): void {
    this.container.removeAll(true);
    const recipes = CONFIG.gear.recipes as readonly Recipe[];
    const selected =
      recipes.find((r) => r.id === this.selectedId) ?? recipes[0] ?? null;
    this.selectedId = selected?.id ?? null;

    const txt = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      wrapW?: number,
      maxLines = 2,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
      if (wrapW !== undefined) {
        t.setWordWrapWidth(wrapW);
        kitClampLines(t, maxLines);
      }
      this.container.add(t);
      return t;
    };

    const top = HEADER_H + SPACE.sm;
    txt(LIST_X, top, `Bolts: ${gameState.bolts}`, PALETTE.warmGlow);

    // ── the recipe list (master) ────────────────────────────────────────
    txt(LIST_X, top + 22, 'CRAFT', PALETTE.neonAmber);
    let listY = top + 44;
    for (const r of recipes) {
      const card = recipeCard(r);
      const check = canCraft(r, gameState.bolts, (id) => gameState.count(id));
      const on = r.id === this.selectedId;
      const rowY = listY;
      if (on) {
        const pill = this.scene.add.graphics();
        pill.fillStyle(mixPalette('neonAmber', 'structureMid', 0.55), 0.35);
        pill.fillRoundedRect(LIST_X - 6, rowY - 3, LIST_W + 8, LIST_ROW - 2, 7);
        pill.lineStyle(1, PALETTE_INT.neonAmber, 0.7);
        pill.strokeRoundedRect(LIST_X - 6, rowY - 3, LIST_W + 8, LIST_ROW - 2, 7);
        this.container.add(pill);
      }
      const icon = this.scene.add.image(LIST_X + 13, rowY + 13, card.thumb);
      icon.setDisplaySize(26, 26);
      this.container.add(icon);
      const name = txt(
        LIST_X + 30,
        rowY + 5,
        card.name,
        on ? PALETTE.warmGlow : check.ok ? UI_TEXT_WARM : PALETTE.groundAccent,
        LIST_W - 34,
        1,
      );
      name.setFontStyle(on ? 'bold' : 'normal');
      // The whole row selects.
      const zone = this.scene.add.zone(LIST_X - 6, rowY - 3, LIST_W + 8, LIST_ROW - 2);
      zone.setOrigin(0, 0);
      zone.setInteractive({ useHandCursor: true });
      zone.on(
        'pointerdown',
        (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          sound.uiClick();
          this.selectedId = r.id;
          this.refresh();
        },
      );
      this.container.add(zone);
      listY += LIST_ROW;
    }

    // ── the result showcase (detail) ────────────────────────────────────
    let showY = top + 22;
    if (selected !== null) {
      const card = recipeCard(selected);
      const check = canCraft(selected, gameState.bolts, (id) => gameState.count(id));
      // Lane divider.
      const div = this.scene.add.graphics();
      div.lineStyle(1, UIK.border, 0.85);
      div.beginPath();
      div.moveTo(SHOW_X - SPACE.sm, top + 20);
      div.lineTo(SHOW_X - SPACE.sm, top + 20 + Math.max(288, recipes.length * LIST_ROW));
      div.strokePath();
      this.container.add(div);

      // The result, LARGE: halo + icon + name + rarity read + flavor.
      const cx = SHOW_X + SHOW_W / 2;
      const halo = this.scene.add
        .image(cx, showY + 44, 'fx-glow')
        .setTint(PALETTE_INT.neonAmber)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.42)
        .setAlpha(0.4);
      this.container.add(halo);
      const big = this.scene.add.image(cx, showY + 44, card.thumb);
      big.setDisplaySize(80, 80);
      this.container.add(big);
      showY += 96;
      const name = txt(cx, showY, card.name, PALETTE.neonAmber, SHOW_W - 8, 1);
      name.setOrigin(0.5, 0);
      name.setFontStyle('bold');
      showY += Math.ceil(name.height) + 2;
      const rarity = selected.output.startsWith('cosmetic:')
        ? 'cosmetic · wardrobe'
        : `${ITEMS[selected.output as ItemId].category} · ${rarityLabel(ITEMS[selected.output as ItemId])}`;
      const tag = txt(cx, showY, rarity, PALETTE.neonTeal, SHOW_W - 8, 1);
      tag.setOrigin(0.5, 0);
      showY += Math.ceil(tag.height) + 4;
      const flavor = txt(cx, showY, card.flavor, UI_TEXT_WARM, SHOW_W - 12, 2);
      flavor.setOrigin(0.5, 0);
      flavor.setAlign('center');
      flavor.setAlpha(0.85);
      showY += Math.ceil(flavor.height) + 10;

      // Ingredients: icon rows with have/need, rose when short.
      const boltsShort = gameState.bolts < selected.bolts;
      const boltsLine = txt(
        SHOW_X + 6,
        showY,
        `⚙ ${Math.min(gameState.bolts, selected.bolts)}/${selected.bolts} Bolts`,
        boltsShort ? PALETTE.neonRose : PALETTE.warmGlow,
        SHOW_W - 12,
        1,
      );
      showY += Math.ceil(boltsLine.height) + 6;
      for (const [mid, need] of Object.entries(selected.materials)) {
        const def = ITEMS[mid as ItemId];
        const have = gameState.count(mid as ItemId);
        const short = have < need;
        const ic = this.scene.add.image(SHOW_X + 17, showY + 10, itemThumbKey(def));
        ic.setDisplaySize(22, 22);
        if (short) ic.setAlpha(0.6);
        this.container.add(ic);
        const line = txt(
          SHOW_X + 32,
          showY + 3,
          `${Math.min(have, need)}/${need} ${def.name}`,
          short ? PALETTE.neonRose : PALETTE.warmGlow,
          SHOW_W - 38,
          1,
        );
        showY += Math.max(24, Math.ceil(line.height) + 8);
      }
      showY += 6;
      this.container.add(
        kitButton(this.scene, SHOW_X + 6, showY, check.ok ? 'craft it' : 'short on parts', {
          width: SHOW_W - 12,
          height: 30,
          primary: check.ok,
          onClick: () => {
            if (check.ok && session.room !== null) {
              send.craft(session.room, { recipeId: selected.id });
            }
          },
        }),
      );
      showY += 38;
    }

    // ── mend (the F4 flow, full width below both lanes) ─────────────────
    let y = Math.max(listY, showY) + SPACE.md;
    const mendDiv = this.scene.add.graphics();
    mendDiv.lineStyle(1, UIK.border, 0.85);
    mendDiv.beginPath();
    mendDiv.moveTo(SPACE.md, y - 6);
    mendDiv.lineTo(PANEL_W - SPACE.md, y - 6);
    mendDiv.strokePath();
    this.container.add(mendDiv);
    txt(SPACE.md, y, 'MEND — worn gear, from your belt and Pack', PALETTE.neonAmber);
    y += 22;
    let row = 0;
    const COST_X = 236;
    const listGear = (source: 'hotbar' | 'pack', slots: typeof gameState.hotbar.slots) => {
      slots.forEach((slot, idx) => {
        if (slot === null || slot.durability === undefined || row >= 6) return;
        const def = ITEMS[slot.itemId];
        const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
        if (slot.durability >= max) return;
        row += 1;
        const quote = repairQuote(slot.itemId, max - slot.durability);
        const mats = quote.materials.map((m) => ` + ${m.qty} ${ITEMS[m.itemId as ItemId].name}`).join('');
        const lt = txt(SPACE.md, y, `${def.name} (${slot.durability}/${max})`, UI_TEXT_WARM, COST_X - SPACE.md - 8, 2);
        const ct = txt(COST_X, y, `${quote.bolts} B${mats}`, PALETTE.warmGlow, PANEL_W - 78 - SPACE.sm - COST_X, 2);
        this.container.add(
          kitButton(this.scene, PANEL_W - 78, y, 'mend', {
            width: 64,
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
    this.container.addAt(kitPlate(this.scene, PANEL_W, this.lastH), 0);
    kitHeader(this.scene, this.container, PANEL_W, 'The Tinkerbench — craft and mend', () =>
      this.setVisible(false),
    );
    // Recentre with the real height (layout() used the estimate).
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - PANEL_W) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}
