import Phaser from 'phaser';
import { ITEMS, type ItemId } from '@shared/items';
import {
  entriesForPage,
  MANIFEST_BY_ID,
  MANIFEST_PAGES,
  type ManifestEntryDef,
  type ManifestPageId,
  PAGE_AWARDS,
} from '@shared/manifest';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { ManifestFoundEvent, ManifestSync } from '@shared/protocol';
import { session, SessionEvents } from '../net/session';
import { cosmeticThumbKey, itemThumbKey } from '../render/itemThumbs';
import { sound } from '../audio/sound';
import { kitClampLines, kitHeader, kitPlate, kitTabRow, kitText, UIK, type TypeLevel, kitPanelPop } from './kit';

const W = 560;
/** Minimum plate height — the flow layout grows it when a page needs more. */
const H_MIN = 430;
const CELL = 64;

/** Nearest kit type level for a legacy pixel size (locked scale 28/18/13/11). */
function levelForSize(size: number): TypeLevel {
  if (size >= 23) return 'display';
  if (size >= 16) return 'heading';
  if (size >= 12) return 'body';
  return 'caption';
}

interface EntryState {
  count: number;
  firstAtMs: number;
}

/**
 * The Manifest (S1): the account-wide collection log, opened with M.
 * Undiscovered entries sit as dark silhouettes with a hint line;
 * discovered ones show the baked thumbnail, count, and the date the city
 * first remembered you for it. Untradeable, ever.
 */
