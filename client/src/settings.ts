/**
 * Client settings (U3b) — small, persisted, presentation-only. Volume
 * lives in the sound module (its own key predates this); everything else
 * rides one JSON blob.
 */

export interface Settings {
  /** Show player nameplates in the world. */
  nameplates: boolean;
  /** Camera shake on hits. */
  shake: boolean;
  /** Texel grit: '6' (the shipped look) · '8' · 'none'. Applies on reload. */
  grit: '6' | '8' | 'none';
  /** Corner minimap (U4a), toggled with M. */
  minimap: boolean;
  /** PP3: the WebGL post pipeline (vignette + emissive bloom + grade). */
  postfx: boolean;
}

const KEY = 'amperia.settings';
const DEFAULTS: Settings = {
  nameplates: true,
  shake: true,
  grit: '6',
  minimap: true,
  postfx: true,
};

let cache: Settings | null = null;

export function settings(): Settings {
  if (cache !== null) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    cache = {
      nameplates: typeof raw.nameplates === 'boolean' ? raw.nameplates : DEFAULTS.nameplates,
      shake: typeof raw.shake === 'boolean' ? raw.shake : DEFAULTS.shake,
      grit: raw.grit === '8' || raw.grit === 'none' ? raw.grit : DEFAULTS.grit,
      minimap: typeof raw.minimap === 'boolean' ? raw.minimap : DEFAULTS.minimap,
      postfx: typeof raw.postfx === 'boolean' ? raw.postfx : DEFAULTS.postfx,
    };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const s = settings();
  s[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full/blocked — the session keeps the in-memory value
  }
}
