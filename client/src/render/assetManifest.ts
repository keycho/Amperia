// Curated Kenney CC0 sprites, imported through Vite's asset pipeline so dev
// and production builds both resolve them from /assets at the repo root.
import block0 from '@assets/kenney_isometric-blocks/voxelTile_09.png';
import block1 from '@assets/kenney_isometric-blocks/voxelTile_29.png';
import block2 from '@assets/kenney_isometric-blocks/voxelTile_30.png';
import block3 from '@assets/kenney_isometric-blocks/voxelTile_42.png';
import crate0 from '@assets/kenney_isometric-blocks/platformerTile_22.png';
import crate1 from '@assets/kenney_isometric-blocks/platformerTile_23.png';
import stall0 from '@assets/kenney_isometric-buildings/buildingTiles_004.png';
import stall1 from '@assets/kenney_isometric-buildings/buildingTiles_012.png';
import stall2 from '@assets/kenney_isometric-buildings/buildingTiles_020.png';
import stall3 from '@assets/kenney_isometric-buildings/buildingTiles_030.png';
import fxGlow from '@assets/kenney_particle-pack/circle_05.png';
import fxSpark from '@assets/kenney_particle-pack/spark_05.png';

/** key → URL, loaded verbatim by BootScene. */
export const IMAGE_MANIFEST: Readonly<Record<string, string>> = {
  'block-0': block0,
  'block-1': block1,
  'block-2': block2,
  'block-3': block3,
  'crate-0': crate0,
  'crate-1': crate1,
  'stall-0': stall0,
  'stall-1': stall1,
  'stall-2': stall2,
  'stall-3': stall3,
  'fx-glow': fxGlow,
  'fx-spark': fxSpark,
};
