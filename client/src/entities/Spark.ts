import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import type { TilePoint } from '@shared/pathfinding';
import { depthForWorldY, tileToWorld } from '../iso/project';
import { TEX_SCALE } from '../render/textures';

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

  constructor(scene: Phaser.Scene, tile: TilePoint) {
    this.scene = scene;
    this.tile = { ...tile };
    const { x, y } = tileToWorld(tile.x, tile.y);
    this.image = scene.add.image(x, y, 'tex-spark');
    this.image.setOrigin(0.5, 0.9);
    this.image.setScale(TEX_SCALE * 1.45);
    this.image.setDepth(depthForWorldY(y));
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
    // Face the walk direction (sprite is drawn facing right/east-ish).
    if (to.x < this.image.x) this.image.setFlipX(true);
    else if (to.x > this.image.x) this.image.setFlipX(false);

    this.stepTween = this.scene.tweens.add({
      targets: this.image,
      x: to.x,
      y: to.y,
      duration: CONFIG.player.secondsPerTile * 1000,
      ease: 'linear',
      onUpdate: () => this.image.setDepth(depthForWorldY(this.image.y)),
      onComplete: () => {
        this.tile = next;
        this.stepTarget = null;
        this.stepTween = null;
        this.stepNext();
      },
    });
  }
}
