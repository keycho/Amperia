import Phaser from 'phaser';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';

/**
 * Loads the curated Kenney assets and generates the procedural palette
 * placeholder textures, then hands off to the world.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    // Placeholder until M0.1 lands the iso world.
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'AMPERIA', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: PALETTE.neonAmber,
      })
      .setOrigin(0.5);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 44, 'keep the city lit', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT_WARM,
      })
      .setOrigin(0.5);
  }
}
