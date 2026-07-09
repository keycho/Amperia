import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { rollGather, rollGlintTime } from '@shared/gathering';
import { ITEMS } from '@shared/items';
import { findPathAdjacent, type PathGrid } from '@shared/pathfinding';
import { PALETTE, PALETTE_INT } from '@shared/palette';
import { makeRng, type Rng } from '@shared/rng';
import type { JunkHeapNode } from '../entities/JunkHeapNode';
import type { Spark } from '../entities/Spark';
import { floatText } from '../render/effects';
import { gameState } from '../state/GameState';

interface GatherSession {
  node: JunkHeapNode;
  elapsed: number;
  glintAt: number;
  glintShown: boolean;
  glintExpired: boolean;
  glintHit: boolean;
}

/**
 * Drives the click → walk → gather → glint → loot loop for junk heaps.
 * Timing/values all come from CONFIG; the value math is shared/gathering.ts.
 */
export class GatherController {
  private readonly scene: Phaser.Scene;
  private readonly spark: Spark;
  private readonly grid: PathGrid;
  private readonly rng: Rng;
  private session: GatherSession | null = null;
  private readonly progressBar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, spark: Spark, grid: PathGrid, seed: number) {
    this.scene = scene;
    this.spark = spark;
    this.grid = grid;
    this.rng = makeRng(seed);
    this.progressBar = scene.add.graphics();
    this.progressBar.setDepth(1e9 - 1);
    this.progressBar.setVisible(false);
  }

  get isGathering(): boolean {
    return this.session !== null;
  }

  /** Click on a heap: walk adjacent if needed, then start the gather cycle. */
  requestGather(node: JunkHeapNode): void {
    if (node.depleted) return;
    if (this.session?.node === node) return;
    this.cancel();
    const path = findPathAdjacent(this.grid, this.spark.settledTile, {
      x: node.tile.x,
      y: node.tile.y,
      w: 1,
      h: 1,
    });
    if (path === null) return;
    if (path.length === 0 && !this.spark.isMoving) {
      this.begin(node);
    } else {
      this.spark.walk(path, () => this.begin(node));
    }
  }

  /** Player walked away / clicked elsewhere: abort the cycle. */
  cancel(): void {
    if (this.session !== null) {
      this.session.node.hideGlint();
      this.session = null;
    }
    this.progressBar.setVisible(false);
  }

  /** Called by the glint sprite's pointer handler. */
  onGlintClicked(node: JunkHeapNode): void {
    const s = this.session;
    if (s === null || s.node !== node || !s.glintShown || s.glintExpired || s.glintHit) return;
    s.glintHit = true;
    node.flashGlintHit();
  }

  private begin(node: JunkHeapNode): void {
    if (node.depleted) return;
    // Face the heap.
    if (node.image.x < this.spark.image.x) this.spark.image.setFlipX(true);
    else if (node.image.x > this.spark.image.x) this.spark.image.setFlipX(false);

    const cfg = CONFIG.gathering.junkHeap;
    this.session = {
      node,
      elapsed: 0,
      glintAt: rollGlintTime(cfg, cfg.gatherSeconds, this.rng),
      glintShown: false,
      glintExpired: false,
      glintHit: false,
    };
    this.progressBar.setVisible(true);
  }

  update(deltaMs: number): void {
    const s = this.session;
    if (s === null) return;
    const cfg = CONFIG.gathering.junkHeap;
    s.elapsed += deltaMs / 1000;

    // Glint lifecycle.
    if (!s.glintShown && s.elapsed >= s.glintAt) {
      s.glintShown = true;
      s.node.showGlint(this.rng());
    }
    if (s.glintShown && !s.glintExpired && !s.glintHit) {
      if (s.elapsed >= s.glintAt + cfg.glint.windowSeconds) {
        s.glintExpired = true;
        s.node.hideGlint();
      }
    }

    // Progress bar above the heap.
    const progress = Math.min(1, s.elapsed / cfg.gatherSeconds);
    this.drawProgress(s.node, progress);

    if (progress >= 1) this.complete(s);
  }

  private drawProgress(node: JunkHeapNode, progress: number): void {
    const g = this.progressBar;
    const x = node.image.x - 24;
    const y = node.image.y - 66;
    g.clear();
    g.fillStyle(PALETTE_INT.ink, 0.6);
    g.fillRoundedRect(x, y, 48, 8, 4);
    g.fillStyle(PALETTE_INT.neonTeal);
    g.fillRoundedRect(x + 1.5, y + 1.5, Math.max(5, 45 * progress), 5, 2.5);
  }

  private complete(s: GatherSession): void {
    const cfg = CONFIG.gathering.junkHeap;
    const roll = rollGather(cfg, s.glintHit, this.rng);
    this.session = null;
    this.progressBar.setVisible(false);
    s.node.hideGlint();

    const added = gameState.addItem('salvage', roll.amount);
    const nx = s.node.image.x;
    const ny = s.node.image.y - 70;
    if (added > 0) {
      floatText(this.scene, nx, ny, `+${added} ${ITEMS.salvage.name}`);
    } else {
      floatText(this.scene, nx, ny, 'Pack is full!', PALETTE.neonRose);
    }
    if (roll.rare !== null && gameState.addItem(roll.rare, 1) > 0) {
      floatText(this.scene, nx, ny - 20, `+1 ${ITEMS[roll.rare].name} ✦`, PALETTE.neonAmber);
    }

    s.node.setDepleted(true);
    this.scene.time.delayedCall(cfg.respawnSeconds * 1000, () => s.node.setDepleted(false));
  }
}
