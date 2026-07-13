import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM, type PaletteKey } from '@shared/palette';
import { COSMETICS, decodeEquipped } from '@shared/cosmetics';
import {
  daysUntil,
  FOUNDRY_CATALOG,
  RARITY_COLOR,
  VAULT_SOON_DAYS,
  type FoundryItem,
} from '@shared/foundry';
import { DEFAULT_APPEARANCE_CODE } from '@shared/appearance';
import type { IdentityEvent } from '@shared/protocol';
import { session, SessionEvents } from '../net/session';
import { bakeSparkAppearance, equipKey } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';
import { cosmeticThumbKey } from '../render/itemThumbs';
import { sound } from '../audio/sound';
import { HEADER_H, kitHeader, kitPlate, kitText, SPACE, type TypeLevel } from './kit';

const W = 812;
const H = 528;
const STAGE_W = 348; // the featured-stage column width
const FACINGS = ['sw', 'se', 'ne', 'nw'] as const;

/** Nearest kit type level for a legacy pixel size (locked scale 28/18/13/11). */
function levelForSize(size: number): TypeLevel {
  if (size >= 23) return 'display';
  if (size >= 16) return 'heading';
  if (size >= 12) return 'body';
  return 'caption';
}

/**
 * THE COSMETIC FOUNDRY — the premium shop, built to be screenshot-worthy on
 * its own. Left: a featured stage (the item on a slow turntable over a warm
 * radial glow, rarity + flavor + price + state). Right: the collection list.
 * Pure style, no stats, published time-scarcity (SEASONAL → VAULTED), no
 * FOMO mechanics, no randomness. Prices in $AMP; copy comms-compliant.
 */
