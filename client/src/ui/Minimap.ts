import Phaser from 'phaser';
import { buildDistrictMap, DISTRICT_NAMES, type DistrictId, type WorldMap } from '@shared/map';
import type { MobStateShape, PlayerStateShape } from '@shared/protocol';
import { blendInt, PALETTE, PALETTE_INT } from '@shared/palette';
import { session } from '../net/session';
import { setSetting, settings } from '../settings';
import { kitPlate, kitText } from './kit';

/** Panel box; the district diamond is fitted inside it. */
const W = 172;
const H = 132;
/** Live blips refresh cadence — cheap redraw of one small Graphics. */
const TICK_MS = 250;

/**
 * The corner minimap (U4a): the current district's real silhouette as a
 * tiny iso diamond, with live blips — you (rose pulse), other Sparks
 * (warm), mobs (ember), the tramgate (amber stop diamond). Toggled with M,
 * persisted; pure presentation from shared maps + room state.
 */
export class Minimap {
  private readonly container: Phaser.GameObjects.Container;
  private readonly terrain: Phaser.GameObjects.Graphics;
  private readonly blips: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private map: WorldMap | null = null;
  private district: DistrictId | null = null;
  private pulsePhase = 0;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    this.container.setDepth(890);

    const bg = kitPlate(scene, W, H, 9);
    this.terrain = scene.add.graphics();
    this.blips = scene.add.graphics();
    this.title = kitText(scene, W / 2, H - 15, '', 'caption', { color: PALETTE.groundAccent });
    this.title.setOrigin(0.5, 0);
    this.container.add([bg, this.terrain, this.blips, this.title]);

    const place = () =>
      this.container.setPosition(scene.scale.width - W - 12, scene.scale.height - H - 12);
    place();
    scene.scale.on('resize', place);

    scene.time.addEvent({ delay: TICK_MS, loop: true, callback: () => this.tick() });
    this.container.setVisible(settings().minimap);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  toggle(): void {
    const v = !this.container.visible;
    this.container.setVisible(v);
    setSetting('minimap', v);
    if (v) this.tick();
  }

  /** Project a tile into panel space (mini isometric, centered). */
  private project(tx: number, ty: number): { x: number; y: number } {
    const m = this.map as WorldMap;
    const s = (W - 26) / (2 * (2 * m.size)); // full diamond width fits W-26
    const c = m.size / 2;
    return {
      x: W / 2 + (tx - ty) * s * 2,
      y: (H - 18) / 2 + (tx + ty - 2 * c) * s,
    };
  }

  /** Redraw the static silhouette when the district changes. */
  private redrawTerrain(d: DistrictId): void {
    this.district = d;
    this.map = buildDistrictMap(d);
    this.title.setText(DISTRICT_NAMES[d]);
    const m = this.map;
    const g = this.terrain;
    g.clear();
    const s = (W - 26) / (2 * (2 * m.size));
    for (let ty = 0; ty < m.size; ty++) {
      for (let tx = 0; tx < m.size; tx++) {
        const walk = m.walkable[ty]?.[tx] === true;
        const canal = m.canal[ty]?.[tx] === true;
        if (!walk && !canal) continue;
        const pt = this.project(tx, ty);
        const lift = (m.elevation[ty]?.[tx] ?? 0) > 0;
        const tint = canal
          ? blendInt(PALETTE_INT.neonTeal, PALETTE_INT.ink, 0.6)
          : blendInt(PALETTE_INT.warmGlow, PALETTE_INT.structureMid, lift ? 0.6 : 0.82);
        g.fillStyle(tint, 0.9);
        g.fillPoints(
          [
            new Phaser.Geom.Point(pt.x, pt.y - s),
            new Phaser.Geom.Point(pt.x + s * 2, pt.y),
            new Phaser.Geom.Point(pt.x, pt.y + s),
            new Phaser.Geom.Point(pt.x - s * 2, pt.y),
          ],
          true,
        );
      }
    }
    // The tramgate — the one landmark every district shares.
    const gate = m.props.find((p) => p.kind === 'tramgate');
    if (gate !== undefined) {
      const gp = this.project(gate.x + gate.w / 2, gate.y + gate.h / 2);
      g.fillStyle(PALETTE_INT.neonAmber, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(gp.x, gp.y - 3.5),
          new Phaser.Geom.Point(gp.x + 3.5, gp.y),
          new Phaser.Geom.Point(gp.x, gp.y + 3.5),
          new Phaser.Geom.Point(gp.x - 3.5, gp.y),
        ],
        true,
      );
    }
  }

  /** Live blips: other Sparks, mobs, then you on top. */
  private tick(): void {
    if (!this.container.visible) return;
    const room = session.room;
    // A freshly hopped room has no state until its first patch — skip the
    // beat rather than read into the void (U6b found this the hard way).
    if (room === null || room.state?.players === undefined || room.state?.mobs === undefined) {
      this.blips.clear();
      return;
    }
    const d = room.name as DistrictId;
    if (d !== this.district) this.redrawTerrain(d);
    const g = this.blips;
    g.clear();
    this.pulsePhase = (this.pulsePhase + 1) % 8;
    room.state.players.forEach((p: PlayerStateShape, id: string) => {
      if (id === room.sessionId) return;
      const pt = this.project(p.tileX, p.tileY);
      g.fillStyle(PALETTE_INT.warmGlow, 0.95);
      g.fillCircle(pt.x, pt.y, 1.6);
    });
    room.state.mobs.forEach((mob: MobStateShape) => {
      if (mob.hp <= 0) return;
      const pt = this.project(mob.tileX, mob.tileY);
      g.fillStyle(PALETTE_INT.emberOrange, 0.9);
      g.fillCircle(pt.x, pt.y, 1.4);
    });
    const me = room.state.players.get(room.sessionId) as PlayerStateShape | undefined;
    if (me !== undefined) {
      const pt = this.project(me.tileX, me.tileY);
      const halo = 2.6 + (this.pulsePhase < 4 ? this.pulsePhase : 8 - this.pulsePhase) * 0.35;
      g.fillStyle(PALETTE_INT.neonRose, 0.35);
      g.fillCircle(pt.x, pt.y, halo);
      g.fillStyle(PALETTE_INT.neonRose, 1);
      g.fillCircle(pt.x, pt.y, 1.9);
    }
  }
}
