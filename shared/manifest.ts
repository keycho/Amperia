import { COSMETICS } from './cosmetics';

/**
 * The Manifest (S1) — the account-wide collection log. Pages group entries
 * by how a Spark lives (per skill, mobs, the wardrobe); every entry is a
 * REAL thing the game already grants (rare finds, trophies, cosmetics).
 * Everything here is untradeable, ever — the Manifest is memory, not market.
 */

export type ManifestPageId =
  | 'scavving'
  | 'delving'
  | 'skimming'
  | 'tuning'
  | 'gardens'
  | 'mobs'
  | 'errands'
  | 'story'
  | 'wardrobe';

export interface ManifestPageDef {
  id: ManifestPageId;
  label: string;
  /** Comms-safe flavor under the tab. */
  blurb: string;
}

export const MANIFEST_PAGES: readonly ManifestPageDef[] = [
  { id: 'scavving', label: 'Scavving', blurb: 'What the junk gave up.' },
  { id: 'delving', label: 'Delving', blurb: 'What the seams were hiding.' },
  { id: 'skimming', label: 'Skimming', blurb: 'What the canal let go.' },
  { id: 'tuning', label: 'Tuning', blurb: 'What the static was saying.' },
  { id: 'gardens', label: 'Gardens', blurb: 'What the Terrarium let you keep.' },
  { id: 'mobs', label: 'Junkbots', blurb: 'What the ferals left behind.' },
  { id: 'errands', label: 'Errands', blurb: 'What the city trusted you with.' },
  { id: 'story', label: 'The Long Dark', blurb: 'What the city remembers, chapter by chapter.' },
  { id: 'wardrobe', label: 'Wardrobe', blurb: 'What the city put on your back.' },
];

export type ManifestSource = 'item' | 'cosmetic';

export interface ManifestEntryDef {
  id: string;
  page: ManifestPageId;
  label: string;
  /** Undiscovered hint — a nudge, never a spoiler of exact mechanics. */
  hint: string;
  /** 'item' → itemId (thumbnail via item thumbs) · 'cosmetic' → cosmetic id. */
  source: ManifestSource;
  refId: string;
}

const E = (
  id: string,
  page: ManifestPageId,
  label: string,
  hint: string,
  source: ManifestSource,
  refId = id,
): ManifestEntryDef => ({ id, page, label, hint, source, refId });

export const MANIFEST_ENTRIES: readonly ManifestEntryDef[] = [
  // Rare gather variants — wired to the EXISTING glint/pulse rare rolls.
  E('gildedScrap', 'scavving', 'Gilded Scrap', 'Sharp eyes on the glint spots.', 'item'),
  E('blueHotBrass', 'delving', 'Blue-Hot Brass', 'Some seams never cooled.', 'item'),
  E(
    'prismaticGlowkoi',
    'skimming',
    'Prismatic Glowkoi',
    'The canal keeps one strange fish.',
    'item',
  ),
  E('ghostFrequency', 'tuning', 'Ghost Frequency', 'Locked signal, steady hands.', 'item'),
  // The Terrarium's compost secrets (D2c).
  E('silverfern', 'gardens', 'Silverfern', 'The compost keeps what the beds lose.', 'item'),
  E('emberseed', 'gardens', 'Emberseed', 'Sharp eyes on the garden glints.', 'item'),
  // Mob trophies.
  E('dentedCrest', 'mobs', 'Dented Crest', 'Feral Scuttlebots wear their history.', 'item'),
  E('wispFilament', 'mobs', 'Wisp Filament', 'The Stacks alleys hum with loose charge.', 'item'),
  E('drayPlate', 'mobs', 'Dray Plate', 'Something heavy walks the Tangle, sometimes.', 'item'),
  E('waxChit', 'errands', 'Wax-Sealed Chit', 'Some recipients tip in keepsakes.', 'item'),
  // The wardrobe (cosmetics are Manifest entries too).
  E('bulbHat', 'wardrobe', 'The Bulb', 'Finish what the Dispatcher starts.', 'cosmetic'),
  E('alleyBeanie', 'wardrobe', 'Alley Beanie', 'Somewhere in the junk piles.', 'cosmetic'),
  E('starterScarf', 'wardrobe', 'Dispatch Scarf', 'Do a job at the Tinkerbench.', 'cosmetic'),
  E(
    'salvagerSatchel',
    'wardrobe',
    'Salvager Satchel',
    'Spread your hands across the skills.',
    'cosmetic',
  ),
  E(
    'brassToolSkin',
    'wardrobe',
    'Brassbound Tools',
    'The Tinkerbench sells shine too.',
    'cosmetic',
  ),
  E(
    'chargeTrim',
    'wardrobe',
    "Warden's Glow",
    'Keep the Citywide Charge fed, week after week.',
    'cosmetic',
  ),
  // S2 — the Long Dark keepsakes (chapters 1-3; the page grows with the tale).
  E('deadFilament', 'story', 'A Dead Filament', 'Fetch wire for the wick-dipper.', 'item'),
  E('punchedTicket', 'story', 'A Punched Ticket', "Ride the Conductor's Leg for dispatch.", 'item'),
  E('makersRubbing', 'story', "A Maker's-Mark Rubbing", 'Feed the meter for the Warden.', 'item'),
];

