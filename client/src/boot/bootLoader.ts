/**
 * P4 — the instant boot loader. The visual lives inline in `index.html` (pure
 * HTML/CSS, so it is the first paint, before this bundle is even fetched).
 * These helpers drive its progress bar from the Phaser asset loader and fade
 * it out once the first scene is ready. Everything no-ops once it's gone.
 */

let removed = false;

/** Set the bar fill (0..1). Reserve the last sliver for the bake step. */
export function bootProgress(p: number): void {
  if (removed) return;
  const bar = document.getElementById('boot-bar');
  if (bar === null) return;
  const pct = Math.round(Math.max(0.06, Math.min(1, p)) * 100);
  bar.style.width = `${pct}%`;
}

/** First scene ready: fill, fade over ~300ms, then remove from the DOM. */
export function bootDone(): void {
  if (removed) return;
  removed = true;
  const boot = document.getElementById('boot');
  if (boot === null) return;
  const bar = document.getElementById('boot-bar');
  if (bar !== null) bar.style.width = '100%';
  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 320);
}
