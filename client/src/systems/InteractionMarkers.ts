import Phaser from 'phaser';
import { PALETTE, PALETTE_INT } from '@shared/palette';
import { depthForWorldY, tileToWorldBase, TILE_H, worldToTileFloor } from '../iso/project';

/**
 * R1 — the universal interaction language. Every REAL interactable (gather
 * nodes, merchants, player stalls, the Fortune Coil, the Ledgerhouse,
 * Tramgates, quest NPCs, the Tinkerbench, haul posts, garden beds) gets the
 * same three signals so a player can sweep the screen and instantly learn
 * what's real; decoration gets none of them:
 *
 *   (a) a floating pictogram that bobs above it when the Spark is within
 *       ~6 tiles (claw for gatherables, coin for commerce, coil for the
 *       wheel, …), NEAREST-scaled;
 *   (b) a 1px amber outline that pulses on hover (cursor change already
 *       comes from each sprite's useHandCursor);
 *   (c) a small name label that fades in as the Spark approaches.
 *
 * Pictograms are drawn procedurally from the locked palette (no new art
 * assets, ART-FREEZE-safe) and baked at 2× so the global pixelArt/NEAREST
 * sampler keeps them crisp at 0.5 draw scale.
 */

const ICON_TEX = 44; // texture px (baked 2×; drawn at 0.5 → 22 screen px)
const NEAR_TILES = 6; // pictogram shows within this Chebyshev range
const LABEL_TILES = 4; // name label fades in within this range
const LABEL_MAX = 3; // C3: at most this many labels show at once (nearest)
const FADE_PER_MS = 0.006; // alpha lerp speed toward target
const LABEL_COLOR = '#FFF0D9'; // default name-label ink

/** kind → pictogram + label + how high to float above the base anchor. */
interface KindStyle {
  icon: IconKey;
  label: string;
  lift: number;
}

type IconKey =
  | 'claw'
  | 'pick'
  | 'net'
  | 'wave'
  | 'coin'
  | 'coil'
  | 'ledger'
  | 'tram'
  | 'quest'
  | 'craft'
  | 'haul'
  | 'tend'
  | 'mug';

export const INTERACTABLE_STYLES: Record<string, KindStyle> = {
  // Gatherables — each skill its own glyph, but all clearly "work this".
  junkHeap: { icon: 'claw', label: 'Junk Heap', lift: 40 },
  brassSeam: { icon: 'pick', label: 'Brass Seam', lift: 40 },
  amperite: { icon: 'pick', label: 'Amperite Seam', lift: 40 },
  glowkoi: { icon: 'net', label: 'Glowkoi', lift: 30 },
  antenna: { icon: 'wave', label: 'Signal Mast', lift: 78 },
  // Commerce.
  merchant: { icon: 'coin', label: 'Merchant', lift: 66 },
  stall: { icon: 'coin', label: 'Market Stall', lift: 70 },
  // City services / landmarks.
  fortunecoil: { icon: 'coil', label: 'Fortune Coil', lift: 74 },
  ledgerhouse: { icon: 'ledger', label: 'The Ledgerhouse', lift: 96 },
  tramgate: { icon: 'tram', label: 'Tramgate', lift: 104 },
  tinkerbench: { icon: 'craft', label: 'Tinkerbench', lift: 48 },
  dispatchpost: { icon: 'haul', label: 'Haul Post', lift: 54 },
  gardenbed: { icon: 'tend', label: 'Garden Bed', lift: 34 },
  // Quest NPCs.
  dispatcher: { icon: 'quest', label: 'Dispatcher', lift: 58 },
  warden: { icon: 'quest', label: 'Charge Warden', lift: 58 },
  // City life (L1): the watering hole.
  ampedbar: { icon: 'mug', label: 'The Amped Bar', lift: 100 },
};

