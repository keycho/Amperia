import Phaser from 'phaser';
import { PALETTE } from '@shared/palette';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { gameState } from './state/GameState';

declare global {
  interface Window {
    /** Debug/verification handle (screenshot harness, manual poking). */
    __amperia?: { game: Phaser.Game; gameState: typeof gameState };
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
  scene: [BootScene, LoginScene, WorldScene, UIScene],
});

window.__amperia = { game, gameState };
