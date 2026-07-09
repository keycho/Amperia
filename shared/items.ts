/**
 * Item definitions. UI strings live here and must follow the comms rules
 * (CLAUDE.md golden rule 11): players "collect", quests "reward" — never
 * "earn"/"yield"/investment talk anywhere in game text.
 */
export type ItemId = 'salvage' | 'gildedScrap';

export interface ItemDef {
  id: ItemId;
  name: string;
  flavor: string;
  /** Texture key for the inventory icon. */
  icon: string;
  /** True for Manifest-worthy rare variants. */
  rare?: boolean;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  salvage: {
    id: 'salvage',
    name: 'Salvage',
    flavor: 'Scrap plate, wire, and bolt-ends. The city runs on it.',
    icon: 'icon-salvage',
  },
  gildedScrap: {
    id: 'gildedScrap',
    name: 'Gilded Scrap',
    flavor: 'A glimmer of old goldwork in the junk. One for the Manifest.',
    icon: 'icon-gilded-scrap',
    rare: true,
  },
};
