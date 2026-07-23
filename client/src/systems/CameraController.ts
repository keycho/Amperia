import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { session } from '../net/session';
import { anchorScroll, clampCenter, snapScreenGrid, stepZoom, viewCenter } from './cameraMath';

/**
 * Camera feel (F1): step-ladder wheel zoom, middle-mouse drag pan, edge pan,
 * and lerped follow of the Spark. The controller OWNS the clamp — Phaser's
 * cam.setBounds is not used, because its corner-pin behaviour when the
 * viewport out-sizes the bounds was bug B5. Every scroll mutation funnels
 * through {@link applyClamp}, which clamps to the deck (screen-constant void
 * margin) and rounds onto the screen-pixel grid so nothing shimmers.
 *
 * Zoom rules (all live-repro'd before fixing):
 *  - steps only (CONFIG.camera.zoomSteps — the texel-crisp set at NEAREST);
 *    off-ladder zooms (photo mode) snap home on the next wheel, never invert;
 *  - anchored on the pointer when free, on the FOLLOW TARGET while following
 *    (pointer-anchoring mid-walk threw the Spark ~850px off screen and let
 *    the follow lerp rubber-band it back — the worst of the reported bugs);
 *  - ignored while a UI panel is open (session.panelOpen) or camera locked;
 *  - a zoom change emits 'camera-zoom' on scene.events so world-anchored
 *    text (nameplates, marker labels, E-prompt, bubbles) can counter-scale.
 */
export class CameraController {
  private readonly scene: Phaser.Scene;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private target: Phaser.GameObjects.Components.Transform | null = null;
  private following = false;
  private dragging = false;
  private locked = false;
  private lastDrag = new Phaser.Math.Vector2();
  /** True once the mouse has actually moved — a pristine pointer parks at
   *  (0,0), inside the edge-pan margin, and used to pan the camera into the
   *  corner (and silently kill follow) before the player ever touched it. */
  private pointerSeen = false;
  /** World-space deck rect; clamp is a no-op until the scene provides it. */
  private bounds: { x: number; y: number; w: number; h: number } | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.cam = scene.cameras.main;

