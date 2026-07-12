import Phaser from 'phaser';
import { PALETTE_INT } from '@shared/palette';
import type { NodeView } from '../entities/nodes';

/**
 * Presentation of the OWN player's gather cycle, driven entirely by server
 * events (gatherStart/gatherStop/loot). The bar animates the server-declared
 * duration; the server's completion is the source of truth.
 */
export class GatherView {
  private readonly scene: Phaser.Scene;
  private readonly bar: Phaser.GameObjects.Graphics;
  private node: NodeView | null = null;
  private startedAt = 0;
  private seconds = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bar = scene.add.graphics();
    this.bar.setDepth(1e9 - 1);
    this.bar.setVisible(false);
  }

  start(node: NodeView, seconds: number): void {
    this.node = node;
    this.seconds = Math.max(0.05, seconds);
    this.startedAt = this.scene.time.now;
    this.bar.setVisible(true);
  }

  stop(): void {
    this.node = null;
    this.bar.setVisible(false);
  }

  update(): void {
    if (this.node === null) return;
    const progress = Math.min(1, (this.scene.time.now - this.startedAt) / 1000 / this.seconds);
    const x = this.node.image.x - 24;
    // Hover just above the model; cap so tall models (antenna) keep the bar
    // near the Spark instead of at the mast top.
    const img = this.node.image;
    const above = Math.min(img.displayHeight * img.originY, 72);
    const y = img.y - above - 14;
    this.bar.clear();
    this.bar.fillStyle(PALETTE_INT.ink, 0.6);
    this.bar.fillRoundedRect(x, y, 48, 8, 4);
    this.bar.fillStyle(PALETTE_INT.neonTeal);
    this.bar.fillRoundedRect(x + 1.5, y + 1.5, Math.max(5, 45 * progress), 5, 2.5);
  }
}
