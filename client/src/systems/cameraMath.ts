/**
 * F1 — pure camera math, unit-tested off the live scene.
 *
 * The zoom ladder is the texel-crisp step set from CONFIG.camera.zoomSteps
 * (textures bake at 2× and draw at 0.5, so 0.5 / 1 / 2 decimate uniformly
 * under NEAREST — any other ratio shimmers). Everything here is deterministic:
 * the controller feeds in camera numbers and applies what comes back.
 */

/** Index of the step nearest to `zoom` — snaps off-ladder zooms home. */
export function nearestStepIdx(steps: readonly number[], zoom: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs((steps[i] as number) - zoom);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * The zoom after one wheel notch: snap the current zoom to its nearest step,
 * then walk one rung in `dir` (+1 in, -1 out), clamped to the ladder ends.
 * An off-ladder zoom therefore first lands on the ladder (never inverts).
 */
export function stepZoom(steps: readonly number[], zoom: number, dir: 1 | -1): number {
  const at = nearestStepIdx(steps, zoom);
  const snapped = steps[at] as number;
  // Off the ladder: snapping IS the move when it already goes in `dir`.
  if (Math.abs(snapped - zoom) > 1e-9 && Math.sign(snapped - zoom) === dir) return snapped;
  const next = Math.min(steps.length - 1, Math.max(0, at + dir));
  return steps[next] as number;
}

/**
 * Phaser's camera model, verified against the live matrix (probe4): the view
 * CENTRE is `scroll + viewport/2` — zoom-independent — and
 * screen = (world − centre)·zoom + viewport/2. Zoom widens/narrows the view
 * around that centre; `scroll` is NOT the visible left edge except at zoom 1.
 * All math below works in centre space and converts at the boundary.
 */

/** The world point at the viewport centre for a given scroll. */
export function viewCenter(scroll: number, viewExtent: number): number {
  return scroll + viewExtent / 2;
}

/**
 * Scroll that keeps world point (wx,wy) exactly under screen point (sx,sy)
 * at `zoom` — closed form, no matrix poking, no stale midPoint reads.
 */
export function anchorScroll(
  zoom: number,
  viewW: number,
  viewH: number,
  wx: number,
  wy: number,
  sx: number,
  sy: number,
): { scrollX: number; scrollY: number } {
  const centerX = wx - (sx - viewW / 2) / zoom;
  const centerY = wy - (sy - viewH / 2) / zoom;
  return { scrollX: centerX - viewW / 2, scrollY: centerY - viewH / 2 };
}

/**
 * Clamp one axis' view CENTRE so the visible edge never over-scrolls past
 * the deck edge by more than `marginWorld`. When the visible extent out-sizes
 * the whole deck + margins (1080p at min zoom in a 40-tile district), centre
 * the deck instead of pinning to a corner — Phaser's own bounds clamp pins,
 * which was bug B5.
 */
export function clampCenter(
  center: number,
  displayExtent: number,
  boundsMin: number,
  boundsExtent: number,
  marginWorld: number,
): number {
  const min = boundsMin - marginWorld + displayExtent / 2;
  const max = boundsMin + boundsExtent + marginWorld - displayExtent / 2;
  if (max < min) return boundsMin + boundsExtent / 2;
  return Math.min(max, Math.max(min, center));
}

/**
 * Round a scroll value onto the SCREEN-pixel grid (multiples of 1/zoom in
 * world space) — with NEAREST + roundPixels this keeps every sprite landing
 * on whole device pixels, so nothing shimmers as the camera settles.
 */
export function snapScreenGrid(scroll: number, zoom: number): number {
  return Math.round(scroll * zoom) / zoom;
}

/**
 * Counter-scale for world-anchored text/pictograms (nameplates, marker
 * labels, the E-prompt, speech bubbles, float text): at zoom < 1 they hold
 * their screen size (×1/zoom) so they stay legible; at zoom ≥ 1 they scale
 * with the world (chunky pixel text is the look, and downscaling text under
 * NEAREST would smear it).
 */
export function worldTextScale(zoom: number): number {
  return Math.max(1, 1 / zoom);
}