    scene.input.on(
      'wheel',
      (
        pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        deltaY: number,
      ) => {
        if (this.locked || session.panelOpen) return;
        const steps = CONFIG.camera.zoomSteps as readonly number[];
        const next = stepZoom(steps, this.cam.zoom, deltaY > 0 ? -1 : 1);
        if (next === this.cam.zoom) return;

        // Anchor: the follow target's screen point while following (the Spark
        // must not move on screen), the pointer's world point when free.
        // Screen positions come from LIVE scroll (viewCenter), never
        // cam.midPoint — midPoint only refreshes at preRender, and a stale
        // read across our own mid-frame scroll writes was the 239px jump.
        let wx: number;
        let wy: number;
        let sx: number;
        let sy: number;
        const cX = viewCenter(this.cam.scrollX, this.cam.width);
        const cY = viewCenter(this.cam.scrollY, this.cam.height);
        if (this.following && this.target !== null) {
          wx = this.target.x;
          wy = this.target.y;
          sx = (wx - cX) * this.cam.zoom + this.cam.width / 2;
          sy = (wy - cY) * this.cam.zoom + this.cam.height / 2;
        } else {
          wx = cX + (pointer.x - this.cam.width / 2) / this.cam.zoom;
          wy = cY + (pointer.y - this.cam.height / 2) / this.cam.zoom;
          sx = pointer.x;
          sy = pointer.y;
        }
        this.cam.setZoom(next);
        const s = anchorScroll(next, this.cam.width, this.cam.height, wx, wy, sx, sy);
        this.cam.scrollX = s.scrollX;
        this.cam.scrollY = s.scrollY;
        this.applyClamp();
        this.scene.events.emit('camera-zoom', next);
      },
    );

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        this.dragging = true;
        this.following = false;
        this.lastDrag.set(pointer.x, pointer.y);
      }
    });
    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.middleButtonDown()) this.dragging = false;
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = true;
      if (!this.dragging) return;
      this.cam.scrollX -= (pointer.x - this.lastDrag.x) / this.cam.zoom;
      this.cam.scrollY -= (pointer.y - this.lastDrag.y) / this.cam.zoom;
      this.lastDrag.set(pointer.x, pointer.y);
      this.applyClamp();
    });
  }

  /** The deck rect the camera may show (plus a screen-constant void margin). */
  setWorldBounds(b: { x: number; y: number; w: number; h: number }): void {
    this.bounds = b;
    this.applyClamp();
  }

  /** Follow a target (the Spark). Re-engages after manual panning. */
  followTarget(target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
    this.following = true;
  }

  /**
   * Photo mode (marketing shots): a locked camera holds a composed frame
   * — wheel, edge pan, drag, clamp, and the follow lerp all stand down.
   * Unlocking re-engages follow if a target exists.
   */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked && this.target !== null) this.following = true;
  }

  /**
   * Clamp scroll to the deck + a screen-constant margin (so the visible void
   * beyond an edge never exceeds ~CONFIG.camera.edgeVoidScreenPx on screen at
   * any zoom), centring instead of pinning when the viewport out-sizes the
   * deck, then round onto the screen-pixel grid.
   */
  private applyClamp(): void {
    if (this.bounds === null) return;
    const z = this.cam.zoom;
    const margin = CONFIG.camera.edgeVoidScreenPx / z;
    // Clamp in CENTRE space (centre = scroll + view/2, zoom-independent —
    // the verified Phaser model), then convert back and round to the grid.
    const cx = clampCenter(
      viewCenter(this.cam.scrollX, this.cam.width),
      this.cam.displayWidth,
      this.bounds.x,
      this.bounds.w,
      margin,
    );
    const cy = clampCenter(
      viewCenter(this.cam.scrollY, this.cam.height),
      this.cam.displayHeight,
      this.bounds.y,
      this.bounds.h,
      margin,
    );
    this.cam.scrollX = snapScreenGrid(cx - this.cam.width / 2, z);
    this.cam.scrollY = snapScreenGrid(cy - this.cam.height / 2, z);
  }

  update(deltaMs: number): void {
    if (this.locked) return;
    const pointer = this.scene.input.activePointer;

    // Edge pan (disabled while dragging; pauses follow when used). Only a
    // pointer that has really moved AND is over the canvas counts — else the
    // camera creeps to a corner on its own (F1: the follow-loss bug).
    if (!this.dragging && pointer.isDown === false && this.pointerSeen && this.scene.input.isOver) {
      const { edgePanMarginPx, edgePanSpeed } = CONFIG.camera;
      const w = this.scene.scale.width;
      const h = this.scene.scale.height;
      const inCanvas = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= w && pointer.y <= h;
      if (inCanvas) {
        let vx = 0;
        let vy = 0;
        if (pointer.x < edgePanMarginPx) vx = -1;
        else if (pointer.x > w - edgePanMarginPx) vx = 1;
        if (pointer.y < edgePanMarginPx) vy = -1;
        else if (pointer.y > h - edgePanMarginPx) vy = 1;
        if (vx !== 0 || vy !== 0) {
          this.following = false;
          const step = (edgePanSpeed * (deltaMs / 1000)) / this.cam.zoom;
          this.cam.scrollX += vx * step;
          this.cam.scrollY += vy * step;
        }
      }
    }

    // Lerped follow — from the LIVE centre (scroll-derived), never the
    // preRender-cached midPoint: a stale read across a same-frame zoom
    // anchor was the mid-walk 239px camera jump.
    if (this.following && this.target) {
      const lerp = CONFIG.camera.followLerp;
      const cx = viewCenter(this.cam.scrollX, this.cam.width);
      const cy = viewCenter(this.cam.scrollY, this.cam.height);
      this.cam.centerOn(
        Phaser.Math.Linear(cx, this.target.x, lerp),
        Phaser.Math.Linear(cy, this.target.y, lerp),
      );
    }

    // One clamp+round per frame catches every mutation path above.
    this.applyClamp();
  }
}
