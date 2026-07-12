// Curated Kenney CC0 sprites, imported through Vite's asset pipeline so dev
// and production builds both resolve them from /assets at the repo root.
// World objects are voxel-baked in code (render/voxel*.ts) and item
// thumbnails bake from the same pipeline (render/itemThumbs.ts); Kenney is
// kept ONLY for UI chrome (9-slice, always re-tinted to the palette),
// abstract glyphs, and particles per ART-DIRECTION §12A.6.
import fxGlow from '@assets/kenney_particle-pack/circle_05.png';
import fxSpark from '@assets/kenney_particle-pack/spark_05.png';
import iconGear from '@assets/kenney_game-icons/gear.png';
import emoteWave from '@assets/kenney_emotes/emote_faceHappy.png';
import emoteSit from '@assets/kenney_emotes/emote_sleep.png';
import emoteCheer from '@assets/kenney_emotes/emote_stars.png';
import emotePoint from '@assets/kenney_emotes/emote_exclamation.png';
import uiPanelScrews from '@assets/kenney_ui-pack/panel-screws.png';
import uiSlotInset from '@assets/kenney_ui-pack/slot-inset.png';
import uiButtonFlat from '@assets/kenney_ui-pack/button-flat.png';

/** key → URL, loaded verbatim by BootScene. */
export const IMAGE_MANIFEST: Readonly<Record<string, string>> = {
  'fx-glow': fxGlow,
  'fx-spark': fxSpark,
  // Abstract glyph only — concrete items are voxel thumbs.
  'icon-gear': iconGear,
  // U4b: pixel emote-bubble glyphs (wheel icons + in-world bubbles).
  'emote-wave': emoteWave,
  'emote-sit': emoteSit,
  'emote-cheer': emoteCheer,
  'emote-point': emotePoint,
  // 9-slice chrome (grey source, ALWAYS tinted ink/plum — never stock).
  'ui-panel-screws': uiPanelScrews,
  'ui-slot-inset': uiSlotInset,
  'ui-button-flat': uiButtonFlat,
};
