import Phaser from 'phaser';
import { CONFIG } from '@shared/config';

/**
 * Camera feel: pointer-anchored wheel zoom (clamped), middle-mouse drag pan,
 * edge pan, and lerped follow of a target once one exists. Manual panning
 * pauses follow; movement code re-engages it via followTarget().
 */
export class CameraController {
  private readonly scene: Phaser.Scene;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private target: Phaser.GameObjects.Components.Transform | null = null;
  private following = false;
  private dragging = false;
  private locked = false;
  private lastDrag = new Phaser.Math.Vector2();

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
        // SHARPNESS (addendum a): zoom walks texel-crisp steps only —
        // textures bake at 2× and draw at 0.5, so these ratios decimate
        // uniformly (no shimmer, no half-texel smear).
        const steps = CONFIG.camera.zoomSteps as readonly number[];
        const idx = steps.findIndex((s) => Math.abs(s - this.cam.zoom) < 0.01);
        const at = idx >= 0 ? idx : 1;
        const nextIdx = Phaser.Math.Clamp(at + (deltaY > 0 ? -1 : 1), 0, steps.length - 1);
        const next = steps[nextIdx] as number;
        if (next === this.cam.zoom) return;
        // Keep the world point under the cursor fixed while zooming.
        const before = this.cam.getWorldPoint(pointer.x, pointer.y);
        this.cam.setZoom(next);
        // Force matrix update before re-projecting.
        this.cam.preRender();
        const after = this.cam.getWorldPoint(pointer.x, pointer.y);
        this.cam.scrollX += before.x - after.x;
        this.cam.scrollY += before.y - after.y;
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
      if (!this.dragging) return;
      this.cam.scrollX -= (pointer.x - this.lastDrag.x) / this.cam.zoom;
      this.cam.scrollY -= (pointer.y - this.lastDrag.y) / this.cam.zoom;
      this.lastDrag.set(pointer.x, pointer.y);
    });
  }

  /** Follow a target (the Spark). Re-engages after manual panning. */
  followTarget(target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
    this.following = true;
  }

  /**
   * Photo mode (marketing shots): a locked camera holds a composed frame
   * — edge pan, drag, and the follow lerp all stand down. Unlocking
   * re-engages follow if a target exists.
   */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked && this.target !== null) this.following = true;
  }

  update(deltaMs: number): void {
    if (this.locked) return;
    const pointer = this.scene.input.activePointer;

    // Edge pan (disabled while dragging; pauses follow when used).
    if (!this.dragging && pointer.isDown === false) {
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

    // Lerped follow.
    if (this.following && this.target) {
      const lerp = CONFIG.camera.followLerp;
      const cx = this.cam.midPoint.x;
      const cy = this.cam.midPoint.y;
      this.cam.centerOn(
        Phaser.Math.Linear(cx, this.target.x, lerp),
        Phaser.Math.Linear(cy, this.target.y, lerp),
      );
    }
  }
}
