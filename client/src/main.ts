import Phaser from 'phaser';
import { MATERIAL_COLORS } from '@shared/palette';
import { installErrorBoundary } from './errorBoundary';
import { STYLE } from './render/styleConfig';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { voxelSprite } from './render/voxel';
import { auditTexts } from './debug/textAudit';
import { bakeSparkAppearance, equipKey } from './render/sparkModel';
import { decodeEquipped } from '@shared/cosmetics';
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
      /**
       * PHOTO MODE — every marketing shot goes through this. `enter`
       * hides all UI (HUD, hotbar, chat hint, panels; player nameplates
       * unless `nameplates: true`), locks the camera on `tile` at `zoom`.
       * Render size = browser viewport (size the window to 2560×1440).
       */
      photo: {
        enter: (opts: { tile: { x: number; y: number }; zoom?: number; nameplates?: boolean }) => void;
        exit: () => void;
      };
      /** Bake a Spark appearance and return its baked texture key for a dir
       *  (verification harness: the lineup + silhouette checkpoints). */
      bakeSpark?: (code: string, dir?: string, equipped?: string) => string;
      /** F4: the overlap detector's data feed — every visible text's screen
       *  box + owning plate. Consumed by client/tests/overlapTour.mjs. */
      textAudit?: () => import('./debug/textAudit').AuditReport;
    };
  }
}

// U6c: never a white screen — errors log, veil, and re-light.
installErrorBoundary();

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

window.__amperia = {
  game,
  gameState,
  voxelSprite,
  session,
  photo: {
    enter: (opts) => (game.scene.getScene('world') as WorldScene).enterPhotoMode(opts),
    exit: () => (game.scene.getScene('world') as WorldScene).exitPhotoMode(),
  },
  bakeSpark: (code, dir = 'sw', equipped = '') => {
    const scene = game.scene.getScene('world');
    bakeSparkAppearance(scene, code, { previewOnly: true, equipped });
    return voxelSprite(`spark@${code}#${equipKey(decodeEquipped(equipped))}-${dir}`).key;
  },
  textAudit: () => auditTexts(game),
};

// Sound stays silent until the first real gesture (autoplay policy), then
// comes up at the persisted volume.
const unlockOnce = () => sound.unlock();
window.addEventListener('pointerdown', unlockOnce, { once: true });
window.addEventListener('keydown', unlockOnce, { once: true });