export class FoundryPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  visible = false;

  private selected = 0;
  private appearance = DEFAULT_APPEARANCE_CODE;
  private equippedWire = '';
  private featured: Phaser.GameObjects.Image | null = null;
  private facing = 0;
  private turntable?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1180);
    this.container.setVisible(false);

    // The kit plate + header (the one design system).
    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'THE COSMETIC FOUNDRY', () => this.setVisible(false));
    // $AMP purse, top-right of the header. No $AMP exists yet (M4) → 0.
    const purse = kitText(scene, 0, 10, '◈ 0 $AMP', 'body', {
      color: PALETTE.violetNeon,
      bold: true,
    });
    purse.setX(W - purse.width - SPACE.xl);
    this.container.add(purse);
    // A hairline that splits the featured stage from the collection list.
    const split = scene.add.graphics();
    split.lineStyle(1, PALETTE_INT.warmGlow, 0.25);
    split.lineBetween(STAGE_W, HEADER_H + SPACE.md, STAGE_W, H - 40);
    this.container.add(split);

    session.events.on(SessionEvents.openFoundry, () => this.setVisible(true));
    session.events.on(SessionEvents.identity, (e: IdentityEvent) => {
      if (e.error !== undefined) return;
      this.appearance = e.appearance !== '' ? e.appearance : DEFAULT_APPEARANCE_CODE;
      this.equippedWire = e.equipped;
      if (this.visible) this.refresh();
    });
  }

  pixelSize(): { w: number; h: number } {
    return { w: W, h: H };
  }
  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }
  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) {
      const cam = this.scene.cameras.main;
      this.container.setPosition(Math.round((cam.width - W) / 2), Math.round((cam.height - H) / 2));
      this.refresh();
      this.turntable?.remove();
      this.turntable = this.scene.time.addEvent({
        delay: 1600,
        loop: true,
        callback: () => {
          this.facing = (this.facing + 1) % FACINGS.length;
          this.drawFeaturedSprite();
        },
      });
    } else {
      this.turntable?.remove();
      this.turntable = undefined;
    }
  }

  private hex(key: string): string {
    return PALETTE[key as PaletteKey] ?? UI_TEXT_WARM;
  }
  private rarityInt(item: FoundryItem): number {
    return PALETTE_INT[RARITY_COLOR[item.rarity] as PaletteKey] ?? PALETTE_INT.warmGlow;
  }

  private text(x: number, y: number, body: string, color: string, size = 12, bold = false) {
    const t = kitText(this.scene, x, y, body, levelForSize(size), { color, bold });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  /** available / SEASONAL (+ quiet vaults-in date) / VAULTED. */
  private badge(item: FoundryItem, now: number): { label: string; color: string } {
    if (item.state === 'vaulted') return { label: 'VAULTED', color: PALETTE.groundBase };
    if (item.state === 'seasonal') {
      if (item.vaultDate !== undefined) {
        const d = daysUntil(item.vaultDate, now);
        if (d <= VAULT_SOON_DAYS && d >= 0) {
          return { label: `SEASONAL · VAULTS IN ${d} DAY${d === 1 ? '' : 'S'}`, color: PALETTE.neonAmber };
        }
      }
      return { label: 'SEASONAL', color: PALETTE.neonTeal };
    }
    return { label: 'AVAILABLE', color: PALETTE.solarGreen };
  }

  private isWorn(item: FoundryItem): boolean {
    const def = COSMETICS[item.id];
    if (def === undefined) return false;
    return decodeEquipped(this.equippedWire)[def.slot] === item.id;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;
    // Destroy the featured sprite too so it re-adds ABOVE the fresh glow/disc.
    this.featured?.destroy();
    this.featured = null;
    const now = Date.now();

    // Header + $AMP purse are static kit chrome built once in the constructor.
    this.drawFeatured(now);
    this.drawList(now);

    // ── footer (S4 copy rule) ───────────────────────────────────────────
    const foot = this.text(0, H - 30, 'pure style · no stats · never pay-to-win', PALETTE.groundAccent, 12);
    foot.setX(Math.round((W - foot.width) / 2));
  }

  /** The featured stage: turntable Spark on a warm radial glow + copy. */
  private drawFeatured(now: number): void {
    const item = FOUNDRY_CATALOG[this.selected];
    if (item === undefined) return;
    const cx = Math.round(STAGE_W / 2);

    // Warm radial-glow backdrop + pedestal.
    for (const [scale, alpha, dy] of [[1.5, 0.16, 150], [0.9, 0.22, 250]] as const) {
      const g = this.scene.add.image(cx, dy, 'fx-glow');
      g.setTint(PALETTE_INT.warmGlow);
      g.setBlendMode(Phaser.BlendModes.ADD);
      g.setScale(scale);
      g.setAlpha(alpha);
      this.container.add(g);
      this.dynamic.push(g);
    }
    const disc = this.scene.add.graphics();
    disc.fillStyle(PALETTE_INT.duskSky, 0.9);
    disc.fillEllipse(cx, 300, 150, 40);
    disc.lineStyle(1.5, PALETTE_INT.neonAmber, 0.4);
    disc.strokeEllipse(cx, 300, 150, 40);
    this.container.add(disc);
    this.dynamic.push(disc);

    this.drawFeaturedSprite();

    // Rarity tag + name (in rarity colour) + flavor + price + state.
    const rarityColor = this.hex(RARITY_COLOR[item.rarity]);
    const def = COSMETICS[item.id];
    const tagY = 322;
    const tagBg = this.scene.add.graphics();
    const tagW = item.rarity.length * 9 + 18;
    tagBg.fillStyle(PALETTE_INT.ink, 0.6);
    tagBg.fillRoundedRect(cx - tagW / 2, tagY, tagW, 20, 6);
    tagBg.lineStyle(1.5, this.rarityInt(item), 0.7);
    tagBg.strokeRoundedRect(cx - tagW / 2, tagY, tagW, 20, 6);
    this.container.add(tagBg);
    this.dynamic.push(tagBg);
    const tag = this.text(0, tagY + 4, item.rarity.toUpperCase(), rarityColor, 11, true);
    tag.setX(Math.round(cx - tag.width / 2));

    const name = this.text(0, tagY + 26, def?.label ?? item.id, rarityColor, 17, true);
    name.setX(Math.round(cx - name.width / 2));

    const flavor = this.text(20, tagY + 52, item.flavor, UI_TEXT_WARM, 11);
    flavor.setWordWrapWidth(STAGE_W - 40);
    flavor.setAlpha(0.9);
    flavor.setAlign('center');
    flavor.setX(Math.round(cx - (STAGE_W - 40) / 2));

    const priceY = tagY + 52 + Math.max(30, flavor.height) + 8;
    const price = this.text(0, priceY, `◈ ${item.priceAmp} $AMP`, PALETTE.warmGlow, 15, true);
    price.setX(Math.round(cx - price.width / 2));

    const b = this.badge(item, now);
    const badge = this.text(0, priceY + 22, this.isWorn(item) ? 'WORN ✓' : b.label, this.isWorn(item) ? PALETTE.solarGreen : b.color, 12, true);
    badge.setX(Math.round(cx - badge.width / 2));
  }

  /** (Re)draw just the turntable Spark image wearing the featured item. */
  private drawFeaturedSprite(): void {
    const item = FOUNDRY_CATALOG[this.selected];
    if (item === undefined) return;
    const def = COSMETICS[item.id];
    if (def === undefined) return;
    // Bake the player's Spark wearing this one item (preview: all facings).
    const wire = `${def.slot}:${item.id}`;
    bakeSparkAppearance(this.scene, this.appearance, { previewOnly: true, equipped: wire });
    const eqKey = equipKey(decodeEquipped(wire));
    const baked = voxelSprite(`spark@${this.appearance}#${eqKey}-${FACINGS[this.facing]}`);
    const cx = Math.round(STAGE_W / 2);
    if (this.featured === null || !this.featured.active) {
      this.featured = this.scene.add.image(cx, 300, baked.key);
      this.featured.setOrigin(0.5, 1);
      this.container.add(this.featured);
    } else {
      this.featured.setTexture(baked.key);
    }
    // NEAREST upscale, feet on the pedestal, fit the stage.
    const tex = this.scene.textures.get(baked.key).getSourceImage();
    const scale = Math.min(4.5, (STAGE_W - 60) / tex.width, 240 / tex.height);
    this.featured.setScale(scale);
  }

  /** The collection list: icon · name · price · state badge, WORN ✓. */
  private drawList(now: number): void {
    const x0 = STAGE_W + 20;
    this.text(x0, 58, 'THE COLLECTION', PALETTE.warmGlow, 12, true);
    FOUNDRY_CATALOG.forEach((item, i) => {
      const y = 84 + i * 66;
      const def = COSMETICS[item.id];
      const vaulted = item.state === 'vaulted';
      const on = i === this.selected;

      const row = this.scene.add.graphics();
      row.fillStyle(on ? PALETTE_INT.neonAmber : PALETTE_INT.ink, on ? 0.14 : 0.3);
      row.fillRoundedRect(x0 - 6, y - 6, W - x0 - 14, 58, 8);
      if (on) {
        row.lineStyle(1.5, PALETTE_INT.neonAmber, 0.6);
        row.strokeRoundedRect(x0 - 6, y - 6, W - x0 - 14, 58, 8);
      }
      this.container.add(row);
      this.dynamic.push(row);

      // Icon.
      const icon = this.scene.add.image(x0 + 22, y + 22, cosmeticThumbKey(item.id));
      icon.setDisplaySize(44, 44);
      if (vaulted) icon.setAlpha(0.4);
      this.container.add(icon);
      this.dynamic.push(icon);

      const rarityColor = this.hex(RARITY_COLOR[item.rarity]);
      this.text(x0 + 54, y, def?.label ?? item.id, vaulted ? PALETTE.groundBase : rarityColor, 13, true);
      this.text(x0 + 54, y + 18, `◈ ${item.priceAmp} $AMP`, vaulted ? PALETTE.groundBase : PALETTE.warmGlow, 11);
      const b = this.badge(item, now);
      const worn = this.isWorn(item);
      this.text(
        x0 + 54,
        y + 34,
        worn ? 'WORN ✓' : b.label,
        worn ? PALETTE.solarGreen : vaulted ? PALETTE.groundBase : b.color,
        10,
        true,
      );

      // Whole row selects → features the item.
      const hit = this.scene.add.zone(x0 - 6, y - 6, W - x0 - 14, 58).setOrigin(0, 0);
      hit.setInteractive({ useHandCursor: !vaulted });
      hit.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.selected = i;
        this.facing = 0;
        sound.uiClick();
        this.refresh();
      });
      this.container.add(hit);
      this.dynamic.push(hit);
    });
  }
}
