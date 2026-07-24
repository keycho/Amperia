/**
 * Item definitions. UI strings live here and must follow the comms rules
 * (CLAUDE.md golden rule 11): players "collect", quests "reward" — never
 * "earn"/"yield"/investment talk anywhere in game text.
 *
 * F2: every item carries the full card — distinct voxel icon (no two items
 * share one; enforced by items.test.ts), display name, 1–2 lines of flavor,
 * a category + rarity read, and an explicit stack size (tools and wearables
 * are 1; the server honours per-item stacks via inventory.stackFor).
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
  | 'wispFilament'
  | 'drayPlate'
  | 'waxChit'
  | 'deadFilament'
  | 'punchedTicket'
  | 'makersRubbing'
  | 'wicklamp'
  | 'barChalk'
  | 'unclaimedLamp'
  | 'silverfern'
  | 'emberseed'
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

/** The category tag every item card shows (and the Pack sort order). */
export type ItemCategory =
  | 'resource'
  | 'tool'
  | 'weapon'
  | 'consumable'
  | 'curio'
  | 'cosmetic';

export interface ItemDef {
  id: ItemId;
  name: string;
  flavor: string;
  /** Category tag — tooltip read + the Pack's sort order. */
  category: ItemCategory;
  /** Per-item stack size (tools/wearables 1). The server enforces this. */
  stack: number;
  /** Texture key for the inventory icon. */
  icon: string;
  /** Palette key accenting the icon's REAL accent voxels (never a wash). */
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

/** The human read of an item's rarity line: rare > tier > common. */
export function rarityLabel(def: ItemDef): string {
  if (def.rare === true) return 'rare';
  if (def.tier === 3) return 'Coilworked';
  if (def.tier === 2) return 'Brassbound';
  if (def.tier === 1) return 'Tinker';
  return 'common';
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  salvage: {
    id: 'salvage',
    name: 'Salvage',
    flavor: 'Scrap plate, wire, and bolt-ends. The city runs on it.',
    category: 'resource',
    stack: 999,
    icon: 'icon-salvage',
  },
  brass: {
    id: 'brass',
    name: 'Brass',
    flavor: 'Warm metal from the seams. Loves a polish.',
    category: 'resource',
    stack: 999,
    icon: 'icon-brass',
  },
  amperite: {
    id: 'amperite',
    name: 'Amperite',
    flavor: 'Charge-crystal, still humming. Handle with dry gloves.',
    category: 'resource',
    stack: 999,
    icon: 'icon-amperite',
  },
  glowkoi: {
    id: 'glowkoi',
    name: 'Glowkoi',
    flavor: 'A lantern with fins. The canals are full of them.',
    category: 'resource',
    stack: 999,
    icon: 'icon-glowkoi',
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    flavor: 'A clean slice of the old frequencies, bottled.',
    category: 'resource',
    stack: 999,
    icon: 'icon-signal',
    iconTint: 'neonCyan',
  },
  gildedScrap: {
    id: 'gildedScrap',
    name: 'Gilded Scrap',
    flavor: 'A glimmer of old goldwork in the junk. One for the Manifest.',
    category: 'curio',
    stack: 50,
    icon: 'icon-gilded-scrap',
    rare: true,
  },
  blueHotBrass: {
    id: 'blueHotBrass',
    name: 'Blue-Hot Brass',
    flavor: 'Seam metal that never quite cooled. The Manifest wants it.',
    category: 'curio',
    stack: 50,
    icon: 'icon-blue-hot-brass',
    iconTint: 'neonCyan',
    rare: true,
  },
  prismaticGlowkoi: {
    id: 'prismaticGlowkoi',
    name: 'Prismatic Glowkoi',
    flavor: 'Every color the canal has ever seen, swimming.',
    category: 'curio',
    stack: 50,
    icon: 'icon-prismatic-glowkoi',
    iconTint: 'neonRose',
    rare: true,
  },
  ghostFrequency: {
    id: 'ghostFrequency',
    name: 'Ghost Frequency',
    flavor: 'A voice from the dead grid, caught mid-word.',
    category: 'curio',
    stack: 50,
    icon: 'icon-ghost-frequency',
    iconTint: 'neonRose',
    rare: true,
  },
  silverfern: {
    id: 'silverfern',
    name: 'Silverfern',
    flavor: 'A frond gone chrome in the compost. The gardeners bow to it.',
    category: 'curio',
    stack: 50,
    icon: 'icon-silverfern',
    rare: true,
  },
  emberseed: {
    id: 'emberseed',
    name: 'Emberseed',
    flavor: 'Warm to the touch, and it never sprouts. One for the Manifest.',
    category: 'curio',
    stack: 50,
    icon: 'icon-emberseed',
    rare: true,
  },
  dentedCrest: {
    id: 'dentedCrest',
    name: 'Dented Crest',
    flavor: "A Scuttlebot's maker-mark, pried off mid-scuffle. The Manifest wants it.",
    category: 'curio',
    stack: 50,
    icon: 'icon-dented-crest',
    rare: true,
  },
  wispFilament: {
    id: 'wispFilament',
    name: 'Wisp Filament',
    flavor: 'A hair of living charge, still warm. Popped from a Sparkwisp.',
    category: 'curio',
    stack: 50,
    icon: 'icon-wisp-filament',
    rare: true,
  },
  drayPlate: {
    id: 'drayPlate',
    name: 'Dray Plate',
    flavor: "Armor off a rogue Draymule's flank. It took a crowd to put that dent in.",
    category: 'curio',
    stack: 50,
    icon: 'icon-dray-plate',
    rare: true,
  },
  waxChit: {
    id: 'waxChit',
    name: 'Wax-Sealed Chit',
    flavor: 'A courier tip, pressed in wax. Worth nothing. Kept forever.',
    category: 'curio',
    stack: 50,
    icon: 'icon-wax-chit',
    rare: true,
  },
  // S2 — the Long Dark keepsakes. Story curios: granted once per chapter,
  // never sold, never dropped (no drop path knows them — golden rule 7's
  // structural cousin), kept where you'll see them.
  deadFilament: {
    id: 'deadFilament',
    name: 'A Dead Filament',
    flavor: 'A little glass bulb from the Long Dark, burned clear through. It gave everything.',
    category: 'curio',
    stack: 1,
    icon: 'icon-dead-filament',
    rare: true,
  },
  punchedTicket: {
    id: 'punchedTicket',
    name: 'A Punched Ticket',
    flavor: 'Fourteen bell-counts to the Stacks. Punched in the dark, by hand.',
    category: 'curio',
    stack: 1,
    icon: 'icon-punched-ticket',
    rare: true,
  },
  wicklamp: {
    id: 'wicklamp',
    name: 'Wicklamp',
    flavor: 'Brass collar, salvage cage, honest wick. Burns Cellwax; lights the dark under the deck.',
    category: 'tool',
    stack: 1,
    icon: 'icon-wicklamp',
  },
  barChalk: {
    id: 'barChalk',
    name: 'A Stub of Bar Chalk',
    flavor: 'Fourteen months of marks on a wall nobody looked at, and nobody ever collected.',
    category: 'curio',
    stack: 1,
    icon: 'icon-bar-chalk',
    rare: true,
  },
  unclaimedLamp: {
    id: 'unclaimedLamp',
    name: 'An Unclaimed Lamp',
    flavor: 'Off the top layer of the dump. Lit once a year, for nobody they could name.',
    category: 'curio',
    stack: 1,
    icon: 'icon-unclaimed-lamp',
    rare: true,
  },
  makersRubbing: {
    id: 'makersRubbing',
    name: "A Maker's-Mark Rubbing",
    flavor: 'A symbol in wax-crayon. Nobody living reads it. It was made by somebody, for somebody.',
    category: 'curio',
    stack: 1,
    icon: 'icon-makers-rubbing',
    rare: true,
  },
  warmcup: {
    id: 'warmcup',
    name: 'Warmcup',
    flavor: 'Hot broth in a battered tin. Mends a Spark from the inside.',
    category: 'consumable',
    stack: 24,
    icon: 'icon-warmcup',
    iconTint: 'neonAmber',
  },
  cellwax: {
    id: 'cellwax',
    name: 'Cellwax',
    flavor: 'Tool balm. Works worn joints and coils back into shape.',
    category: 'consumable',
    stack: 24,
    icon: 'icon-cellwax',
    iconTint: 'neonTeal',
  },
  heatlamp: {
    id: 'heatlamp',
    name: 'Heatlamp',
    flavor: 'A riveted-together warm spot. Sparks mend faster in its pool.',
    category: 'consumable',
    stack: 8,
    icon: 'icon-heatlamp',
    iconTint: 'warmGlow',
  },
  magclaw: {
    id: 'magclaw',
    name: 'Magclaw',
    flavor: 'Magnetic grabber. Junk heaps give it up easy.',
    category: 'tool',
    stack: 1,
    icon: 'icon-magclaw',
    tool: true,
    toolKind: 'magclaw',
    tier: 1,
  },
  brassMagclaw: {
    id: 'brassMagclaw',
    name: 'Brassbound Magclaw',
    flavor: 'Rebuilt around a brass core. Grips like it means it.',
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
    icon: 'icon-drillhammer',
    tool: true,
    toolKind: 'drillhammer',
    tier: 1,
  },
  brassDrillhammer: {
    id: 'brassDrillhammer',
    name: 'Brassbound Drillhammer',
    flavor: 'Weighted brass head. The seams answer faster.',
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
    icon: 'icon-skimnet',
    tool: true,
    toolKind: 'skimnet',
    tier: 1,
  },
  brassSkimnet: {
    id: 'brassSkimnet',
    name: 'Brassbound Skimnet',
    flavor: 'Brass-ringed mouth holds its shape mid-cast.',
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
    icon: 'icon-tuner',
    iconTint: 'warmGlow',
    tool: true,
    toolKind: 'tuner',
    tier: 2,
  },
  coilTuner: {
    id: 'coilTuner',
    name: 'Coilworked Tuner',
    flavor: 'Hears the old grid like it never went quiet.',
    category: 'tool',
    stack: 1,
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
    category: 'tool',
    stack: 1,
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
    category: 'weapon',
    stack: 1,
    icon: 'icon-sparkwrench',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 1,
  },
  brassSparkwrench: {
    id: 'brassSparkwrench',
    name: 'Brassbound Sparkwrench',
    flavor: 'Brass knuckle-guard. Swings with authority.',
    category: 'weapon',
    stack: 1,
    icon: 'icon-sparkwrench',
    iconTint: 'neonAmber',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 2,
  },
  coilSparkwrench: {
    id: 'coilSparkwrench',
    name: 'Coilworked Sparkwrench',
    flavor: 'Every hit lands with a little lightning in it.',
    category: 'weapon',
    stack: 1,
    icon: 'icon-sparkwrench',
    iconTint: 'neonTeal',
    tool: true,
    toolKind: 'sparkwrench',
    tier: 3,
  },
  starterScarf: {
    id: 'starterScarf',
    name: 'Dispatch Scarf',
    flavor: "The Dispatcher's thank-you. Worn proud at the neck.",
    category: 'cosmetic',
    stack: 1,
    icon: 'icon-scarf',
    cosmetic: true,
  },
};
