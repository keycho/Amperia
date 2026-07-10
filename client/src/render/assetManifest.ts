// Curated Kenney CC0 sprites, imported through Vite's asset pipeline so dev
// and production builds both resolve them from /assets at the repo root.
// World objects are voxel-baked in code (render/voxel*.ts); Kenney is kept
// only for UI, item icons, and particles per ART-DIRECTION §12A.6.
import fxGlow from '@assets/kenney_particle-pack/circle_05.png';
import fxSpark from '@assets/kenney_particle-pack/spark_05.png';
import iconBrass from '@assets/kenney_voxel-pack/ore_gold.png';
import iconAmperite from '@assets/kenney_voxel-pack/ore_diamond.png';
import iconOreIron from '@assets/kenney_voxel-pack/ore_iron.png';
import iconFish from '@assets/kenney_voxel-pack/fish.png';
import iconFishingPole from '@assets/kenney_voxel-pack/fishingPole.png';
import iconHammer from '@assets/kenney_voxel-pack/hammer_iron.png';
import iconPick from '@assets/kenney_voxel-pack/pick_iron.png';
import iconWrench from '@assets/kenney_game-icons/wrench.png';
import iconStar from '@assets/kenney_game-icons/star.png';
import iconSignal from '@assets/kenney_game-icons/signal2.png';

/** key → URL, loaded verbatim by BootScene. */
export const IMAGE_MANIFEST: Readonly<Record<string, string>> = {
  'fx-glow': fxGlow,
  'fx-spark': fxSpark,
  'icon-brass': iconBrass,
  'icon-amperite': iconAmperite,
  'icon-blue-hot-brass': iconOreIron,
  'icon-glowkoi': iconFish,
  'icon-prismatic-glowkoi': iconFish,
  'icon-skimnet': iconFishingPole,
  'icon-drillhammer': iconHammer,
  'icon-magclaw': iconPick,
  'icon-riveter': iconWrench,
  'icon-heatlamp': iconStar,
  'icon-signal': iconSignal,
  'icon-ghost-frequency': iconSignal,
  'icon-tuner': iconSignal,
};
