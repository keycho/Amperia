import { blendInt, MATERIAL_INT, PALETTE_INT } from './palette';

/**
 * Spark appearance (identity block I2): the character creator's option
 * tables, shared by client (rendering, creator UI) and server (validation,
 * persistence). Presentation only — appearance NEVER touches gameplay.
 *
 * All colors are sanctioned derivations of the locked palette / material
 * tables via blendInt, so palette.ts remains the single audit point.
 */

/** Warm skin tones — index 0 is the mascot's warm sand. */
export const SKIN_TONES: readonly number[] = [
  MATERIAL_INT.skin,
  blendInt(MATERIAL_INT.skin, PALETTE_INT.warmGlow, 0.45),
  blendInt(MATERIAL_INT.skin, PALETTE_INT.groundAccent, 0.55),
  blendInt(MATERIAL_INT.skin, MATERIAL_INT.rust, 0.55),
  blendInt(blendInt(MATERIAL_INT.skin, MATERIAL_INT.rustDeep, 0.72), PALETTE_INT.ink, 0.12),
  // U2b: pale lamplight + deep umber round out the range.
  blendInt(MATERIAL_INT.skin, PALETTE_INT.warmGlow, 0.68),
  blendInt(blendInt(MATERIAL_INT.skin, MATERIAL_INT.rustDeep, 0.85), PALETTE_INT.ink, 0.3),
];

export interface HairStyleDef {
  id: string;
  label: string;
}

/** Index 0 is the mascot's mop. Geometry lives in the client model builder. */
export const HAIR_STYLES: readonly HairStyleDef[] = [
  { id: 'mop', label: 'The Mop' },
  { id: 'spikes', label: 'Sparkplugs' },
  { id: 'buns', label: 'Coil Buns' },
  { id: 'crest', label: 'The Crest' },
  { id: 'bowl', label: 'Bellhousing' },
  { id: 'tail', label: 'Cable Tail' },
  // U2b: four more silhouettes, each distinct at play zoom.
  { id: 'undercut', label: 'Undercut' },
  { id: 'braid', label: 'Long Braid' },
  { id: 'slick', label: 'Slicked Back' },
  { id: 'frizz', label: 'Wild Frizz' },
];

/** Hair colors (main tone; light/deep derive in the model builder). */
export const HAIR_COLORS: readonly number[] = [
  blendInt(PALETTE_INT.neonRose, PALETTE_INT.structureMid, 0.12), // rose (mascot)
  blendInt(PALETTE_INT.emberOrange, PALETTE_INT.structureMid, 0.15),
  blendInt(PALETTE_INT.neonTeal, PALETTE_INT.structureMid, 0.3),
  blendInt(PALETTE_INT.neonCyan, PALETTE_INT.structureMid, 0.3),
  blendInt(PALETTE_INT.violetNeon, PALETTE_INT.structureMid, 0.32),
  blendInt(PALETTE_INT.ink, PALETTE_INT.structureMid, 0.45), // soot
];

/** Jacket colors (main tone) — index 0 is the mascot's plum. */
export const JACKET_COLORS: readonly number[] = [
  blendInt(PALETTE_INT.duskSky, PALETTE_INT.structureMid, 0.68), // plum (mascot)
  blendInt(MATERIAL_INT.rust, PALETTE_INT.structureMid, 0.2),
  blendInt(MATERIAL_INT.paintTeal, PALETTE_INT.structureMid, 0.15),
  blendInt(MATERIAL_INT.paintOchre, PALETTE_INT.structureMid, 0.15),
  blendInt(MATERIAL_INT.paintRose, PALETTE_INT.structureMid, 0.15),
  // U2b: gunmetal work coat, garden green, ember bomber.
  blendInt(MATERIAL_INT.gunmetal, PALETTE_INT.structureMid, 0.25),
  blendInt(PALETTE_INT.solarGreen, PALETTE_INT.structureMid, 0.4),
  blendInt(PALETTE_INT.emberOrange, PALETTE_INT.structureMid, 0.45),
];

export interface AccessoryDef {
  id: string;
  label: string;
}

export const ACCESSORIES: readonly AccessoryDef[] = [
  { id: 'none', label: 'None' },
  { id: 'stud', label: 'Amber Stud' },
  { id: 'pin', label: 'Antenna Pin' },
  { id: 'patch', label: 'Teal Patch' },
  // U2b: three more bits of face flair.
  { id: 'cuff', label: 'Ear Cuff' },
  { id: 'smudge', label: 'Cheek Smudge' },
  { id: 'scar', label: 'Brow Scar' },
];

/** Numeric indices into the tables above. */
export interface Appearance {
  skin: number;
  hair: number;
  hairColor: number;
  jacket: number;
  accessory: number;
}

/** The mascot preset — every table's index 0 (rose mop, plum jacket). */
export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0,
  hair: 0,
  hairColor: 0,
  jacket: 0,
  accessory: 0,
};

const FIELDS: Array<[keyof Appearance, number]> = [
  ['skin', SKIN_TONES.length],
  ['hair', HAIR_STYLES.length],
  ['hairColor', HAIR_COLORS.length],
  ['jacket', JACKET_COLORS.length],
  ['accessory', ACCESSORIES.length],
];

/** Compact wire/persistence form, e.g. "1:0:0:0:0:0" (version-prefixed). */
export function encodeAppearance(a: Appearance): string {
  return `1:${a.skin}:${a.hair}:${a.hairColor}:${a.jacket}:${a.accessory}`;
}

/** Strict parse + range validation; null on anything malformed. */
export function decodeAppearance(s: string): Appearance | null {
  const parts = s.split(':');
  if (parts.length !== 6 || parts[0] !== '1') return null;
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i] as [keyof Appearance, number];
    const raw = parts[i + 1] as string;
    if (!/^\d{1,2}$/.test(raw)) return null;
    const v = Number(raw);
    if (v >= field[1]) return null;
    out[field[0]] = v;
  }
  return out;
}

export const DEFAULT_APPEARANCE_CODE = encodeAppearance(DEFAULT_APPEARANCE);

/** Spark name rule (creator, first login only): 3-16 word-ish chars. */
export const SPARK_NAME_RE = /^[A-Za-z][A-Za-z0-9 _-]{2,15}$/;
