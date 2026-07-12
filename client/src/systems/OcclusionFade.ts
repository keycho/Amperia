import Phaser from 'phaser';

/**
 * OCCLUSION FADE (districts block T0, per the Part I §5 amendment): any
 * tall structure standing between the camera and the player's Spark (or
 * the hovered tile) drops to ~35% opacity with a soft transition and
 * restores when clear. In iso "between" means: drawn IN FRONT of the
 * target (higher depth) while its sprite bounds cover the target's spot.
 *
 * Structures register at placement; anything too short to hide a Spark
 * is refused so short props never flicker. Attached light FX (signs,
 * window spill) register as companions and fade with their building.
 */

const FADED = 0.35;
/** Display height below which a prop can't meaningfully hide a Spark. */
const MIN_OCCLUDER_HEIGHT_PX = 55;
/** Approach speed of the alpha lerp (per ~16ms frame). */
const EASE = 0.16;

interface Occluder {
  img: Phaser.GameObjects.Image;
  companions: Array<{ obj: Phaser.GameObjects.Components.Alpha; base: number }>;
  target: number;
}

export interface OcclusionTarget {
  x: number;
  y: number;
  depth: number;
}

export class OcclusionFade {
  private readonly occluders: Occluder[] = [];
  private acc = 0;

  /**
   * Register a structure. Returns true if accepted (tall enough).
   * Companions (its glows/signs) fade with it, scaled to their own
   * base alpha so bloom levels keep their relative mix.
   */
  register(
    img: Phaser.GameObjects.Image,
    companions: Phaser.GameObjects.Components.Alpha[] = [],
  ): boolean {
    if (img.displayHeight < MIN_OCCLUDER_HEIGHT_PX) return false;
    this.occluders.push({
      img,
      companions: companions.map((obj) => ({ obj, base: obj.alpha })),
      target: 1,
    });
    return true;
  }

  /** Late-bind companions (a building's sign/window glows) to a structure. */
  attach(img: Phaser.GameObjects.Image, companions: Phaser.GameObjects.Components.Alpha[]): void {
    const occ = this.occluders.find((o) => o.img === img);
    if (occ === undefined) return;
    for (const obj of companions) occ.companions.push({ obj, base: obj.alpha });
  }

  /** Call every frame; the occlusion test itself runs at ~10Hz. */
  update(deltaMs: number, targets: OcclusionTarget[]): void {
    this.acc += deltaMs;
    if (this.acc >= 100) {
      this.acc = 0;
      for (const occ of this.occluders) {
        if (!occ.img.active) {
          occ.target = 1;
          continue;
        }
        occ.target = this.covers(occ.img, targets) ? FADED : 1;
      }
    }
    // The soft transition: exponential ease toward the target every frame.
    const k = 1 - Math.pow(1 - EASE, deltaMs / 16.6);
    for (const occ of this.occluders) {
      const a = occ.img.alpha + (occ.target - occ.img.alpha) * k;
      if (Math.abs(a - occ.img.alpha) < 0.001) continue;
      occ.img.setAlpha(a);
      const t = (a - FADED) / (1 - FADED); // 0 at faded, 1 at clear
      for (const c of occ.companions) {
        c.obj.setAlpha(c.base * (FADED + (1 - FADED) * t));
      }
    }
  }

  private covers(img: Phaser.GameObjects.Image, targets: OcclusionTarget[]): boolean {
    for (const t of targets) {
      if (img.depth <= t.depth) continue; // drawn behind the target — clear
      // A Spark-sized window around the target's feet must intersect the
      // structure's sprite for it to count as hiding them.
      const b = img.getBounds();
      if (t.x > b.left - 6 && t.x < b.right + 6 && t.y > b.top && t.y < b.bottom + 8) {
        return true;
      }
    }
    return false;
  }
}