interface Entry {
  cx: number; // footprint centre tile (for proximity)
  cy: number;
  x0: number; // footprint min tile (for hover hit-test)
  y0: number;
  x1: number; // footprint max tile
  y1: number;
  baseY: number; // icon rest world-Y (already lifted)
  icon: Phaser.GameObjects.Image;
  chip: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  outline: Phaser.GameObjects.Graphics;
  phase: number;
  iconAlpha: number;
  labelAlpha: number;
  hovered: boolean;
  /** C3: tutorial-pinned — label stays amber and always visible. */
  highlight: boolean;
  /** Resting label depth (a highlight lifts it above neighbour labels). */
  labelDepth: number;
  /** F4 stack rule: the label yields (fades out) while this entity carries
   *  the E-prompt and/or a speech bubble — one voice per anchor space.
   *  Sources are independent, so a bubble ending never un-yields a label
   *  the prompt still owns. */
  suppressors: Set<string>;
}

export class InteractionMarkers {
  private readonly scene: Phaser.Scene;
  private readonly entries: Entry[] = [];
  private t = 0;
  private acc = 0;
  private enabled = true;
  /** Photo mode: all marker chrome snapped invisible (setPhotoHidden). */
  private photoHidden = false;
  /** F1: counter-scale at min zoom so pictograms/labels stay legible. */
  private zoomK = 1;

  constructor(scene: Phaser.Scene) {
    InteractionMarkers.ensureTextures(scene);
    this.scene = scene;
  }

