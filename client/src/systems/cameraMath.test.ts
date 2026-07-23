import { describe, expect, it } from 'vitest';
import {
  anchorScroll,
  clampCenter,
  nearestStepIdx,
  snapScreenGrid,
  stepZoom,
  viewCenter,
  worldTextScale,
} from './cameraMath';

/** Phaser's verified forward transform: centre = scroll + view/2 (zoom-free),
 *  screen = (world − centre)·zoom + view/2. The tests below hold the math to
 *  THIS model — the live matrix was probed to confirm it (F1 probe4). */
function toScreen(world: number, scroll: number, view: number, zoom: number): number {
  return (world - (scroll + view / 2)) * zoom + view / 2;
}

const STEPS = [0.5, 1, 2] as const;

describe('zoom ladder', () => {
  it('walks the steps and clamps at the ends', () => {
    expect(stepZoom(STEPS, 1, 1)).toBe(2);
    expect(stepZoom(STEPS, 1, -1)).toBe(0.5);
    expect(stepZoom(STEPS, 2, 1)).toBe(2); // top rung holds
    expect(stepZoom(STEPS, 0.5, -1)).toBe(0.5); // bottom rung holds
  });

  it('snaps an off-ladder zoom home without inverting (bug B2)', () => {
    // Photo mode can leave zoom at 3: wheel-in must NOT lower it below the
    // nearest rung; it lands on 2 (the ladder top), never keeps climbing.
    expect(stepZoom(STEPS, 3, 1)).toBe(2);
    expect(stepZoom(STEPS, 3, -1)).toBe(2); // snapping IS the outward move
    // 1.3 wheel-out snaps down to 1 (not a wild jump to 0.5)…
    expect(stepZoom(STEPS, 1.3, -1)).toBe(1);
    // …and wheel-in from 1.3 climbs to 2.
    expect(stepZoom(STEPS, 1.3, 1)).toBe(2);
    expect(nearestStepIdx(STEPS, 1.3)).toBe(1);
    expect(nearestStepIdx(STEPS, 0.1)).toBe(0);
  });
});

describe('anchorScroll — the world point under the cursor stays put', () => {
  it('is the exact inverse of the verified camera transform, at every zoom', () => {
    for (const zoom of [0.5, 1, 2]) {
      // viewport 1280×720: want world (500, 300) at screen (900, 260).
      const { scrollX, scrollY } = anchorScroll(zoom, 1280, 720, 500, 300, 900, 260);
      expect(toScreen(500, scrollX, 1280, zoom)).toBeCloseTo(900, 6);
      expect(toScreen(300, scrollY, 720, zoom)).toBeCloseTo(260, 6);
    }
  });

  it('centring the target = anchoring it at the viewport centre', () => {
    for (const zoom of [0.5, 1, 2]) {
      const { scrollX } = anchorScroll(zoom, 1280, 720, 100, 0, 640, 360);
      expect(viewCenter(scrollX, 1280)).toBeCloseTo(100, 6);
    }
  });
});

describe('clampCenter — never over-scroll, never corner-pin', () => {
  it('clamps the visible edge to the margin', () => {
    // bounds [0, 3000], display 1000, margin 100:
    // visible left ≥ −100 ⇒ centre ≥ 400; visible right ≤ 3100 ⇒ centre ≤ 2600.
    expect(clampCenter(0, 1000, 0, 3000, 100)).toBe(400);
    expect(clampCenter(2900, 1000, 0, 3000, 100)).toBe(2600);
    expect(clampCenter(1500, 1000, 0, 3000, 100)).toBe(1500);
  });

  it('centres the deck when the viewport out-sizes it (bug B5)', () => {
    // 1080p at zoom 0.5 in a 40-tile district: display 3840 > bounds 3000.
    expect(clampCenter(-1200, 3840, -1500, 3000, 100)).toBeCloseTo(0, 6);
  });
});

describe('pixel-grid rounding + label counter-scale', () => {
  it('rounds scroll onto the screen-pixel grid per zoom', () => {
    expect(snapScreenGrid(10.3, 1)).toBe(10);
    expect(snapScreenGrid(10.3, 2)).toBe(10.5); // half-world-px = whole screen px
    expect(snapScreenGrid(10.3, 0.5)).toBe(10); // 2-world-px grid at 0.5
  });

  it('keeps text screen-size at min zoom, world-size at 1+', () => {
    expect(worldTextScale(0.5)).toBe(2);
    expect(worldTextScale(1)).toBe(1);
    expect(worldTextScale(2)).toBe(1);
  });
});
