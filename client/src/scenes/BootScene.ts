import Phaser from 'phaser';
import { IMAGE_MANIFEST } from '../render/assetManifest';
import { makeAtmosphereTextures } from '../render/atmosphere';
import { bakeFloorTiles } from '../render/floorTiles';
import { bakeItemThumbs } from '../render/itemThumbs';
import { bakeSparkModels } from '../render/sparkModel';
import { bakeCoreVoxelModels } from '../render/voxelModels';
import { bakeWorldVoxelModels } from '../render/voxelWorldModels';
import {
  makeKoiTextures,
  makeShadowTextures,
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
    bakeItemThumbs(this);
    makeKoiTextures(this);
    makeShadowTextures(this);
    makeAtmosphereTextures(this);
    bakeCoreVoxelModels(this);
    bakeSparkModels(this);
    bakeWorldVoxelModels(this);
    bakeFloorTiles(this);
    this.scene.start('login');
  }
}
