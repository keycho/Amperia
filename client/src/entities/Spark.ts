import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { TilePoint } from '@shared/pathfinding';
import { depthForWorldY, tileToWorld } from '../iso/project';
import { worldSpriteTint } from '../render/styleConfig';
import { voxelSprite } from '../render/voxel';

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

  constructor(scene: Phaser.Scene, tile: TilePoint, name?: string) {
    this.scene = scene;
    this.tile = { ...tile };
    const { x, y } = tileToWorld(tile.x, tile.y);
    const baked = voxelSprite('spark-se');
    this.image = scene.add.image(x, y, baked.key);
    this.image.setOrigin(baked.originX, baked.originY);
    this.image.setScale(baked.scale);
    const wt = worldSpriteTint();
    if (wt !== null) this.image.setTint(wt);
    this.image.setDepth(depthForWorldY(y));
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

  /** Voxel-bake facing: SE/SW use the front bake, NE/NW the back bake. */
  private face(dx: number, dy: number): void {
    let name: 'spark-se' | 'spark-ne' | null = null;
    let flip = false;
    if (dx > 0) [name, flip] = ['spark-se', false];
    else if (dx < 0) [name, flip] = ['spark-ne', true];
    else if (dy > 0) [name, flip] = ['spark-se', true];
    else if (dy < 0) [name, flip] = ['spark-ne', false];
    if (name === null) return;
    const baked = voxelSprite(name);
    this.image.setTexture(baked.key);
    this.image.setOrigin(baked.originX, baked.originY);
    this.image.setFlipX(flip);
  }

  setNameLabel(name: string): void {
    this.label?.destroy();
    this.label = this.scene.add.text(this.image.x, this.image.y, name, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_TEXT_WARM,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    this.label.setOrigin(0.5, 1);
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
    this.syncLabel();
  }

  private syncLabel(): void {
    if (this.label === null) return;
    this.label.setPosition(
      this.image.x,
      this.image.y - this.image.displayHeight + 6 + this.labelRise.value,
    );
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
    bubble.setAlpha(0);
    this.bubble = bubble;
    this.bubbleHeight = h;
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
      this.image.y - this.image.displayHeight - 16 - this.bubbleHeight / 2,
    );
    this.bubble.setDepth(this.image.depth + 2);
  }

  /** A melee swing: short lunge toward the target and back. */
  lungeToward(worldX: number, worldY: number): void {
    const ox = this.image.x;
    const oy = this.image.y;
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
    this.stepTween?.stop();
    this.scene.tweens.killTweensOf(this.image);
    this.scene.tweens.killTweensOf(this.labelRise);
    this.bubble?.destroy();
    this.label?.destroy();
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
      if (done !== null) done();
      return;
    }
    this.stepTarget = next;
    const to = tileToWorld(next.x, next.y);
    this.face(next.x - this.tile.x, next.y - this.tile.y);

    this.stepTween = this.scene.tweens.add({
      targets: this.image,
      x: to.x,
      y: to.y,
      duration: CONFIG.player.secondsPerTile * 1000,
      ease: 'linear',
      onUpdate: () => {
        this.image.setDepth(depthForWorldY(this.image.y));
        this.syncLabel();
      },
      onComplete: () => {
        this.tile = next;
        this.stepTarget = null;
        this.stepTween = null;
        this.stepNext();
      },
    });
  }
}
