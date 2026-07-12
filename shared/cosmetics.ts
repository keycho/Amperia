/**
 * Anchor-slot wardrobe (identity block I3, ART-DIRECTION §10.2). Cosmetics
 * are PRESENTATION ONLY — no stats, no gathering speed, no drop tables —
 * and every one of them is untradeable for now. Acquisitions are
 * ledger-logged server-side; premium cosmetics (none yet) will never drop
 * (golden rule 7).
 */

export const COSMETIC_SLOTS = ['head', 'back', 'jacket', 'tool', 'trail', 'nameGlow'] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  label: string;
  /** Where it comes from — honest sourcing copy for the wardrobe UI. */
  source: string;
}

export const COSMETICS: Record<string, CosmeticDef> = {
  /** THE hat. Final reward of the Dispatcher's tutorial chain. */
  bulbHat: {
    id: 'bulbHat',
    slot: 'head',
    label: 'The Bulb',
    source: 'Finish the Dispatcher chain',
  },
  alleyBeanie: {
    id: 'alleyBeanie',
    slot: 'head',
    label: 'Alley Beanie',
    source: 'A rare find in junk heaps',
  },
  starterScarf: {
    id: 'starterScarf',
    slot: 'jacket',
    label: 'Dispatch Scarf',
    source: 'Bench Work (Dispatcher chain)',
  },
  salvagerSatchel: {
    id: 'salvagerSatchel',
    slot: 'back',
    label: 'Salvager Satchel',
    source: 'Wide Hands (Dispatcher chain)',
  },
  brassToolSkin: {
    id: 'brassToolSkin',
    slot: 'tool',
    label: 'Brassbound Tools',
    source: 'Crafted at the Tinkerbench',
  },
  chargeTrim: {
    id: 'chargeTrim',
    slot: 'nameGlow',
    label: "Warden's Glow",
    source: 'Top-10 weekly Charge donors',
  },
  /** The weekly-goal seasonal (S2): a back banner, pure regalia. */
  circuitBanner: {
    id: 'circuitBanner',
    slot: 'back',
    label: 'Circuit Banner',
    source: 'Weekly goal regalia tokens',
  },
  /** The Coil-exclusive trail (S4): warm motes behind a walking Spark. */
  glimmerTrail: {
    id: 'glimmerTrail',
    slot: 'trail',
    label: 'Glimmer Trail',
    source: 'Coil shards from the daily free spin',
  },
  /** The full-Manifest trim (S1) — a cool teal glow, rarer than amber. */
  archivistGlow: {
    id: 'archivistGlow',
    slot: 'nameGlow',
    label: "Archivist's Glow",
    source: 'Complete the whole Manifest',
  },
};

export type EquippedMap = Partial<Record<CosmeticSlot, string>>;

/** Canonical wire/persistence form: 'back:satchel;head:bulbHat' (sorted). */
export function encodeEquipped(eq: EquippedMap): string {
  return COSMETIC_SLOTS.filter((s) => typeof eq[s] === 'string' && eq[s] !== '')
    .map((s) => `${s}:${eq[s] as string}`)
    .join(';');
}

/**
 * Strict parse: drops unknown ids, slot mismatches, and (when `owned` is
 * given) anything the Spark doesn't own. Never throws — bad input just
 * equips less.
 */
export function decodeEquipped(s: string, owned?: readonly string[]): EquippedMap {
  const out: EquippedMap = {};
  if (typeof s !== 'string' || s === '') return out;
  for (const part of s.split(';')) {
    const [slot, id] = part.split(':');
    if (slot === undefined || id === undefined) continue;
    if (!COSMETIC_SLOTS.includes(slot as CosmeticSlot)) continue;
    const def = COSMETICS[id];
    if (def === undefined || def.slot !== slot) continue;
    if (owned !== undefined && !owned.includes(id)) continue;
    out[slot as CosmeticSlot] = id;
  }
  return out;
}

/** Owned cosmetics for one slot (wardrobe UI rows). */
export function ownedForSlot(owned: readonly string[], slot: CosmeticSlot): CosmeticDef[] {
  return owned
    .map((id) => COSMETICS[id])
    .filter((d): d is CosmeticDef => d !== undefined && d.slot === slot);
}
