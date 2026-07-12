/**
 * Phaser's mouse manager also listens at the window level, so pointer events
 * that land on DOM overlays bubble up and get replayed into the world —
 * a click on the creator's confirm button was opening the tram stop board
 * underneath it. Overlays call this on their root to keep their input to
 * themselves. stopPropagation at the root runs in the bubble phase, so the
 * overlay's own buttons and inputs still work normally.
 */
export function swallowGameInput(el: HTMLElement): void {
  const evs = [
    'pointerdown',
    'pointerup',
    'pointermove',
    'mousedown',
    'mouseup',
    'mousemove',
    'touchstart',
    'touchend',
    'touchmove',
    'wheel',
    'click',
  ];
  for (const ev of evs) {
    el.addEventListener(ev, (e) => e.stopPropagation());
  }
}
