import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
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
    this.syncLabel();
  }

  private syncLabel(): void {
    if (this.label === null) return;
    this.label.setPosition(this.image.x, this.image.y - this.image.displayHeight + 6);
    this.label.setDepth(this.image.depth + 1);
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
