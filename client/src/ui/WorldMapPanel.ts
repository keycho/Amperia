import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { decodeAppearance, HAIR_COLORS } from '@shared/appearance';
import {
  buildDistrictMap,
  DISTRICT_NAMES,
  type DistrictId,
  type WorldMap,
} from '@shared/map';
import { intToHex, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { CityPresenceEvent, IdentityEvent } from '@shared/protocol';
import { tramToll } from '@shared/travel';
import { send } from '../net/NetClient';
import { sound } from '../audio/sound';
import { session, SessionEvents } from '../net/session';
import {
  bakeDistrictIsland,
  ensureMapMarkers,
  islandTextureSize,
  landmarkMarkerKey,
  MAP_LANDMARKS,
  type MapLandmark,
} from '../render/mapBake';
import { kitHeader, kitPlate, kitText, type TypeLevel, kitPanelPop } from './kit';

const W = 780;
const H = 470;
/** Baked island diamond width (px) — the miniature render's footprint. */
const ISLAND_W = 150;

/** Screen-space island anchors (centers), in tram-line order. */
const ISLAND_AT: Record<DistrictId, { x: number; y: number }> = {
  filament: { x: 138, y: 218 },
  stacks: { x: 312, y: 158 },
  terrarium: { x: 486, y: 218 },
  tangle: { x: 644, y: 292 },
};

/** Each district's one-line character (M3) — the city's voice, comms-clean. */
const DISTRICT_LINE: Record<DistrictId, string> = {
  filament: 'the warm heart — market row and the Dynamo',
  stacks: 'the city goes up — towers, parcels, rooftop signal',
  terrarium: 'the city breathes — gardens on warm wood tiers',
  tangle: 'plays for keeps — deep salvage in the snarl',
};


/**
 * The world map (D4a), opened with TAB: the four districts as lit islands
 * strung on the tram line, your own Spark pulsing where you stand, every
 * tramgate marked. Pure presentation — all data comes from the shared
 * deterministic maps and the live room state.
 */
export class WorldMapPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private readonly maps = new Map<DistrictId, WorldMap>();
  private pulse: Phaser.Tweens.Tween | null = null;
  /** The you-dot wears YOUR Spark's hair color — the biggest color read. */
  private sparkColor = PALETTE_INT.neonRose;
  /** The hovered tram leg's fare label (M2), rebuilt per hover. */
  private fareLabel: Phaser.GameObjects.GameObject[] = [];
  /** The hovered island's info plate (M3), rebuilt per hover. */
  private islandInfo: Phaser.GameObjects.GameObject[] = [];
  /** The "board at a Tramgate" hint + gate pulse (M3). */
  private hintItems: Phaser.GameObjects.GameObject[] = [];
  /** Live seated-Spark counts per district (server cityPresence). */
  private counts: Partial<Record<DistrictId, number>> = {};
  /** The current district's tramgate pin — pulsed by the board hint. */
  private herePin: Phaser.GameObjects.Image | null = null;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'AMPERIA — THE CITY', () => this.setVisible(false));

    session.events.on(SessionEvents.identity, (e: IdentityEvent) => {
      if (e.error !== undefined) return;
      const a = decodeAppearance(e.appearance);
      this.sparkColor =
        a === null ? PALETTE_INT.neonRose : (HAIR_COLORS[a.hairColor] ?? PALETTE_INT.neonRose);
      if (this.visible) this.refresh();
    });
    // M3: live "Sparks there now" counts, citywide.
    session.events.on(SessionEvents.cityPresence, (e: CityPresenceEvent) => {
      this.counts = e.counts;
      if (this.visible) this.refresh();
    });
  }

  /** Screen-space centre of a district's island (checkpoint/tour driver). */
  islandScreenPoint(d: DistrictId): { x: number; y: number } {
    const at = ISLAND_AT[d];
    return { x: this.container.x + at.x, y: this.container.y + at.y };
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) {
      this.clearFare();
      this.clearIslandInfo();
      for (const o of this.hintItems) o.destroy();
      this.hintItems.length = 0;
      if (this.pulse !== null) {
        this.pulse.stop();
        this.pulse = null;
      }
      // F5: close through the one 120ms kit pop.
      kitPanelPop(this.scene, this.container, { w: W, h: H }, false);
      return;
    }
    this.container.setVisible(true);
    {
      const cam = this.scene.cameras.main;
      this.container.setPosition(
        Math.round((cam.width - W) / 2),
        Math.round((cam.height - H) / 2),
      );
      this.refresh();
    }
    // F5: open through the one 120ms kit pop (after positioning + refresh).
    kitPanelPop(this.scene, this.container, { w: W, h: H }, true);
  }

  private mapFor(d: DistrictId): WorldMap {
    let m = this.maps.get(d);
    if (m === undefined) {
      m = buildDistrictMap(d);
      this.maps.set(d, m);
    }
    return m;
  }

  /** Project a tile of a district's map into panel space (mini isometric).
   *  Matches the island bake's projection so markers land on the render. */
  private project(d: DistrictId, tx: number, ty: number): { x: number; y: number } {
    const m = this.mapFor(d);
    const at = ISLAND_AT[d];
    const s = ISLAND_W / (2 * m.size);
    const c = m.size / 2;
    return {
      x: at.x + (tx - ty) * s * 2,
      y: at.y + (tx + ty - 2 * c) * s,
    };
  }

  private text(x: number, y: number, body: string, color: string, level: TypeLevel = 'body', bold = false) {
    const t = kitText(this.scene, x, y, body, level, { color, bold });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private refresh(): void {
    this.clearFare();
    this.clearIslandInfo();
    for (const o of this.hintItems) o.destroy();
    this.hintItems.length = 0;
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;
    if (this.pulse !== null) {
      this.pulse.stop();
      this.pulse = null;
    }

    const here = (session.room?.name ?? 'filament') as DistrictId;
    this.text(16, H - 28, 'the tram line runs every stop · TAB closes', PALETTE.groundAccent, 'caption');

    const line = CONFIG.travel.line as readonly DistrictId[];

    // The tram line first — islands render on top of it.
    const rail = this.scene.add.graphics();
    this.container.add(rail);
    this.dynamic.push(rail);
    const gatePoint = (d: DistrictId): { x: number; y: number } => {
      const g = this.mapFor(d).props.find((p) => p.kind === 'tramgate');
      return g === undefined
        ? ISLAND_AT[d]
        : this.project(d, g.x + g.w / 2, g.y + g.h / 2);
    };
    rail.lineStyle(2.5, PALETTE_INT.neonAmber, 0.55);
    const stops = line.map(gatePoint);
    rail.beginPath();
    stops.forEach((pt, i) => (i === 0 ? rail.moveTo(pt.x, pt.y) : rail.lineTo(pt.x, pt.y)));
    rail.strokePath();
    // Rail lamps between stops, and a hover zone per leg that shows the
    // LIVE fare (M2) — tramToll from shared config, never hardcoded.
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i] as { x: number; y: number };
      const b = stops[i + 1] as { x: number; y: number };
      for (const f of [0.33, 0.66]) {
        rail.fillStyle(PALETTE_INT.warmGlow, 0.9);
        rail.fillCircle(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 1.6);
      }
      const da = line[i] as DistrictId;
      const db = line[i + 1] as DistrictId;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const zone = this.scene.add.zone(mx - 30, my - 16, 60, 32).setOrigin(0, 0);
      zone.setInteractive();
      zone.on('pointerover', () => this.showFare(da, db, mx, my - 14));
      zone.on('pointerout', () => this.clearFare());
      this.container.add(zone);
      this.dynamic.push(zone);
    }

    // The islands: real miniature renders baked from the world data (M1) —
    // the same maps, the same zone classifier, the same materials. Each
    // island answers the pointer (M3): hover = highlight + info plate,
    // click = ride the tram from the map when you stand at a gate.
    this.herePin = null;
    for (const d of line) {
      const at = ISLAND_AT[d];
      const key = bakeDistrictIsland(this.scene, d, ISLAND_W);
      const tex = islandTextureSize(d, ISLAND_W);
      // Hover glow sits UNDER the island render, lit only on hover.
      const glow = this.scene.add.image(at.x, at.y, 'fx-glow');
      glow.setTint(PALETTE_INT.warmGlow);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setScale((ISLAND_W * 1.35) / 256);
      glow.setAlpha(0);
      this.container.add(glow);
      this.dynamic.push(glow);
      const island = this.scene.add.image(at.x, at.y, key);
      // Anchor so the bake's projection centre lands exactly on ISLAND_AT —
      // gate markers and the you-dot then sit true on the render.
      island.setOrigin(0.5, (30 + ISLAND_W / 4) / tex.h);
      island.setAlpha(d === here ? 1 : 0.85);
      island.setInteractive({ useHandCursor: d !== here });
      island.on('pointerover', () => {
        glow.setAlpha(0.3);
        island.setAlpha(1);
        this.showIslandInfo(d, here);
      });
      island.on('pointerout', () => {
        glow.setAlpha(0);
        island.setAlpha(d === here ? 1 : 0.85);
        this.clearIslandInfo();
      });
      island.on(
        'pointerdown',
        (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          this.clickIsland(d, here);
        },
      );
      this.container.add(island);
      this.dynamic.push(island);

      // Landmark pictograms (M2): the places that matter, pinned where
      // they actually stand — the same shorthand the world's interaction
      // markers speak, at map scale.
      ensureMapMarkers(this.scene);
      const m = this.mapFor(d);
      for (const kind of MAP_LANDMARKS) {
        const prop = m.props.find((p) => p.kind === kind);
        if (prop === undefined) continue;
        const pp = this.project(d, prop.x + prop.w / 2, prop.y + prop.h / 2);
        const pin = this.scene.add.image(pp.x, pp.y - 4, landmarkMarkerKey(kind as MapLandmark));
        this.container.add(pin);
        this.dynamic.push(pin);
        if (kind === 'tramgate' && d === here) this.herePin = pin;
      }
      const name = this.text(
        at.x,
        at.y + ISLAND_W / 4 + 18,
        d === here ? `▸ ${DISTRICT_NAMES[d]}` : DISTRICT_NAMES[d],
        d === here ? PALETTE.neonAmber : UI_TEXT_WARM,
        'body',
        d === here,
      );
      name.setOrigin(0.5, 0);
    }

    // You are here (M2): a dot in YOUR Spark's hair color with a soft
    // breathing ring — the map's one personal mark.
    const room = session.room;
    const me = room?.state.players.get(room.sessionId);
    if (me !== undefined) {
      const pt = this.project(here, me.tileX, me.tileY);
      const dotG = this.scene.add.graphics();
      dotG.fillStyle(PALETTE_INT.ink, 0.9);
      dotG.fillCircle(pt.x, pt.y, 4);
      dotG.fillStyle(this.sparkColor, 1);
      dotG.fillCircle(pt.x, pt.y, 2.6);
      this.container.add(dotG);
      this.dynamic.push(dotG);
      const ring = this.scene.add.graphics();
      ring.lineStyle(1.4, this.sparkColor, 0.9);
      ring.strokeCircle(0, 0, 5);
      ring.setPosition(pt.x, pt.y);
      this.container.add(ring);
      this.dynamic.push(ring);
      this.pulse = this.scene.tweens.add({
        targets: ring,
        scale: { from: 0.8, to: 1.8 },
        alpha: { from: 0.9, to: 0 },
        duration: 1200,
        repeat: -1,
        ease: 'quad.out',
      });
      const you = this.text(pt.x, pt.y - 14, 'you', intToHex(this.sparkColor), 'caption', true);
      you.setOrigin(0.5, 1);
    }
  }

  /** The hovered tram leg's fare, on a small ink pill above the leg. Fares
   *  are direction-aware (a free stop rides free INBOUND only), so unequal
   *  directions show both. */
  private showFare(a: DistrictId, b: DistrictId, x: number, y: number): void {
    this.clearFare();
    const fmt = (t: number): string => (t === 0 ? 'free' : `${t} Bolts`);
    const ab = tramToll(a, b);
    const ba = tramToll(b, a);
    const body =
      ab === ba
        ? `${DISTRICT_NAMES[a]} ↔ ${DISTRICT_NAMES[b]} — ${fmt(ab)}`
        : `→ ${DISTRICT_NAMES[b]} ${fmt(ab)} · → ${DISTRICT_NAMES[a]} ${fmt(ba)}`;
    this.fareLabel.push(...this.pill(x, y, [body]));
  }

  private clearFare(): void {
    for (const o of this.fareLabel) o.destroy();
    this.fareLabel.length = 0;
  }

  /** M3: the hovered island's info plate — name, character, fare, Sparks.
   *  Docked bottom-left in the panel's one always-empty corner, so it never
   *  covers the island it describes (and never collides with a label). */
  private showIslandInfo(d: DistrictId, here: DistrictId): void {
    this.clearIslandInfo();
    const toll = tramToll(here, d);
    const fareLine =
      d === here
        ? 'you are here'
        : `tram fare from ${DISTRICT_NAMES[here]} — ${toll === 0 ? 'free' : `${toll} Bolts`}`;
    const sparks = this.counts[d] ?? 0;
    const lines = [
      DISTRICT_NAMES[d],
      DISTRICT_LINE[d],
      fareLine,
      `Sparks there now: ${sparks}`,
    ];
    this.islandInfo.push(...this.pill(186, H - 104, lines, true));
  }

  private clearIslandInfo(): void {
    for (const o of this.islandInfo) o.destroy();
    this.islandInfo.length = 0;
  }

  /** M3: click an island — ride from a gate, or learn where to board. */
  private clickIsland(d: DistrictId, here: DistrictId): void {
    const room = session.room;
    if (room === null || d === here) return;
    const me = room.state.players.get(room.sessionId);
    if (me === undefined) return;
    const gate = this.mapFor(here).props.find((p) => p.kind === 'tramgate');
    const nearGate =
      gate !== undefined &&
      Math.max(
        Math.max(gate.x - me.tileX, 0, me.tileX - (gate.x + gate.w - 1)),
        Math.max(gate.y - me.tileY, 0, me.tileY - (gate.y + gate.h - 1)),
      ) <= CONFIG.travel.gateRadiusTiles;
    if (nearGate) {
      // The same travel intent the gate board sends — a UI shortcut, not a
      // new codepath; the server validates reach and toll as always.
      sound.uiClick();
      send.travel(room, { to: d });
      this.setVisible(false);
      return;
    }
    this.showBoardHint();
  }

  /** Not at a gate: say so, and pulse the gate pin on the current island. */
  private showBoardHint(): void {
    for (const o of this.hintItems) o.destroy();
    this.hintItems.length = 0;
    this.hintItems.push(...this.pill(W / 2, H - 40, ['board at a Tramgate — the gate is marked ◆']));
    if (this.herePin !== null) {
      const pin = this.herePin;
      this.scene.tweens.add({
        targets: pin,
        scale: { from: 1, to: 1.9 },
        duration: 260,
        yoyo: true,
        repeat: 3,
        ease: 'sine.inout',
        onComplete: () => pin.setScale(1),
      });
    }
    const items = this.hintItems;
    this.scene.time.delayedCall(2400, () => {
      if (items === this.hintItems) {
        for (const o of this.hintItems) o.destroy();
        this.hintItems.length = 0;
      }
    });
  }

  /** A small ink pill with centred lines; returns [pill, ...texts]. */
  private pill(
    x: number,
    y: number,
    lines: string[],
    title = false,
  ): Phaser.GameObjects.GameObject[] {
    const texts: Phaser.GameObjects.Text[] = [];
    let ly = y;
    let maxW = 0;
    for (let i = 0; i < lines.length; i++) {
      const t = kitText(this.scene, x, ly, lines[i] as string, i === 0 && title ? 'body' : 'caption', {
        color: i === 0 && title ? PALETTE.neonAmber : i === 0 ? PALETTE.warmGlow : UI_TEXT_WARM,
        bold: i === 0 && title,
      });
      t.setOrigin(0.5, 0);
      texts.push(t);
      maxW = Math.max(maxW, t.width);
      ly += Math.ceil(t.height) + 3;
    }
    const pillW = Math.ceil(maxW) + 18;
    const pillH = ly - y + 12;
    // Clamp inside the panel so edge islands' plates never clip.
    const cx = Math.min(Math.max(x, pillW / 2 + 8), W - pillW / 2 - 8);
    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.95);
    g.fillRoundedRect(cx - pillW / 2, y - 7, pillW, pillH, 7);
    g.lineStyle(1, PALETTE_INT.neonAmber, 0.5);
    g.strokeRoundedRect(cx - pillW / 2, y - 7, pillW, pillH, 7);
    this.container.add(g);
    for (const t of texts) {
      t.setX(cx);
      this.container.add(t); // above the pill
    }
    return [g, ...texts];
  }
}
