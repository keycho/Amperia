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
  | 'heatlamp'
  | 'warmcup'
  | 'cellwax'
  // tools (Game Bible B3) — tiers: Tinker → Brassbound → Coilworked
  | 'magclaw'
  | 'drillhammer'
  | 'skimnet'
  | 'tuner'
  | 'riveter'
  | 'brassMagclaw'
  | 'coilMagclaw'
  | 'brassDrillhammer'
  | 'coilDrillhammer'
  | 'brassSkimnet'
  | 'coilSkimnet'
  | 'brassTuner'
  | 'coilTuner'
  // weapons (Brawling)
  | 'sparkwrench'
  | 'brassSparkwrench'
  | 'coilSparkwrench'
  // cosmetics (quest rewards; never drop, never trade for now)
  | 'starterScarf';

export type ToolKind =
  | 'magclaw'
  | 'drillhammer'
  | 'skimnet'
  | 'tuner'
  | 'riveter'
  | 'sparkwrench';

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
  /** What the tool IS (gather checks match on kind, not tier). */
  toolKind?: ToolKind;
  /** Gear tier: 1 Tinker · 2 Brassbound · 3 Coilworked. */
  tier?: 1 | 2 | 3;
  /** Cosmetic wearables (quest rewards; excluded from every loot table). */
  cosmetic?: boolean;
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
  warmcup: {
    id: 'warmcup',
    name: 'Warmcup',
    flavor: 'Hot broth in a battered tin. Mends a Spark from the inside.',
    icon: 'icon-warmcup',
    iconTint: 'neonAmber',
  },
  cellwax: {
    id: 'cellwax',
    name: 'Cellwax',
    flavor: 'Tool balm. Works worn joints and coils back into shape.',
    icon: 'icon-cellwax',
    iconTint: 'neonTeal',
  },
  heatlamp: {
    id: 'heatlamp',
    name: 'Heatlamp',
    flavor: 'A riveted-together warm spot. Sparks mend faster in its pool.',
    icon: 'icon-heatlamp',
    iconTint: 'warmGlow',
  },
  magclaw: {
    id: 'magclaw',
    name: 'Magclaw',
    flavor: 'Magnetic grabber. Junk heaps give it up easy.',
    icon: 'icon-magclaw',
    tool: true,
    toolKind: 'magclaw',
    tier: 1,
  },
  brassMagclaw: {
    id: 'brassMagclaw',
    name: 'Brassbound Magclaw',
    flavor: 'Rebuilt around a brass core. Grips like it means it.',
    icon: 'icon-magclaw',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'magclaw',
    tier: 2,
  },
  coilMagclaw: {
    id: 'coilMagclaw',
    name: 'Coilworked Magclaw',
    flavor: 'Amperite windings hum in the grip. Junk leaps to it.',
    icon: 'icon-magclaw',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'magclaw',
    tier: 3,
  },
  drillhammer: {
    id: 'drillhammer',
    name: 'Drillhammer',
    flavor: 'For seams and crystal both. Mind the rhythm.',
    icon: 'icon-drillhammer',
    tool: true,
    toolKind: 'drillhammer',
    tier: 1,
  },
  brassDrillhammer: {
    id: 'brassDrillhammer',
    name: 'Brassbound Drillhammer',
    flavor: 'Weighted brass head. The seams answer faster.',
    icon: 'icon-drillhammer',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'drillhammer',
    tier: 2,
  },
  coilDrillhammer: {
    id: 'coilDrillhammer',
    name: 'Coilworked Drillhammer',
    flavor: 'Charge-assisted strikes. Crystal barely argues.',
    icon: 'icon-drillhammer',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'drillhammer',
    tier: 3,
  },
  skimnet: {
    id: 'skimnet',
    name: 'Skimnet',
    flavor: 'Cast light, land bright.',
    icon: 'icon-skimnet',
    tool: true,
    toolKind: 'skimnet',
    tier: 1,
  },
  brassSkimnet: {
    id: 'brassSkimnet',
    name: 'Brassbound Skimnet',
    flavor: 'Brass-ringed mouth holds its shape mid-cast.',
    icon: 'icon-skimnet',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'skimnet',
    tier: 2,
  },
  coilSkimnet: {
    id: 'coilSkimnet',
    name: 'Coilworked Skimnet',
    flavor: "The mesh glows faintly. Koi can't look away.",
    icon: 'icon-skimnet',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'skimnet',
    tier: 3,
  },
  tuner: {
    id: 'tuner',
    name: 'Tuner',
    flavor: 'A radio deck older than the dusk. Still true.',
    icon: 'icon-tuner',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'tuner',
    tier: 1,
  },
  brassTuner: {
    id: 'brassTuner',
    name: 'Brassbound Tuner',
    flavor: 'Brass horn, cleaner static, warmer lock.',
    icon: 'icon-tuner',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'tuner',
    tier: 2,
  },
  coilTuner: {
    id: 'coilTuner',
    name: 'Coilworked Tuner',
    flavor: 'Hears the old grid like it never went quiet.',
    icon: 'icon-tuner',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'tuner',
    tier: 3,
  },
  riveter: {
    id: 'riveter',
    name: 'Riveter',
    flavor: 'For building, when there is something to build.',
    icon: 'icon-riveter',
    iconTint: 'warmGlow',
    tool: true,
    toolKind: 'riveter',
    tier: 1,
  },
  sparkwrench: {
    id: 'sparkwrench',
    name: 'Sparkwrench',
    flavor: 'A heavy wrench with opinions. Scuttlebots respect it.',
    icon: 'icon-riveter',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 1,
  },
  brassSparkwrench: {
    id: 'brassSparkwrench',
    name: 'Brassbound Sparkwrench',
    flavor: 'Brass knuckle-guard. Swings with authority.',
    icon: 'icon-riveter',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 2,
  },
  coilSparkwrench: {
    id: 'coilSparkwrench',
    name: 'Coilworked Sparkwrench',
    flavor: 'Every hit lands with a little lightning in it.',
    icon: 'icon-riveter',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 3,
  },
  starterScarf: {
    id: 'starterScarf',
    name: 'Dispatch Scarf',
    flavor: "The Dispatcher's thank-you. Worn proud at the neck.",
    icon: 'icon-gilded-scrap',
    iconTint: 'neonRose',
    cosmetic: true,
  },
};