export class ManifestPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private page: ManifestPageId = 'scavving';
  private entries = new Map<string, EntryState>();
  private titles: string[] = [];
  /** Scroll-fallback window start for the tab row (kitTabRow rule 3). */
  private tabStart = 0;
  /** The flow-computed plate height for the current page. */
  private plateH = H_MIN;
  private plate: Phaser.GameObjects.Graphics;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    this.plate = kitPlate(scene, W, H_MIN);
    this.container.add(this.plate);
    kitHeader(scene, this.container, W, 'THE MANIFEST', () => this.setVisible(false));

    session.events.on(SessionEvents.manifest, (sync: ManifestSync) => {
      this.entries = new Map(
        sync.entries.map((e) => [e.entryId, { count: e.count, firstAtMs: e.firstAtMs }]),
      );
      this.titles = sync.titles;
      if (this.visible) this.refresh();
    });
    session.events.on(SessionEvents.manifestFound, (ev: ManifestFoundEvent) => {
      const prev = this.entries.get(ev.entryId);
      this.entries.set(ev.entryId, {
        count: ev.count,
        firstAtMs: prev?.firstAtMs ?? Date.now(),
      });
      this.titles.push(...ev.newTitles);
      if (this.visible) this.refresh();
    });
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    // F5: open/close through the one 120ms kit pop.
    kitPanelPop(this.scene, this.container, { w: W, h: this.plateH }, v); // refresh() recentres with the flowed height
  }

  private recentre(): void {
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - W) / 2),
      Math.round((cam.height - this.plateH) / 2),
    );
  }

  private text(x: number, y: number, body: string, color: string, size = 12, bold = false) {
    const t = kitText(this.scene, x, y, body, levelForSize(size), { color, bold });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  /**
   * F4 flow layout: every band measures the one above it — tabs (kitTabRow:
   * shrink → wrap → scroll, never clipping), blurb, the entry grid with
   * per-row measured pitch, then a hairline divider and the completion +
   * titles block. The plate grows to the flowed height; nothing is ever
   * positioned off a hard-coded Y again.
   */
  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;

    // Title + close are static kit chrome built once in the constructor.
    const discovered = [...this.entries.keys()].length;
    this.text(190, 12, `${discovered} remembered`, PALETTE.groundAccent, 11);

    // Page tabs — the general tab-row rule (F4): shrink, wrap, then page.
    const tabs = kitTabRow(this.scene, this.container, {
      x: 16,
      y: 44,
      maxW: W - 32,
      items: MANIFEST_PAGES.map((p) => {
        const pageDone = entriesForPage(p.id).every((e) => this.entries.has(e.id));
        return { id: p.id, label: pageDone ? `${p.label} ✦` : p.label, accent: pageDone };
      }),
      activeId: this.page,
      onPick: (id) => {
        this.page = id as ManifestPageId;
        this.refresh();
      },
      pageStart: this.tabStart,
      onPageStart: (s) => {
        this.tabStart = s;
        this.refresh();
      },
    });
    this.dynamic.push(...tabs.objects);
    let y = 44 + tabs.height + 8;

    const pageDef = MANIFEST_PAGES.find((p) => p.id === this.page);
    const blurb = this.text(16, y, pageDef?.blurb ?? '', PALETTE.groundAccent, 11);
    blurb.setWordWrapWidth(W - 32);
    y += Math.ceil(blurb.height) + 10;

    // Entries grid — row pitch is MEASURED from the tallest cell in the row.
    const list = entriesForPage(this.page);
    for (let r = 0; r * 6 < list.length; r++) {
      let rowBottom = y + CELL;
      for (let ci = 0; ci < 6; ci++) {
        const e = list[r * 6 + ci];
        if (e === undefined) break;
        rowBottom = Math.max(rowBottom, this.drawEntry(e, 16 + ci * (CELL + 24), y));
      }
      y = rowBottom + 12;
    }

    // Divider, then the completion + titles block, flowed.
    const div = this.scene.add.graphics();
    div.lineStyle(1, UIK.border, 0.85);
    div.beginPath();
    div.moveTo(16, y + 0.5);
    div.lineTo(W - 16, y + 0.5);
    div.strokePath();
    this.container.add(div);
    this.dynamic.push(div);
    y += 9;

    const award = PAGE_AWARDS.find((a) => a.page === this.page);
    const done = list.every((e) => this.entries.has(e.id));
    if (award !== undefined) {
      const t = this.text(
        16,
        y,
        done
          ? `Page complete — the city calls you ${award.title}.`
          : `Complete the page and the city will call you ${award.title}.`,
        done ? PALETTE.neonAmber : PALETTE.groundAccent,
        11,
      );
      t.setWordWrapWidth(W - 32);
      kitClampLines(t, 2);
      y += Math.ceil(t.height) + 4;
    }
    if (this.titles.length > 0) {
      const t = this.text(16, y, `Titles: ${this.titles.join(' · ')}`, PALETTE.neonTeal, 11);
      t.setWordWrapWidth(W - 32);
      kitClampLines(t, 2);
      y += Math.ceil(t.height);
    }

    // Grow the plate to the flowed height and recentre.
    this.plateH = Math.max(H_MIN, y + 14);
    this.plate.destroy();
    this.plate = kitPlate(this.scene, W, this.plateH);
    this.container.addAt(this.plate, 0);
    this.recentre();
  }

  /** Draw one cell; returns its flowed BOTTOM edge (captions clamp to two
   *  lines, so a long hint can never spill into the next row or the divider). */
  private drawEntry(e: ManifestEntryDef, x: number, y: number): number {
    const state = this.entries.get(e.id);
    const inset = this.scene.add.nineslice(
      x,
      y,
      'ui-slot-inset',
      undefined,
      CELL,
      CELL,
      10,
      10,
      10,
      10,
    );
    inset.setOrigin(0, 0);
    inset.setTint(mixPalette('ink', 'structureMid', 0.55));
    inset.setAlpha(state !== undefined ? 1 : 0.5);
    this.container.add(inset);
    this.dynamic.push(inset);

    const key =
      e.source === 'item'
        ? itemThumbKey(ITEMS[e.refId as ItemId])
        : cosmeticThumbKey(e.refId);
    const img = this.scene.add.image(x + CELL / 2, y + CELL / 2, key);
    img.setDisplaySize(44, 44); // 1:1 with the thumb bake (CLARITY)
    if (state === undefined) {
      // Undiscovered: a silhouette of the thing, not the thing.
      img.setTintFill(PALETTE_INT.ink);
      img.setAlpha(0.85);
    }
    this.container.add(img);
    this.dynamic.push(img);

    if (state === undefined) {
      const q = this.text(x + CELL / 2, y + CELL / 2, '?', PALETTE.groundAccent, 16, true);
      q.setOrigin(0.5);
      this.dynamic.push(q);
    }

    const label = this.text(x - 8, y + CELL + 2, state !== undefined ? e.label : '———', state !== undefined ? UI_TEXT_WARM : PALETTE.groundAccent, 10);
    label.setWordWrapWidth(CELL + 18);
    kitClampLines(label, 2);
    const capY = y + CELL + 2 + Math.ceil(label.height) + 2;
    if (state !== undefined) {
      const when = new Date(state.firstAtMs);
      const stamp = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}-${String(when.getUTCDate()).padStart(2, '0')}`;
      const meta = this.text(x - 8, capY, `×${state.count} · ${stamp}`, PALETTE.groundAccent, 9);
      meta.setWordWrapWidth(CELL + 20);
      kitClampLines(meta, 2);
      return capY + Math.ceil(meta.height);
    }
    const hint = this.text(x - 8, capY, e.hint, PALETTE.groundAccent, 9);
    hint.setWordWrapWidth(CELL + 20);
    kitClampLines(hint, 2);
    hint.setAlpha(0.8);
    return capY + Math.ceil(hint.height);
  }
}

/** The discovery moment (S1c): banner + chime, then it gets out of the way. */
export function showManifestToast(scene: Phaser.Scene, ev: ManifestFoundEvent): void {
  if (!ev.first) return;
  sound.rareChime();
  const cam = scene.cameras.main;
  const label = MANIFEST_BY_ID[ev.entryId]?.label ?? ev.entryId;
  const box = scene.add.container(cam.width / 2, 86);
  const g = scene.add.graphics();
  const text = scene.add.text(0, 0, `The Manifest remembers: ${label}`, {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: PALETTE.neonAmber,
    fontStyle: 'bold',
  });
  text.setOrigin(0.5);
  const w = text.width + 34;
  g.fillStyle(PALETTE_INT.ink, 0.92);
  g.fillRoundedRect(-w / 2, -18, w, 36, 9);
  g.lineStyle(1.5, PALETTE_INT.neonAmber, 0.8);
  g.strokeRoundedRect(-w / 2, -18, w, 36, 9);
  box.add(g);
  box.add(text);
  box.setDepth(1400);
  box.setAlpha(0);
  box.setScale(0.9);
  scene.tweens.add({ targets: box, alpha: 1, scale: 1, duration: 220, ease: 'back.out' });
  scene.tweens.add({
    targets: box,
    alpha: 0,
    y: 60,
    delay: 2600,
    duration: 420,
    ease: 'quad.in',
    onComplete: () => box.destroy(),
  });
}
