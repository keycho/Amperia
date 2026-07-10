/**
 * Item definitions. UI strings live here and must follow the comms rules
 * (CLAUDE.md golden rule 11): players "collect", quests "reward" — never
 * "earn"/"yield"/investment talk anywhere in game text.
 */
export type ItemId =
  // resources
  | 'salvage'
  | 'brass'
  | 'amperite'
  | 'glowkoi'
  | 'signal'
  // rare Manifest variants
  | 'gildedScrap'
  | 'blueHotBrass'
  | 'prismaticGlowkoi'
  | 'ghostFrequency'
  | 'dentedCrest'
  // tools (Game Bible B3)
  | 'magclaw'
  | 'drillhammer'
  | 'skimnet'
  | 'tuner'
  | 'riveter';

export interface ItemDef {
  id: ItemId;
  name: string;
  flavor: string;
  /** Texture key for the inventory icon. */
  icon: string;
  /** Palette key to tint the icon with (white/stock icons only). */
  iconTint?: string;
  /** True for Manifest-worthy rare variants. */
  rare?: boolean;
  /** Tools don't stack. */
  tool?: boolean;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  salvage: {
    id: 'salvage',
    name: 'Salvage',
    flavor: 'Scrap plate, wire, and bolt-ends. The city runs on it.',
    icon: 'icon-salvage',
  },
  brass: {
    id: 'brass',
    name: 'Brass',
    flavor: 'Warm metal from the seams. Loves a polish.',
    icon: 'icon-brass',
  },
  amperite: {
    id: 'amperite',
    name: 'Amperite',
    flavor: 'Charge-crystal, still humming. Handle with dry gloves.',
    icon: 'icon-amperite',
  },
  glowkoi: {
    id: 'glowkoi',
    name: 'Glowkoi',
    flavor: 'A lantern with fins. The canals are full of them.',
    icon: 'icon-glowkoi',
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    flavor: 'A clean slice of the old frequencies, bottled.',
    icon: 'icon-signal',
    iconTint: 'neonCyan',
  },
  gildedScrap: {
    id: 'gildedScrap',
    name: 'Gilded Scrap',
    flavor: 'A glimmer of old goldwork in the junk. One for the Manifest.',
    icon: 'icon-gilded-scrap',
    rare: true,
  },
  blueHotBrass: {
    id: 'blueHotBrass',
    name: 'Blue-Hot Brass',
    flavor: 'Seam metal that never quite cooled. The Manifest wants it.',
    icon: 'icon-blue-hot-brass',
    iconTint: 'neonCyan',
    rare: true,
  },
  prismaticGlowkoi: {
    id: 'prismaticGlowkoi',
    name: 'Prismatic Glowkoi',
    flavor: 'Every color the canal has ever seen, swimming.',
    icon: 'icon-prismatic-glowkoi',
    iconTint: 'neonRose',
    rare: true,
  },
  ghostFrequency: {
    id: 'ghostFrequency',
    name: 'Ghost Frequency',
    flavor: 'A voice from the dead grid, caught mid-word.',
    icon: 'icon-ghost-frequency',
    iconTint: 'neonRose',
    rare: true,
  },
  dentedCrest: {
    id: 'dentedCrest',
    name: 'Dented Crest',
    flavor: "A Scuttlebot's maker-mark, pried off mid-scuffle. The Manifest wants it.",
    icon: 'icon-gilded-scrap',
    iconTint: 'neonRose',
    rare: true,
  },
  magclaw: {
    id: 'magclaw',
    name: 'Magclaw',
    flavor: 'Magnetic grabber. Junk heaps give it up easy.',
    icon: 'icon-magclaw',
    tool: true,
  },
  drillhammer: {
    id: 'drillhammer',
    name: 'Drillhammer',
    flavor: 'For seams and crystal both. Mind the rhythm.',
    icon: 'icon-drillhammer',
    tool: true,
  },
  skimnet: {
    id: 'skimnet',
    name: 'Skimnet',
    flavor: 'Cast light, land bright.',
    icon: 'icon-skimnet',
    tool: true,
  },
  tuner: {
    id: 'tuner',
    name: 'Tuner',
    flavor: 'A radio deck older than the dusk. Still true.',
    icon: 'icon-tuner',
    iconTint: 'neonAmber',
    tool: true,
  },
  riveter: {
    id: 'riveter',
    name: 'Riveter',
    flavor: 'For building, when there is something to build.',
    icon: 'icon-riveter',
    iconTint: 'warmGlow',
    tool: true,
  },
};
