import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import {
  buildDistrictMap,
  DISTRICT_NAMES,
  type DistrictId,
  type WorldMap,
} from '@shared/map';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { session } from '../net/session';
import { bakeDistrictIsland, islandTextureSize } from '../render/mapBake';
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
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'AMPERIA — THE CITY', () => this.setVisible(false));
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) {
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
    // Rail lamps between stops.
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i] as { x: number; y: number };
      const b = stops[i + 1] as { x: number; y: number };
      for (const f of [0.33, 0.66]) {
        rail.fillStyle(PALETTE_INT.warmGlow, 0.9);
        rail.fillCircle(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 1.6);
      }
    }

    // The islands: real miniature renders baked from the world data (M1) —
    // the same maps, the same zone classifier, the same materials.
    for (const d of line) {
      const at = ISLAND_AT[d];
      const key = bakeDistrictIsland(this.scene, d, ISLAND_W);
      const tex = islandTextureSize(d, ISLAND_W);
      const island = this.scene.add.image(at.x, at.y, key);
      // Anchor so the bake's projection centre lands exactly on ISLAND_AT —
      // gate markers and the you-dot then sit true on the render.
      island.setOrigin(0.5, (30 + ISLAND_W / 4) / tex.h);
      island.setAlpha(d === here ? 1 : 0.85);
      this.container.add(island);
      this.dynamic.push(island);

      // Tramgate marker: the stop's diamond, bright and named.
      const g = this.scene.add.graphics();
      this.container.add(g);
      this.dynamic.push(g);
      const gp = gatePoint(d);
      g.fillStyle(PALETTE_INT.neonAmber, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(gp.x, gp.y - 5),
          new Phaser.Geom.Point(gp.x + 5, gp.y),
          new Phaser.Geom.Point(gp.x, gp.y + 5),
          new Phaser.Geom.Point(gp.x - 5, gp.y),
        ],
        true,
      );
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

    // You are here: the own-Spark pulse on the current island.
    const room = session.room;
    const me = room?.state.players.get(room.sessionId);
    if (me !== undefined) {
      const pt = this.project(here, me.tileX, me.tileY);
      const dot = this.scene.add.image(pt.x, pt.y, 'fx-glow');
      dot.setTint(PALETTE_INT.neonRose);
      dot.setBlendMode(Phaser.BlendModes.ADD);
      dot.setScale(0.05);
      this.container.add(dot);
      this.dynamic.push(dot);
      this.pulse = this.scene.tweens.add({
        targets: dot,
        scale: { from: 0.04, to: 0.075 },
        alpha: { from: 1, to: 0.7 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      });
      const you = this.text(pt.x, pt.y - 14, 'you', PALETTE.neonRose, 'caption', true);
      you.setOrigin(0.5, 1);
    }
  }
}
