import Phaser from 'phaser';
import { PALETTE } from '@shared/palette';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

declare global {
  interface Window {
    /** Debug/verification handle (screenshot harness, manual poking). */
    __amperia?: { game: Phaser.Game };
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.duskSky,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [BootScene, WorldScene],
});

window.__amperia = { game };
