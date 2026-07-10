import Phaser from 'phaser';
import { MATERIAL_COLORS } from '@shared/palette';
import { STYLE } from './render/styleConfig';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { voxelSprite } from './render/voxel';
import { session } from './net/session';
import { gameState } from './state/GameState';
import { sound } from './audio/sound';

declare global {
  interface Window {
    /** Debug/verification handle (screenshot harness, manual poking). */
    __amperia?: {
      game: Phaser.Game;
      gameState: typeof gameState;
      voxelSprite: typeof voxelSprite;
      session: typeof session;
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
  backgroundColor: MATERIAL_COLORS.voidBlack,
  scale: pixelScale,
  // SHARPNESS (render-overhaul addendum a): the whole scene renders
  // nearest-neighbor with rounded positions — voxel facets stay hard at
  // every zoom step (the camera clamps zoom to texel-stable ratios).
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scene: [BootScene, LoginScene, WorldScene, UIScene],
});

if (STYLE.pixelHeight !== null) {
  // Nearest-neighbour CSS upscale for the canvas.
  game.canvas.style.imageRendering = 'pixelated';
}

window.__amperia = { game, gameState, voxelSprite, session };

// Sound stays silent until the first real gesture (autoplay policy), then
// comes up at the persisted volume.
const unlockOnce = () => sound.unlock();
window.addEventListener('pointerdown', unlockOnce, { once: true });
window.addEventListener('keydown', unlockOnce, { once: true });