  /** Draw the pictogram + chip textures once per game. */
  static ensureTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists('imark-coin')) return;
    const amber = PALETTE_INT.neonAmber;
    const teal = PALETTE_INT.neonTeal;
    const rose = PALETTE_INT.neonRose;
    const cyan = PALETTE_INT.neonCyan;
    const green = PALETTE_INT.solarGreen;
    const warm = PALETTE_INT.warmGlow;
    const ink = PALETTE_INT.ink;

    // Soft dark chip behind every icon so it reads over bright signage.
    {
      const g = scene.add.graphics();
      const r = ICON_TEX / 2;
      g.fillStyle(ink, 0.62);
      g.fillCircle(r, r, r - 3);
      g.lineStyle(2, amber, 0.55);
      g.strokeCircle(r, r, r - 3);
      g.generateTexture('imark-chip', ICON_TEX, ICON_TEX);
      g.destroy();
    }

    const draw = (key: IconKey, tint: number, paint: (g: Phaser.GameObjects.Graphics, c: number) => void) => {
      const g = scene.add.graphics();
      // Ink underlay (1px-ish contour) then the tinted glyph on top.
      paint(g, ink);
      g.generateTexture(`imark-${key}-ink`, ICON_TEX, ICON_TEX);
      g.clear();
      paint(g, tint);
      g.generateTexture(`imark-${key}`, ICON_TEX, ICON_TEX);
      g.destroy();
    };
    const C = ICON_TEX / 2;

    // claw — three curved talons (gather / Scavving).
    draw('claw', amber, (g, c) => {
      g.lineStyle(4, c, 1);
      for (const dx of [-9, 0, 9]) {
        g.beginPath();
        g.arc(C + dx, C - 4, 9, Phaser.Math.DegToRad(70), Phaser.Math.DegToRad(150), false);
        g.strokePath();
      }
      g.fillStyle(c, 1);
      g.fillRect(C - 11, C + 6, 22, 4);
    });
    // pick — crossed pick + shard (Delving).
    draw('pick', warm, (g, c) => {
      g.lineStyle(4, c, 1);
      g.lineBetween(C - 11, C - 10, C + 11, C + 12);
      g.lineBetween(C - 11, C + 12, C + 11, C - 10);
      g.fillStyle(c, 1);
      g.fillCircle(C, C + 1, 4);
    });
    // net — skimnet weave (Skimming).
    draw('net', cyan, (g, c) => {
      g.lineStyle(3, c, 1);
      g.strokeCircle(C, C, 12);
      g.lineBetween(C - 12, C, C + 12, C);
      g.lineBetween(C, C - 12, C, C + 12);
      g.lineBetween(C - 8, C - 8, C + 8, C + 8);
      g.lineBetween(C - 8, C + 8, C + 8, C - 8);
    });
    // wave — signal arcs (Tuning).
    draw('wave', teal, (g, c) => {
      g.lineStyle(3, c, 1);
      for (const rr of [5, 10, 15]) {
        g.beginPath();
        g.arc(C, C + 8, rr, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false);
        g.strokePath();
      }
      g.fillStyle(c, 1);
      g.fillCircle(C, C + 8, 3);
    });
    // coin — bolts / commerce.
    draw('coin', amber, (g, c) => {
      g.lineStyle(4, c, 1);
      g.strokeCircle(C, C, 12);
      g.lineStyle(3, c, 1);
      g.lineBetween(C, C - 7, C, C + 7);
      g.lineBetween(C - 4, C - 3, C + 4, C - 3);
      g.lineBetween(C - 4, C + 3, C + 4, C + 3);
    });
    // coil — Fortune Coil wheel.
    draw('coil', rose, (g, c) => {
      g.lineStyle(3, c, 1);
      g.strokeCircle(C, C, 12);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        g.lineBetween(C, C, C + Math.cos(a) * 12, C + Math.sin(a) * 12);
      }
      g.fillStyle(c, 1);
      g.fillCircle(C, C, 3);
    });
    // mug — the Amped Bar tankard: body, handle, a line of foam.
    draw('mug', warm, (g, c) => {
      g.lineStyle(3, c, 1);
      g.strokeRect(C - 9, C - 8, 13, 17);
      g.beginPath();
      g.arc(C + 7, C, 5, -Math.PI / 2, Math.PI / 2);
      g.strokePath();
      g.lineStyle(2, c, 1);
      g.lineBetween(C - 6, C - 4, C + 1, C - 4);
    });
    // ledger — the bank ledger book.
    draw('ledger', warm, (g, c) => {
      g.lineStyle(3, c, 1);
      g.strokeRect(C - 10, C - 11, 20, 22);
      g.lineBetween(C, C - 11, C, C + 11);
      g.lineStyle(2, c, 1);
      for (const dy of [-5, 1, 7]) {
        g.lineBetween(C - 7, C + dy, C - 2, C + dy);
        g.lineBetween(C + 2, C + dy, C + 7, C + dy);
      }
    });
    // tram — travel gate / arrows.
    draw('tram', cyan, (g, c) => {
      g.fillStyle(c, 1);
      g.fillTriangle(C - 12, C, C - 3, C - 8, C - 3, C + 8);
      g.fillTriangle(C + 12, C, C + 3, C - 8, C + 3, C + 8);
      g.fillRect(C - 2, C - 3, 4, 6);
    });
    // quest — bold exclamation.
    draw('quest', amber, (g, c) => {
      g.fillStyle(c, 1);
      g.fillRect(C - 3, C - 13, 6, 16);
      g.fillCircle(C, C + 9, 4);
    });
    // craft — wrench (Tinkerbench).
    draw('craft', warm, (g, c) => {
      g.lineStyle(5, c, 1);
      g.lineBetween(C - 8, C + 8, C + 6, C - 6);
      g.lineStyle(3, c, 1);
      g.strokeCircle(C + 8, C - 8, 5);
      g.strokeCircle(C - 9, C + 9, 4);
    });
    // haul — a hauled crate with an arrow (Draymule delivery).
    draw('haul', warm, (g, c) => {
      g.lineStyle(3, c, 1);
      g.strokeRect(C - 10, C - 4, 14, 14);
      g.fillStyle(c, 1);
      g.fillTriangle(C + 6, C - 8, C + 13, C - 3, C + 6, C + 2);
    });
    // tend — a leaf (garden bed).
    draw('tend', green, (g, c) => {
      g.fillStyle(c, 1);
      g.beginPath();
      g.arc(C, C, 12, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false);
      g.arc(C, C, 12, Phaser.Math.DegToRad(270), Phaser.Math.DegToRad(90), false);
      g.closePath();
      g.fill();
      g.lineStyle(2, PALETTE_INT.ink, 1);
      g.lineBetween(C, C - 10, C, C + 10);
    });
  }

  /**
   * Register one interactable. `anchor` is the object's base world position;
   * `footprint` is its tile rectangle (used for the hover hit-test).
   */
  add(
    kind: string,
    anchor: { x: number; y: number },
    footprint: { x: number; y: number; w: number; h: number },
    nameOverride?: string,
  ): void {
    const style = INTERACTABLE_STYLES[kind];
    if (style === undefined) return;
    const labelText = nameOverride ?? style.label;
    const baseY = anchor.y - style.lift;
    const depth = depthForWorldY(anchor.y) + 6;

    const chip = this.scene.add
      .image(anchor.x, baseY, 'imark-chip')
      .setScale(0.5 * this.zoomK)
      .setDepth(depth)
      .setAlpha(0);
    // Ink contour under the glyph, then the tinted glyph — the mandated
    // 8-dir contour language, in miniature.
    const iconInk = this.scene.add
      .image(anchor.x, baseY, `imark-${style.icon}-ink`)
      .setScale(0.5 * 1.16 * this.zoomK)
      .setDepth(depth)
      .setAlpha(0);
    const icon = this.scene.add
      .image(anchor.x, baseY, `imark-${style.icon}`)
      .setScale(0.5 * this.zoomK)
      .setDepth(depth + 1)
      .setAlpha(0);
    // Keep the ink twin glued to the glyph by parenting via a tiny group-ish
    // update: simplest is to store both and move together. We fold the ink
    // into `chip`'s slot by drawing it under the icon; track it on the entry.
    (icon as unknown as { _ink: Phaser.GameObjects.Image })._ink = iconInk;

    const label = this.scene.add
      .text(anchor.x, baseY + 15, labelText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: LABEL_COLOR,
        stroke: '#1E1930',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScale(this.zoomK)
      .setDepth(depth + 1)
      .setAlpha(0);

    const outline = this.scene.add.graphics().setDepth(depthForWorldY(anchor.y) + 2);
    outline.setVisible(false);

    this.entries.push({
      cx: footprint.x + (footprint.w - 1) / 2,
      cy: footprint.y + (footprint.h - 1) / 2,
      x0: footprint.x,
      y0: footprint.y,
      x1: footprint.x + footprint.w - 1,
      y1: footprint.y + footprint.h - 1,
      baseY,
      icon,
      chip,
      label,
      outline,
      phase: (this.entries.length * 0.7) % (Math.PI * 2),
      iconAlpha: 0,
      labelAlpha: 0,
      hovered: false,
      highlight: false,
      labelDepth: depth + 1,
      suppressors: new Set(),
    });
    this.drawOutline(this.entries[this.entries.length - 1]!);
  }

  /**
   * F1: apply the world-text counter-scale (×1/zoom below zoom 1) so glyphs,
   * chips and name labels hold their screen size at min zoom instead of
   * shrinking to a smudge. Base scales: glyph 0.5, ink twin 0.58, chip 0.5.
   */
  setZoomScale(k: number): void {
    this.zoomK = k;
    for (const e of this.entries) {
      e.icon.setScale(0.5 * k);
      (e.icon as unknown as { _ink: Phaser.GameObjects.Image })._ink.setScale(0.5 * 1.16 * k);
      e.chip.setScale(0.5 * k);
      e.label.setScale(k);
    }
  }

  /** The entry whose footprint contains this tile (C3 label/highlight lookup). */
  private findEntry(tx: number, ty: number): Entry | undefined {
    return this.entries.find((e) => tx >= e.x0 && tx <= e.x1 && ty >= e.y0 && ty <= e.y1);
  }

  /** C3: rename an interactable's label (merchant name, stall owner/empty). */
  setLabel(tx: number, ty: number, text: string): void {
    this.findEntry(tx, ty)?.label.setText(text);
  }

  /**
   * F4 stack rule: suppress (or release) the label of the entity holding the
   * tile — `source` is 'prompt' (the E-prompt sits on it) or 'bubble' (its
   * NPC is speaking). The label yields while ANY source holds it; the
   * per-frame fade lerps it out/in smoothly.
   */
  setSuppressed(tx: number, ty: number, source: string, on: boolean): void {
    const e = this.findEntry(tx, ty);
    if (e === undefined) return;
    if (on) e.suppressors.add(source);
    else e.suppressors.delete(source);
  }

  /** C3: amber-pin a target's label (tutorial) with an ink plate that reads
   *  over neighbour labels, or clear it back to a plain stroked label. */
  setHighlight(tx: number, ty: number, on: boolean): void {
    const e = this.findEntry(tx, ty);
    if (e === undefined) return;
    e.highlight = on;
    e.label.setColor(on ? PALETTE.neonAmber : LABEL_COLOR);
    e.label.setBackgroundColor(on ? PALETTE.ink : '');
    e.label.setPadding(on ? 5 : 0, on ? 2 : 0);
    e.label.setDepth(on ? 900_000 : e.labelDepth);
  }

  /** Photo mode (marketing shots): pictograms, labels, chips, and hover
   *  rings all read as dev chrome on film — snap them away, restore after. */
  setPhotoHidden(hidden: boolean): void {
    this.photoHidden = hidden;
    if (!hidden) return; // update() lerps everything back by proximity
    for (const e of this.entries) {
      e.iconAlpha = 0;
      e.labelAlpha = 0;
      e.icon.setAlpha(0);
      (e.icon as unknown as { _ink: Phaser.GameObjects.Image })._ink.setAlpha(0);
      e.chip.setAlpha(0);
      e.label.setAlpha(0);
      e.hovered = false;
      e.outline.setVisible(false);
    }
  }

  /** A 1px amber diamond ring around the footprint's base, for hover. */
  private drawOutline(e: Entry): void {
    // Convert the four footprint corners to world space via the same iso
    // math the scene uses; import lazily to avoid a cycle.
    // (tileToWorldBase gives un-elevated corners — fine for a floor ring.)
    const g = e.outline;
    g.clear();
    g.lineStyle(1, PALETTE_INT.neonAmber, 0.95);
    // Diamond spanning the tile rect, in world coords computed from the
    // scene's TILE dims through project's tileToWorld corners.
    const corners = cornersOf(e.x0, e.y0, e.x1, e.y1);
    g.beginPath();
    g.moveTo(corners[0]!.x, corners[0]!.y);
    for (let i = 1; i < corners.length; i++) g.lineTo(corners[i]!.x, corners[i]!.y);
    g.closePath();
    g.strokePath();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      for (const e of this.entries) {
        e.iconAlpha = 0;
        e.labelAlpha = 0;
        e.icon.setAlpha(0);
        (e.icon as unknown as { _ink: Phaser.GameObjects.Image })._ink.setAlpha(0);
        e.chip.setAlpha(0);
        e.label.setAlpha(0);
        e.outline.setVisible(false);
      }
    }
  }

  /** Per-frame: bob + proximity fade + hover outline. */
  update(player: { x: number; y: number } | null, dtMs: number): void {
    if (!this.enabled || this.entries.length === 0) return;
    if (this.photoHidden) return; // photo mode: everything stays snapped away
    this.t += dtMs;
    this.acc += dtMs;
    const doProx = this.acc >= 160;
    if (doProx) this.acc = 0;

    // Which footprint is the pointer over? (tile-space hit-test — no
    // interactive zones, so it never steals a click from the real sprite.)
    let hoverTile: { tx: number; ty: number } | null = null;
    const pointer = this.scene.input.activePointer;
    if (pointer !== undefined) {
      const cam = this.scene.cameras.main;
      const wp = cam.getWorldPoint(pointer.x, pointer.y);
      hoverTile = worldToTileFloor(wp.x, wp.y);
    }

    // C3: declutter — of the interactables within label range, only the
    // LABEL_MAX nearest show their name (plus any highlighted target); the
    // rest are hover-only, so a market cluster isn't a wall of "Market Stall".
    let labelShown: Set<Entry> | null = null;
    if (doProx && player !== null) {
      const p = player;
      labelShown = new Set(
        this.entries
          .map((e) => ({ e, d: Math.max(Math.abs(p.x - e.cx), Math.abs(p.y - e.cy)) }))
          .filter((o) => o.d <= LABEL_TILES)
          .sort((a, b) => a.d - b.d)
          .slice(0, LABEL_MAX)
          .map((o) => o.e),
      );
    }

    for (const e of this.entries) {
      // Bob every frame — cheap sine on the icon + its ink twin + chip.
      const bob = Math.sin(this.t * 0.004 + e.phase) * 3;
      const iconInk = (e.icon as unknown as { _ink: Phaser.GameObjects.Image })._ink;
      e.icon.y = e.baseY + bob;
      iconInk.y = e.baseY + bob;
      e.chip.y = e.baseY + bob;

      if (doProx && player !== null) {
        const dist = Math.max(Math.abs(player.x - e.cx), Math.abs(player.y - e.cy));
        e.iconAlpha = dist <= NEAR_TILES ? 1 : 0;
        // Label shows if it's one of the nearest few OR a pinned target.
        e.labelAlpha = e.highlight || (labelShown !== null && labelShown.has(e)) ? 1 : 0;
      }
      // Hover: pointer tile inside footprint.
      const hov =
        hoverTile !== null &&
        hoverTile.tx >= e.x0 &&
        hoverTile.tx <= e.x1 &&
        hoverTile.ty >= e.y0 &&
        hoverTile.ty <= e.y1;
      if (hov !== e.hovered) {
        e.hovered = hov;
        e.outline.setVisible(hov);
      }

      // Smooth alpha toward target.
      const lerp = Math.min(1, dtMs * FADE_PER_MS);
      const cur = e.icon.alpha;
      const next = cur + (e.iconAlpha - cur) * lerp;
      e.icon.setAlpha(next);
      iconInk.setAlpha(next);
      e.chip.setAlpha(next * 0.9);
      // C3: a hovered label always shows, even past the nearest-few cap.
      // F4 stack rule: suppression (E-prompt / speech bubble on this entity)
      // beats everything — the label yields, hover or not.
      const labelTarget = e.suppressors.size > 0 ? 0 : e.hovered ? 1 : e.labelAlpha;
      const lcur = e.label.alpha;
      e.label.setAlpha(lcur + (labelTarget - lcur) * lerp);

      if (hov) {
        // 1px amber outline PULSE.
        e.outline.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(this.t * 0.006)));
      }
    }
  }

  destroy(): void {
    for (const e of this.entries) {
      (e.icon as unknown as { _ink: Phaser.GameObjects.Image })._ink.destroy();
      e.icon.destroy();
      e.chip.destroy();
      e.label.destroy();
      e.outline.destroy();
    }
    this.entries.length = 0;
  }
}

// The four footprint corners in world space, for the hover ring.
function cornersOf(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<{ x: number; y: number }> {
  const top = tileToWorldBase(x0, y0);
  const right = tileToWorldBase(x1, y0);
  const bottom = tileToWorldBase(x1, y1);
  const left = tileToWorldBase(x0, y1);
  const h = TILE_H / 2;
  return [
    { x: top.x, y: top.y - h },
    { x: right.x + TILE_H, y: right.y },
    { x: bottom.x, y: bottom.y + h },
    { x: left.x - TILE_H, y: left.y },
  ];
}