export const MANIFEST_BY_ID: Readonly<Record<string, ManifestEntryDef>> = Object.fromEntries(
  MANIFEST_ENTRIES.map((e) => [e.id, e]),
);

/** Manifest entry id for a granted item, or null if it isn't collectible. */
export function manifestEntryForItem(itemId: string): ManifestEntryDef | null {
  const def = MANIFEST_BY_ID[itemId];
  return def !== undefined && def.source === 'item' ? def : null;
}

/** Manifest entry id for a granted cosmetic, or null. */
export function manifestEntryForCosmetic(id: string): ManifestEntryDef | null {
  const def = MANIFEST_BY_ID[id];
  return def !== undefined && def.source === 'cosmetic' ? def : null;
}

export interface PageAward {
  page: ManifestPageId;
  /** Untradeable title (shown on the inspect card). */
  title: string;
}

/** Completing a page (every entry discovered) awards an untradeable title. */
export const PAGE_AWARDS: readonly PageAward[] = [
  { page: 'scavving', title: 'Glintfinder' },
  { page: 'delving', title: 'Seamreader' },
  { page: 'skimming', title: 'Koiwhisper' },
  { page: 'tuning', title: 'Statictamer' },
  { page: 'gardens', title: 'Seedkeeper' },
  { page: 'mobs', title: 'Botbreaker' },
  { page: 'errands', title: 'Runner' },
  // The bar rises as chapters land — whoever holds every keepsake WRITTEN
  // holds the title; new chapters reopen the page.
  { page: 'story', title: 'Lampkeeper' },
  { page: 'wardrobe', title: 'City-Dressed' },
];

/** Completing the WHOLE Manifest awards the Archivist name-glow variant. */
export const FULL_MANIFEST_TRIM = 'archivistGlow';
export const FULL_MANIFEST_TITLE = 'The Archivist';

export function entriesForPage(page: ManifestPageId): ManifestEntryDef[] {
  return MANIFEST_ENTRIES.filter((e) => e.page === page);
}

/** Pages completed by a discovered-id set. */
export function completedPages(discovered: ReadonlySet<string>): ManifestPageId[] {
  return MANIFEST_PAGES.filter((p) =>
    entriesForPage(p.id).every((e) => discovered.has(e.id)),
  ).map((p) => p.id);
}

export function manifestComplete(discovered: ReadonlySet<string>): boolean {
  return MANIFEST_ENTRIES.every((e) => discovered.has(e.id));
}

// Sanity: every wardrobe entry must reference a real cosmetic.
for (const e of MANIFEST_ENTRIES) {
  if (e.source === 'cosmetic' && COSMETICS[e.refId] === undefined) {
    throw new Error(`Manifest entry ${e.id} references unknown cosmetic ${e.refId}`);
  }
}
