import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { TilePoint } from '@shared/pathfinding';
import type { EmoteId } from '@shared/protocol';
import { DEPTH_SHADOW, depthForWorldY, TILE_H, TILE_W, tileToWorld } from '../iso/project';
import { DEFAULT_APPEARANCE_CODE } from '@shared/appearance';
import { decodeEquipped } from '@shared/cosmetics';
import { addLayeredGlow, type LayeredGlow } from '../render/glow';
import { worldSpriteTint } from '../render/styleConfig';
import { bakeSparkAppearance, equipKey } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';
import { worldTextScale } from '../systems/cameraMath';

/**
 * The player entity: a sprite that walks tile-to-tile along A* paths with
 * smooth tweens and continuous depth updates. Re-pathing mid-walk swaps the
 * queue; the current step always finishes so motion never snaps.
 */
export class Spark {
  readonly image: Phaser.GameObjects.Image;
  /** Tile the Spark occupies (or is leaving during a step). */
  tile: TilePoint;
  private readonly scene: Phaser.Scene;
  private queue: TilePoint[] = [];
  private stepTween: Phaser.Tweens.Tween | null = null;
  private stepTarget: TilePoint | null = null;
  private onArrive: (() => void) | null = null;
  private label: Phaser.GameObjects.Text | null = null;
  private labelRise = { value: 0 };
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleHeight = 0;
  /** Fired when a walk step lands on its tile (own Spark: footsteps). */
  onStep: (() => void) | null = null;
  /** Worn wardrobe cosmetics (wire form) + its texture-key chunk. */
  private equipped = '';
  private equippedKey = 'none';
  private bulbGlow: LayeredGlow | null = null;
  private trim = '';
  private appearance = DEFAULT_APPEARANCE_CODE;
  private dir: 'se' | 'sw' | 'ne' | 'nw' = 'se';
  private frame: 'idle' | 'walkA' | 'walkP' | 'walkB' = 'idle';
  /** Alternates which leg strides first on each step (A vs B). */
  private strideParity = false;
  private pose: string | null = null;
  /** U4b /sit: dipped into the deck until the next step or pose. */
  private sitting = false;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, tile: TilePoint, name?: string) {
    this.scene = scene;
    this.tile = { ...tile };
    const { x, y } = tileToWorld(tile.x, tile.y);
    const baked = voxelSprite(`spark@${DEFAULT_APPEARANCE_CODE}#none-se`);
    this.image = scene.add.image(x, y, baked.key);
    this.image.setOrigin(baked.originX, baked.originY);
    this.image.setScale(baked.scale);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(y));
    // Contact shadow (R1): a tight ground ellipse that walks with the Spark.
    this.shadow = scene.add.image(x, y - 2, 'fx-contact-shadow');
    this.shadow.setScale(0.62, 0.62);
    this.shadow.setAlpha(0.75);
    this.shadow.setDepth(DEPTH_SHADOW);
    if (name !== undefined) this.setNameLabel(name);
    // Breathing idle — feet-anchored, so the chest rises, not the boots.
    // Desynced per Spark so a crowd never bobs in unison.
    scene.tweens.add({
      targets: this.image,
      scaleY: baked.scale * 1.035,
      duration: Phaser.Math.Between(1400, 1900),
      delay: Phaser.Math.Between(0, 900),
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
  }

  /** Facing: every direction is its own bake with true shading — no flips. */
  private face(dx: number, dy: number): void {
    if (dx > 0) this.dir = 'se';
    else if (dx < 0) this.dir = 'nw';
    else if (dy > 0) this.dir = 'sw';
    else if (dy < 0) this.dir = 'ne';
    else return;
    this.applyTexture();
  }

  /** Pose bakes win over walk frames; worn cosmetics live in the key. */
  private textureName(): string {
    const base = `spark@${this.appearance}#${this.equippedKey}-${this.dir}`;
    if (this.pose !== null) return `${base}-pose-${this.pose}`;
    const frame = this.frame === 'idle' ? '' : `-${this.frame}`;
    return `${base}${frame}`;
  }

  /**
   * Creator-chosen appearance (server-broadcast code). Bakes the set on
   * first sight of a code — idempotent, so repeats are free.
   */
  setAppearance(code: string): void {
    if (code === this.appearance || code === '') return;
    this.appearance = code;
    bakeSparkAppearance(this.scene, code, { equipped: this.equipped });
    this.applyTexture();
  }

  /** Worn wardrobe cosmetics (server-broadcast wire string). */
  setEquipped(wire: string): void {
    if (wire === this.equipped) return;
    this.equipped = wire;
    this.equippedKey = equipKey(decodeEquipped(wire));
    bakeSparkAppearance(this.scene, this.appearance, { equipped: wire });
    this.applyTexture();
    this.syncBulbGlow();
  }

  /** The Bulb hat carries its own warm emissive glow (render/glow.ts). */
  private syncBulbGlow(): void {
    const wearing = decodeEquipped(this.equipped).head === 'bulbHat';
    if (!wearing && this.bulbGlow !== null) {
      this.bulbGlow.core.destroy();
      this.bulbGlow.mid.destroy();
      this.bulbGlow.outer.destroy();
      this.bulbGlow = null;
    } else if (wearing && this.bulbGlow === null) {
      this.bulbGlow = addLayeredGlow(
        this.scene,
        this.image.x,
        this.image.y - this.image.displayHeight + 8,
        PALETTE_INT.warmGlow,
        0.5,
        this.image.depth + 1,
        0.55,
      );
    }
  }

  private applyTexture(): void {
    const baked = voxelSprite(this.textureName());
    this.image.setTexture(baked.key);
    this.image.setOrigin(baked.originX, baked.originY);
  }

  private setFrame(frame: 'idle' | 'walkA' | 'walkP' | 'walkB'): void {
    if (frame === this.frame) return;
    this.frame = frame;
    if (this.pose === null) this.applyTexture();
  }

  /** Turn toward an adjacent world point (gather target, trade partner). */
  faceTowardWorld(wx: number, wy: number): void {
    const dx = wx - this.image.x;
    const dy = wy - this.image.y;
    // Inverse iso: tile dx ∝ (sx/half_w + sy/half_h), dy ∝ (sy/half_h − sx/half_w).
    const tdx = dx / (TILE_W / 2) + dy / (TILE_H / 2);
    const tdy = dy / (TILE_H / 2) - dx / (TILE_W / 2);
    if (Math.abs(tdx) >= Math.abs(tdy)) this.face(Math.sign(tdx), 0);
    else this.face(0, Math.sign(tdy));
  }

  /**
   * Working pose (server-broadcast presentation state): the tool id while
   * gathering, 'brawl' during a melee flash, null to return to the walk set.
   */
  setPose(id: string | null): void {
    if (id === this.pose) return;
    if (id !== null) this.standIfSitting();
    this.pose = id;
    this.applyTexture();
  }

  /**
   * Citywide Charge regalia: top weekly contributors carry a warm glow on
   * their name. Presentation only — never gameplay, never tradeable.
   */
  setTrim(id: string): void {
    if (id === this.trim) return;
    this.trim = id;
    this.applyTrim();
  }

  private applyTrim(): void {
    if (this.label === null) return;
    if (this.trim !== '') {
      this.label.setColor(PALETTE.neonAmber);
      this.label.setShadow(0, 0, PALETTE.warmGlow, 6, true, true);
    } else {
      this.label.setColor(UI_TEXT_WARM);
      this.label.setShadow(0, 0, PALETTE.ink, 0, false, false);
    }
  }

  /** F4 stack rule: an open speech bubble suppresses the nameplate — one
   *  voice per anchor space. Cleared when the bubble fades/destroys. */
  private labelSuppressed = false;

  /** Proximity fade (S0): scales the nameplate without touching bubbles. */
  setNameFade(alpha: number): void {
    if (this.label === null) return;
    const a = this.labelSuppressed ? 0 : alpha;
    this.label.setAlpha(a);
    this.label.setVisible(a > 0.02);
  }

  /** F1: counter-scale nameplate + bubble so text stays legible at min zoom. */
  setTextZoomScale(k: number): void {
    this.label?.setScale(k);
    this.bubble?.setScale(k);
  }

  setNameLabel(name: string): void {
    this.label?.destroy();
    this.label = this.scene.add.text(this.image.x, this.image.y, name, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_TEXT_WARM,
      stroke: PALETTE.ink,
      strokeThickness: 4,
    });
    this.label.setOrigin(0.5, 1);
    this.label.setScale(worldTextScale(this.scene.cameras.main.zoom));
    // Ease in: fade up from a step below so arrivals feel like arrivals.
    this.label.setAlpha(0);
    this.labelRise = { value: 10 };
    this.scene.tweens.add({
      targets: this.label,
      alpha: 1,
      duration: 450,
      delay: 120,
      ease: 'quad.out',
    });
    this.scene.tweens.add({
      targets: this.labelRise,
      value: 0,
      duration: 450,
      delay: 120,
      ease: 'quad.out',
      onUpdate: () => this.syncLabel(),
    });
    this.applyTrim();
    this.syncLabel();
  }

  private syncLabel(): void {
    this.shadow.setPosition(this.image.x, this.image.y - 2);
    if (this.bulbGlow !== null) {
      const gx = this.image.x;
      const gy = this.image.y - this.image.displayHeight + 8;
      const depth = this.image.depth + 1;
      for (const layer of [this.bulbGlow.core, this.bulbGlow.mid, this.bulbGlow.outer]) {
        layer.setPosition(gx, gy);
        layer.setDepth(depth);
      }
    }
    if (this.label === null) return;
    // R4: float the nameplate a clear gap ABOVE the sprite's true top so it
    // never covers the face or the mop (origin-aware, since the shared
    // character anchor puts the origin near the feet, not the top).
    const topY = this.image.y - this.image.originY * this.image.displayHeight;
    this.label.setPosition(this.image.x, topY - 5 + this.labelRise.value);
    this.label.setDepth(this.image.depth + 1);
    this.syncBubble();
  }

  /** Speech bubble above the head; a new line replaces the old one. */
  showChatBubble(text: string): void {
    this.bubble?.destroy();
    const body = text.length > 90 ? `${text.slice(0, 89)}…` : text;
    const txt = this.scene.add.text(0, 0, body, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_TEXT_WARM,
      wordWrap: { width: 168 },
      align: 'center',
    });
    txt.setOrigin(0.5, 0.5);
    const w = txt.width + 14;
    const h = txt.height + 10;
    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.82);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 7);
    g.lineStyle(1.5, PALETTE_INT.warmGlow, 0.55);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
    g.fillStyle(PALETTE_INT.ink, 0.82);
    g.fillTriangle(-4, h / 2 - 1, 4, h / 2 - 1, 0, h / 2 + 6);
    const bubble = this.scene.add.container(0, 0, [g, txt]);
    // F4 audit: the chat bubble's opaque plate, in local space (centre origin).
    bubble.setData('kitClipRect', { ox: -w / 2, oy: -h / 2, w, h });
    bubble.setScale(worldTextScale(this.scene.cameras.main.zoom));
    bubble.setAlpha(0);
    this.bubble = bubble;
    this.bubbleHeight = h;
    // F4 stack rule: while the bubble speaks, the nameplate stands down.
    this.labelSuppressed = true;
    this.label?.setAlpha(0).setVisible(false);
    bubble.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.bubble === bubble || this.bubble === null) {
        this.labelSuppressed = false;
        // Next proximity-fade tick restores the right alpha; nudge it now so
        // an idle scene doesn't wait a frame with a missing plate.
        this.label?.setVisible(true).setAlpha(1);
      }
    });
    this.syncBubble();
    this.scene.tweens.add({ targets: bubble, alpha: 1, duration: 160, ease: 'quad.out' });
    const fadeAt = 3400 + Math.min(2200, text.length * 28);
    this.scene.time.delayedCall(fadeAt, () => {
      if (this.bubble !== bubble) return;
      this.scene.tweens.add({
        targets: bubble,
        alpha: 0,
        y: bubble.y - 8,
        duration: 420,
        ease: 'quad.in',
        onComplete: () => {
          if (this.bubble === bubble) this.bubble = null;
          bubble.destroy();
        },
      });
    });
  }

  private syncBubble(): void {
    if (this.bubble === null) return;
    this.bubble.setPosition(
      this.image.x,
      // bubbleHeight is pre-scale; the F1 zoom counter-scale grows the
      // rendered box, so anchor with the live scale to keep it clear of the head.
      this.image.y - this.image.displayHeight - 16 - (this.bubbleHeight * this.bubble.scaleY) / 2,
    );
    this.bubble.setDepth(this.image.depth + 2);
  }

  /** A melee swing: brawl pose + short lunge toward the target and back. */
  lungeToward(worldX: number, worldY: number): void {
    const ox = this.image.x;
    const oy = this.image.y;
    this.setPose('brawl');
    this.scene.time.delayedCall(320, () => {
      if (this.image.active && this.pose === 'brawl') this.setPose(null);
    });
    this.scene.tweens.add({
      targets: this.image,
      x: ox + Math.sign(worldX - ox) * 9,
      y: oy + Math.sign(worldY - oy) * 5,
      duration: 85,
      yoyo: true,
      ease: 'quad.out',
      onUpdate: () => this.syncLabel(),
    });
  }

  /** Brief hurt blink (rose fill, then back to the style tint). */
  flashHurt(): void {
    this.image.setTintFill(PALETTE_INT.neonRose);
    this.scene.time.delayedCall(90, () => {
      if (!this.image.active) return;
      const wt = worldSpriteTint();
      if (wt !== null) this.image.setTint(wt);
      else this.image.clearTint();
    });
  }

  /** U4b: route a broadcast emote to its flourish. */
  playEmote(kind: EmoteId): void {
    if (kind === 'sit') {
      this.sit();
      return;
    }
    this.standIfSitting();
    if (kind === 'wave') this.playWave();
    else if (kind === 'cheer') this.playCheer();
    else this.playPoint();
  }

  /** A pixel emote-bubble glyph floating up off the head. */
  private emoteBubble(tex: string): void {
    const img = this.scene.add.image(
      this.image.x + 10,
      this.image.y - this.image.displayHeight - 4,
      tex,
    );
    img.setScale(1);
    img.setDepth(this.image.depth + 3);
    this.scene.tweens.add({
      targets: img,
      y: img.y - 12,
      alpha: { from: 1, to: 0 },
      delay: 950,
      duration: 420,
      ease: 'quad.in',
      onComplete: () => img.destroy(),
    });
  }

  /** /sit: settle into the deck until the next step (or a working pose). */
  private sit(): void {
    if (this.sitting) return;
    this.sitting = true;
    this.image.y += 4;
    this.image.setDepth(depthForWorldY(this.image.y));
    this.syncLabel();
    this.emoteBubble('emote-sit');
  }

  private standIfSitting(): void {
    if (!this.sitting) return;
    this.sitting = false;
    this.image.y -= 4;
    this.image.setDepth(depthForWorldY(this.image.y));
    this.syncLabel();
  }

  /** /cheer: a big double hop + a stars bubble. */
  private playCheer(): void {
    this.scene.tweens.add({
      targets: this.image,
      y: this.image.y - 11,
      duration: 170,
      yoyo: true,
      repeat: 2,
      ease: 'quad.out',
      onUpdate: () => this.syncLabel(),
    });
    this.emoteBubble('emote-cheer');
  }

  /** /point: a sharp lean toward the current facing + a "look!" bubble. */
  private playPoint(): void {
    const d = { se: { x: 1, y: 0 }, nw: { x: -1, y: 0 }, sw: { x: 0, y: 1 }, ne: { x: 0, y: -1 } }[
      this.dir
    ];
    const here = tileToWorld(this.tile.x, this.tile.y);
    const there = tileToWorld(this.tile.x + d.x, this.tile.y + d.y);
    this.scene.tweens.add({
      targets: this.image,
      x: this.image.x + (there.x - here.x) * 0.22,
      y: this.image.y + (there.y - here.y) * 0.22,
      duration: 140,
      yoyo: true,
      repeat: 1,
      ease: 'quad.out',
      onUpdate: () => this.syncLabel(),
    });
    this.emoteBubble('emote-point');
  }

  /** The /wave emote: a friendly double hop + a little hand flourish. */
  playWave(): void {
    this.scene.tweens.add({
      targets: this.image,
      y: this.image.y - 7,
      duration: 150,
      yoyo: true,
      repeat: 1,
      ease: 'quad.out',
      onUpdate: () => this.syncLabel(),
    });
    const hand = this.scene.add.text(
      this.image.x + 14,
      this.image.y - this.image.displayHeight + 10,
      '✦',
      { fontFamily: 'monospace', fontSize: '15px', color: PALETTE.neonAmber },
    );
    hand.setOrigin(0.5);
    hand.setDepth(this.image.depth + 2);
    this.scene.tweens.add({
      targets: hand,
      angle: { from: -24, to: 24 },
      duration: 160,
      yoyo: true,
      repeat: 3,
      ease: 'sine.inout',
    });
    this.scene.tweens.add({
      targets: hand,
      y: hand.y - 14,
      alpha: 0,
      delay: 620,
      duration: 320,
      onComplete: () => hand.destroy(),
    });
  }

  /** Snap instantly to a tile (server drift correction). */
  snapTo(tile: TilePoint): void {
    this.sitting = false;
    this.stepTween?.stop();
    this.stepTween = null;
    this.stepTarget = null;
    this.queue = [];
    this.tile = { ...tile };
    const { x, y } = tileToWorld(tile.x, tile.y);
    this.image.setPosition(x, y);
    this.image.setDepth(depthForWorldY(y));
    this.syncLabel();
  }

  destroy(): void {
    if (this.bulbGlow !== null) {
      this.bulbGlow.core.destroy();
      this.bulbGlow.mid.destroy();
      this.bulbGlow.outer.destroy();
      this.bulbGlow = null;
    }
    this.stepTween?.stop();
    this.scene.tweens.killTweensOf(this.image);
    this.scene.tweens.killTweensOf(this.labelRise);
    this.bubble?.destroy();
    this.label?.destroy();
    this.shadow.destroy();
    this.image.destroy();
  }

  get isMoving(): boolean {
    return this.stepTween !== null;
  }

  /** Tile the Spark will stand on once the current step finishes. */
  get settledTile(): TilePoint {
    return this.stepTarget ?? this.tile;
  }

  /**
   * Replace the walk queue (path must start from settledTile). Optional
   * onArrive fires when the full queue is consumed (used for gather-walks).
   */
  walk(path: TilePoint[], onArrive?: () => void): void {
    this.queue = [...path];
    this.onArrive = onArrive ?? null;
    if (this.stepTween === null) this.stepNext();
  }

  stop(): void {
    this.queue = [];
    this.onArrive = null;
  }

  private stepNext(): void {
    const next = this.queue.shift();
    if (next === undefined) {
      const done = this.onArrive;
      this.onArrive = null;
      this.setFrame('idle');
      if (done !== null) done();
      return;
    }
    this.stepTarget = next;
    // Stepping is standing — the walk tween takes over the dipped y anyway.
    this.sitting = false;
    const to = tileToWorld(next.x, next.y);
    this.face(next.x - this.tile.x, next.y - this.tile.y);
    // Walk cycle with weight: stride (A/B alternating legs) for the first
    // half of the step, the raised passing frame (P) for the second half.
    this.strideParity = !this.strideParity;
    const strideFrame = this.strideParity ? 'walkA' : 'walkB';
    this.setFrame(strideFrame);

    this.stepTween = this.scene.tweens.add({
      targets: this.image,
      x: to.x,
      y: to.y,
      duration: CONFIG.player.secondsPerTile * 1000,
      ease: 'linear',
      onUpdate: (tween) => {
        this.setFrame(tween.progress < 0.5 ? strideFrame : 'walkP');
        this.image.setDepth(depthForWorldY(this.image.y));
        this.syncLabel();
      },
      onComplete: () => {
        this.tile = next;
        this.stepTarget = null;
        this.stepTween = null;
        if (this.onStep !== null) this.onStep();
        this.stepNext();
      },
    });
  }
}
