import Phaser from 'phaser';
import type { WorldMap } from '@shared/map';
import { PALETTE_INT } from '@shared/palette';
import type { TilePoint } from '@shared/pathfinding';
import { depthForWorldY, tileToWorld } from '../iso/project';
import { addVoxelSprite } from '../render/voxel';

/**
 * A harmless little Scuttlebot pottering around the plaza edge. Pure decor:
 * client-side only, steps tile-to-tile on walkable ground, skitters away
 * when a Spark gets close, and never interacts with anything.
 */
export class AmbientScuttlebot {
  readonly image: Phaser.GameObjects.Image;
  private readonly eye: Phaser.GameObjects.Image;
  private tile: TilePoint;
  private readonly scene: Phaser.Scene;
  private readonly map: WorldMap;
  private moving = false;
  private waitUntil = 0;

  constructor(scene: Phaser.Scene, map: WorldMap, tile: TilePoint) {
    this.scene = scene;
    this.map = map;
    this.tile = { ...tile };
    const { x, y } = tileToWorld(tile.x, tile.y);
    this.image = addVoxelSprite(scene, 'scuttlebot', x, y);
    this.image.setDepth(depthForWorldY(y));
    // Tiny eye-light so the critter reads in the dark stretches.
    this.eye = scene.add.image(x, y - 8, 'fx-glow');
    this.eye.setTint(PALETTE_INT.neonTeal);
    this.eye.setBlendMode(Phaser.BlendModes.ADD);
    this.eye.setScale(0.035);
    this.eye.setAlpha(0.55);
    this.syncEye();
  }

  private syncEye(): void {
    this.eye.setPosition(this.image.x + (this.image.flipX ? -5 : 5), this.image.y - 8);
    this.eye.setDepth(this.image.depth + 1);
  }

  /** Called every frame with the current Spark tiles. */
  update(timeNow: number, sparkTiles: TilePoint[]): void {
    if (this.moving || timeNow < this.waitUntil) return;
    const nearest = sparkTiles.reduce<{ d: number; t: TilePoint | null }>(
      (acc, t) => {
        const d = Math.max(Math.abs(t.x - this.tile.x), Math.abs(t.y - this.tile.y));
        return d < acc.d ? { d, t } : acc;
      },
      { d: Infinity, t: null },
    );
    const spooked = nearest.t !== null && nearest.d <= 2;
    const next = spooked
      ? this.pickStep((t) => this.awayScore(t, nearest.t as TilePoint))
      : this.pickStep((t) => this.ringScore(t));
    if (next === null) {
      this.waitUntil = timeNow + 700;
      return;
    }
    this.step(next, spooked, timeNow);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.image);
    this.eye.destroy();
    this.image.destroy();
  }

  /** Prefer staying on the plaza-edge ring; small random jitter. */
  private ringScore(t: TilePoint): number {
    const { cx, cy, radius } = this.map.plaza;
    const d = Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy));
    return -Math.abs(d - (radius + 1)) + Math.random() * 0.8;
  }

  private awayScore(t: TilePoint, threat: TilePoint): number {
    return Math.max(Math.abs(t.x - threat.x), Math.abs(t.y - threat.y)) + Math.random() * 0.3;
  }

  private pickStep(score: (t: TilePoint) => number): TilePoint | null {
    const options: TilePoint[] = [];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const t = { x: this.tile.x + dx, y: this.tile.y + dy };
      if (this.map.walkable[t.y]?.[t.x] === true) options.push(t);
    }
    if (options.length === 0) return null;
    options.sort((a, b) => score(b) - score(a));
    return options[0] as TilePoint;
  }

  private step(next: TilePoint, spooked: boolean, timeNow: number): void {
    this.moving = true;
    const to = tileToWorld(next.x, next.y);
    this.image.setFlipX(next.x - this.tile.x < 0 || next.y - this.tile.y > 0);
    this.scene.tweens.add({
      targets: this.image,
      x: to.x,
      y: to.y,
      duration: spooked ? 190 : 420,
      ease: 'sine.inout',
      onUpdate: () => {
        this.image.setDepth(depthForWorldY(this.image.y));
        this.syncEye();
      },
      onComplete: () => {
        this.tile = next;
        this.moving = false;
        this.waitUntil =
          timeNow + (spooked ? 40 : Phaser.Math.Between(500, 2600));
      },
    });
    // A skittery little hop as it goes.
    this.scene.tweens.add({
      targets: this.image,
      scaleY: this.image.scaleY * 0.88,
      duration: (spooked ? 190 : 420) / 2,
      yoyo: true,
      ease: 'sine.inout',
    });
  }
}
