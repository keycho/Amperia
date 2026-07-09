import Phaser from 'phaser';
import { IMAGE_MANIFEST } from '../render/assetManifest';
import {
  makeDynamoTexture,
  makeItemIconTextures,
  makeJunkHeapTextures,
  makePlanterTexture,
  makeSparkTexture,
  makeTileMarkerTextures,
} from '../render/textures';

/**
 * Loads curated Kenney sprites, generates procedural palette placeholders,
 * then starts the world.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    for (const [key, url] of Object.entries(IMAGE_MANIFEST)) {
      this.load.image(key, url);
    }
  }

  create(): void {
    makeDynamoTexture(this);
    makePlanterTexture(this);
    makeSparkTexture(this);
    makeTileMarkerTextures(this);
    makeJunkHeapTextures(this);
    makeItemIconTextures(this);
    this.scene.start('world');
  }
}
