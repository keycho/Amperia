import Phaser from 'phaser';
import { IMAGE_MANIFEST } from '../render/assetManifest';
import { bakeCoreVoxelModels } from '../render/voxelModels';
import { bakeWorldVoxelModels } from '../render/voxelWorldModels';
import {
  makeItemIconTextures,
  makeKoiTextures,
  makeTileMarkerTextures,
} from '../render/textures';

/**
 * Loads curated Kenney UI/icon/particle sprites, bakes the voxel world set
 * and the remaining procedural fx textures, then starts the world.
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
    makeTileMarkerTextures(this);
    makeItemIconTextures(this);
    makeKoiTextures(this);
    bakeCoreVoxelModels(this);
    bakeWorldVoxelModels(this);
    this.scene.start('login');
  }
}
