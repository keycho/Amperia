import type Phaser from 'phaser';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';

/**
 * The tooltip (U3c): one DOM card for everything hoverable — item slots,
 * nodes, mobs, and the city's fixtures. DOM keeps the type crisp over the
 * canvas; thumbs draw from the SAME baked textures the world uses.
 */

export interface TooltipContent {
  title: string;
  /** Small accent line under the title (tier, kind, warning). */
  sub?: string;
  /** Flavor/body lines. */
  lines?: string[];
  /** Baked texture key to draw as a thumb card. */
  thumb?: { scene: Phaser.Scene; key: string };
}

let root: HTMLDivElement | null = null;
let thumbCanvas: HTMLCanvasElement | null = null;
let titleEl: HTMLDivElement | null = null;
let subEl: HTMLDivElement | null = null;
let bodyEl: HTMLDivElement | null = null;
/** Set by show/move — i.e. by the owning object's own hover handlers. */
let lastOwnerTouch = 0;
let staleGuard: ReturnType<typeof setTimeout> | undefined;

function ensure(): void {
  if (root !== null) return;
  // Safety net: the world can scroll an object out from under a motionless
  // pointer (walking away, camera pan), so pointerout never fires and the
  // card would stick. Any mouse move the owner does NOT refresh hides it.
  window.addEventListener(
    'mousemove',
    () => {
      if (root === null || root.style.display === 'none') return;
      const at = performance.now();
      clearTimeout(staleGuard);
      staleGuard = setTimeout(() => {
        if (lastOwnerTouch < at) tooltip.hide();
      }, 40);
    },
    true,
  );
  root = document.createElement('div');
  root.id = 'amperia-tooltip';
  root.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:40',
    `background:${PALETTE.ink}F0`,
    `border:1px solid ${PALETTE.neonAmber}99`,
    'border-radius:9px',
    'padding:9px 11px',
    'font-family:monospace',
    'max-width:240px',
    'display:none',
    'box-shadow:0 6px 22px rgba(0,0,0,0.5)',
  ].join(';');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:9px;align-items:flex-start;';
  thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 44;
  thumbCanvas.height = 44;
  thumbCanvas.style.cssText = `image-rendering:pixelated;border-radius:6px;background:${PALETTE.duskSky};display:none;flex:none;`;
  const col = document.createElement('div');
  titleEl = document.createElement('div');
  titleEl.style.cssText = `color:${PALETTE.warmGlow};font-size:13px;font-weight:bold;`;
  subEl = document.createElement('div');
  subEl.style.cssText = `color:${PALETTE.neonTeal};font-size:10px;margin-top:1px;`;
  bodyEl = document.createElement('div');
  bodyEl.style.cssText = `color:${UI_TEXT_WARM};opacity:.85;font-size:11px;margin-top:4px;line-height:1.45;`;
  col.append(titleEl, subEl, bodyEl);
  row.append(thumbCanvas, col);
  root.append(row);
  document.body.append(root);
}

function place(x: number, y: number): void {
  if (root === null) return;
  const pad = 14;
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  let px = x + pad;
  let py = y + pad;
  if (px + w > window.innerWidth - 8) px = x - w - pad;
  if (py + h > window.innerHeight - 8) py = y - h - pad;
  root.style.left = `${Math.max(4, px)}px`;
  root.style.top = `${Math.max(4, py)}px`;
}

export const tooltip = {
  show(x: number, y: number, c: TooltipContent): void {
    ensure();
    if (root === null || titleEl === null || subEl === null || bodyEl === null) return;
    lastOwnerTouch = performance.now();
    titleEl.textContent = c.title;
    subEl.textContent = c.sub ?? '';
    subEl.style.display = c.sub === undefined ? 'none' : 'block';
    bodyEl.textContent = (c.lines ?? []).join('\n');
    bodyEl.style.whiteSpace = 'pre-line';
    bodyEl.style.display = (c.lines ?? []).length === 0 ? 'none' : 'block';
    if (thumbCanvas !== null) {
      if (c.thumb !== undefined && c.thumb.scene.textures.exists(c.thumb.key)) {
        const src = c.thumb.scene.textures.get(c.thumb.key).getSourceImage() as HTMLCanvasElement;
        const ctx = thumbCanvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 44, 44);
        // CLARITY: integer steps only — 1:1 when it fits, exact 1/k when
        // it doesn't. Fractional resizes wobble pixel edges.
        const big = Math.max(src.width, src.height);
        const sc = big <= 44 ? 1 : 1 / Math.ceil(big / 44);
        const dw = Math.round(src.width * sc);
        const dh = Math.round(src.height * sc);
        ctx.drawImage(src, Math.floor((44 - dw) / 2), Math.floor((44 - dh) / 2), dw, dh);
        thumbCanvas.style.display = 'block';
      } else {
        thumbCanvas.style.display = 'none';
      }
    }
    root.style.display = 'block';
    place(x, y);
  },
  move(x: number, y: number): void {
    lastOwnerTouch = performance.now();
    if (root !== null && root.style.display !== 'none') place(x, y);
  },
  hide(): void {
    if (root !== null) root.style.display = 'none';
  },
};

/** Wire a world object's hover to the tooltip (mobs, nodes, fixtures). */
export function hoverTip(
  img: Phaser.GameObjects.GameObject & {
    on(ev: string, cb: (...args: never[]) => void): unknown;
  },
  content: () => TooltipContent,
): void {
  img.on('pointerover', ((p: Phaser.Input.Pointer) =>
    tooltip.show(p.event instanceof MouseEvent ? p.event.clientX : p.x, p.event instanceof MouseEvent ? p.event.clientY : p.y, content())) as never);
  img.on('pointermove', ((p: Phaser.Input.Pointer) =>
    tooltip.move(p.event instanceof MouseEvent ? p.event.clientX : p.x, p.event instanceof MouseEvent ? p.event.clientY : p.y)) as never);
  img.on('pointerout', (() => tooltip.hide()) as never);
  img.on('destroy', (() => tooltip.hide()) as never);
}
