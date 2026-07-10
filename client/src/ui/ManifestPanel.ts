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

const W = 560;
const H = 430;
const CELL = 64;

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
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    const chrome = scene.add.nineslice(0, 0, 'ui-panel-screws', undefined, W, H, 16, 16, 16, 16);
    chrome.setOrigin(0, 0);
    chrome.setTint(mixPalette('duskSky', 'structureMid', 0.55));
    chrome.setAlpha(0.97);
    this.container.add(chrome);

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
    this.container.setVisible(v);
    if (v) {
      const cam = this.scene.cameras.main;
      this.container.setPosition(
        Math.round((cam.width - W) / 2),
        Math.round((cam.height - H) / 2),
      );
      this.refresh();
    }
  }

  private text(x: number, y: number, body: string, color: string, size = 12, bold = false) {
    const t = this.scene.add.text(x, y, body, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;

    this.text(16, 12, 'THE MANIFEST', PALETTE.neonAmber, 17, true);
    const discovered = [...this.entries.keys()].length;
    this.text(190, 16, `${discovered} remembered`, PALETTE.groundAccent, 11);
    const close = this.text(W - 44, 12, '[x]', UI_TEXT_WARM, 13);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.setVisible(false);
    });

    // Page tabs (pill first, label on top — order IS the z-order here).
    let tx = 16;
    for (const p of MANIFEST_PAGES) {
      const pageDone = entriesForPage(p.id).every((e) => this.entries.has(e.id));
      const on = p.id === this.page;
      const labelText = pageDone ? `${p.label} ✦` : p.label;
      if (on) {
        const bg = this.scene.add.graphics();
        bg.fillStyle(PALETTE_INT.neonAmber, 1);
        const approx = labelText.length * 7.3;
        bg.fillRoundedRect(tx - 6, 41, approx + 12, 20, 6);
        this.container.add(bg);
        this.dynamic.push(bg);
      }
      const tab = this.text(
        tx,
        44,
        labelText,
        on ? PALETTE.ink : pageDone ? PALETTE.neonAmber : UI_TEXT_WARM,
        12,
        on,
      );
      tab.setInteractive({ useHandCursor: true });
      const pid = p.id;
      tab.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.page = pid;
        this.refresh();
      });
      tx += tab.width + 20;
    }

    const pageDef = MANIFEST_PAGES.find((p) => p.id === this.page);
    this.text(16, 70, pageDef?.blurb ?? '', PALETTE.groundAccent, 11);

    // Entries grid.
    const list = entriesForPage(this.page);
    list.forEach((e, i) => {
      const cx = 16 + (i % 6) * (CELL + 24);
      const cy = 96 + Math.floor(i / 6) * (CELL + 58);
      this.drawEntry(e, cx, cy);
    });

    // Completion line.
    const award = PAGE_AWARDS.find((a) => a.page === this.page);
    const done = list.every((e) => this.entries.has(e.id));
    const y = H - 54;
    if (award !== undefined) {
      this.text(
        16,
        y,
        done
          ? `Page complete — the city calls you ${award.title}.`
          : `Complete the page and the city will call you ${award.title}.`,
        done ? PALETTE.neonAmber : PALETTE.groundAccent,
        11,
      );
    }
    if (this.titles.length > 0) {
      this.text(16, y + 18, `Titles: ${this.titles.join(' · ')}`, PALETTE.neonTeal, 11);
    }
  }

  private drawEntry(e: ManifestEntryDef, x: number, y: number): void {
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
    img.setDisplaySize(CELL - 10, CELL - 10);
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
    if (state !== undefined) {
      const when = new Date(state.firstAtMs);
      const stamp = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}-${String(when.getUTCDate()).padStart(2, '0')}`;
      this.text(x - 8, y + CELL + 2 + label.height + 2, `×${state.count} · ${stamp}`, PALETTE.groundAccent, 9);
    } else {
      const hint = this.text(x - 8, y + CELL + 2 + label.height + 2, e.hint, PALETTE.groundAccent, 9);
      hint.setWordWrapWidth(CELL + 20);
      hint.setAlpha(0.8);
    }
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
