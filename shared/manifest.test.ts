import { describe, expect, it } from 'vitest';
import { COSMETICS } from './cosmetics';
import { ITEMS } from './items';
import {
  completedPages,
  entriesForPage,
  MANIFEST_BY_ID,
  MANIFEST_ENTRIES,
  MANIFEST_PAGES,
  manifestComplete,
  manifestEntryForCosmetic,
  manifestEntryForItem,
  PAGE_AWARDS,
} from './manifest';

describe('manifest defs', () => {
  it('every entry references a real item or cosmetic', () => {
    for (const e of MANIFEST_ENTRIES) {
      if (e.source === 'item') expect(ITEMS[e.refId as keyof typeof ITEMS]).toBeDefined();
      else expect(COSMETICS[e.refId]).toBeDefined();
    }
  });

  it('every page has at least one entry and one award', () => {
    for (const p of MANIFEST_PAGES) {
      expect(entriesForPage(p.id).length).toBeGreaterThan(0);
      expect(PAGE_AWARDS.find((a) => a.page === p.id)).toBeDefined();
    }
  });

  it('the four existing rare-find rolls are all collectible', () => {
    for (const id of ['gildedScrap', 'blueHotBrass', 'prismaticGlowkoi', 'ghostFrequency']) {
      expect(manifestEntryForItem(id)).not.toBeNull();
    }
    expect(manifestEntryForItem('salvage')).toBeNull(); // commons never log
  });

  it('cosmetic lookups resolve and item lookups reject cosmetics', () => {
    expect(manifestEntryForCosmetic('bulbHat')?.page).toBe('wardrobe');
    expect(manifestEntryForItem('bulbHat')).toBeNull();
  });
});

describe('completion', () => {
  it('page completion tracks the discovered set', () => {
    const none = new Set<string>();
    expect(completedPages(none)).toEqual([]);
    const scav = new Set(entriesForPage('scavving').map((e) => e.id));
    expect(completedPages(scav)).toEqual(['scavving']);
    expect(manifestComplete(scav)).toBe(false);
    const all = new Set(MANIFEST_ENTRIES.map((e) => e.id));
    expect(manifestComplete(all)).toBe(true);
    expect(completedPages(all).length).toBe(MANIFEST_PAGES.length);
  });

  it('ids are unique', () => {
    expect(Object.keys(MANIFEST_BY_ID).length).toBe(MANIFEST_ENTRIES.length);
  });
});
