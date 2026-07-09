import Phaser from 'phaser';
import { PALETTE } from '@shared/palette';
import { STYLE } from './render/styleConfig';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { voxelSprite } from './render/voxel';
import { gameState } from './state/GameState';

declare global {
  interface Window {
    /** Debug/verification handle (screenshot harness, manual poking). */
    __amperia?: {
      game: Phaser.Game;
      gameState: typeof gameState;
      voxelSprite: typeof voxelSprite;
    };
  }
}

// Style C: low internal resolution with nearest-neighbour upscale.
const pixelScale =
  STYLE.pixelHeight !== null
    ? {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.round((STYLE.pixelHeight * 16) / 9),
        height: STYLE.pixelHeight,
      }
    : {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      };

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.duskSky,
  scale: pixelScale,
  render: {
    antialias: STYLE.pixelHeight === null,
    pixelArt: STYLE.pixelHeight !== null,
    roundPixels: STYLE.pixelHeight !== null,
  },
  scene: [BootScene, LoginScene, WorldScene, UIScene],
});

if (STYLE.pixelHeight !== null) {
  // Nearest-neighbour CSS upscale for the canvas.
  game.canvas.style.imageRendering = 'pixelated';
}

window.__amperia = { game, gameState, voxelSprite };
