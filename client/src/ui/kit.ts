import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';

/**
 * PP1 — THE UI KIT. One reusable panel/text system for every surface, so any
 * screenshot reads like a shipped game. No bespoke boxes, no arbitrary font
 * sizes, no ad-hoc rectangles anywhere after this.
 *
 *  · plate()      — the 9-slice-style ink plate (fill, border, top bevel,
 *                   corner rivets, soft drop shadow)
 *  · header()     — title + Dynamo glyph + [x] close bar
 *  · button()     — idle / hover / pressed (amber gradient for primary)
 *  · chip()       — HUD counter pill (glyph + value)
 *  · text()       — the LOCKED type scale (display / heading / body / caption)
 *
 * Spacing lives on an 8px grid (SPACE). Colours are the kit chrome from the
 * block spec, drawn from the warm-dusk family.
 */

/** UI-chrome colours (block spec) — the plate family, warm-dusk. */
export const UIK = {
  plate: 0x141024, // ink #141024
  border: 0x3a2f58, // #3A2F58
  bevel: PALETTE_INT.warmGlow, // top inner highlight (used at low alpha)
  amber: PALETTE_INT.neonAmber,
  amberLight: PALETTE_INT.warmGlow,
  amberDark: 0xb2711f,
  rose: PALETTE_INT.neonRose,
  roseLight: 0xff9db3,
  roseDark: 0xb23a56,
  shadow: 0x000000,
} as const;

/** The ONLY font sizes in the UI after PP1. */
export const TYPE = { display: 28, heading: 18, body: 13, caption: 11 } as const;
export type TypeLevel = keyof typeof TYPE;

/** 8px spacing grid (xs is the half-step for tight insets). */
export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const RADIUS = 10;
export const HEADER_H = 36;

/** A kit text object at a locked size. Warm ink-on-plate by default. */
export function kitText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  level: TypeLevel = 'body',
  opts: { color?: string; bold?: boolean; align?: 'left' | 'center' | 'right' } = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, {
    fontFamily: 'monospace',
    fontSize: `${TYPE[level]}px`,
    color: opts.color ?? UI_TEXT_WARM,
    fontStyle: opts.bold === true ? 'bold' : 'normal',
    align: opts.align ?? 'left',
  });
}

/**
 * The kit plate: soft drop shadow, ink fill at 92%, a 1px outer border, a
 * 1px warm bevel highlight along the top inner edge, and four corner rivet
 * pixels. Returns a fresh Graphics at (0,0) — add it as a panel's first child.
 */
export function kitPlate(scene: Phaser.Scene, w: number, h: number, r = RADIUS): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  // F4 overlap detector: plates declare their opaque rect so the audit can
  // (a) require child texts to stay inside and (b) treat covered text as
  // hidden, not colliding. Local-space offset + size.
  g.setData('kitClipRect', { ox: 0, oy: 0, w, h });
  g.fillStyle(UIK.shadow, 0.34);
  g.fillRoundedRect(3, 5, w, h, r);
  g.fillStyle(UIK.plate, 0.92);
  g.fillRoundedRect(0, 0, w, h, r);
  g.lineStyle(1, UIK.border, 1);
  g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, r);
  g.lineStyle(1, UIK.bevel, 0.1);
  g.beginPath();
  g.moveTo(r, 1.5);
  g.lineTo(w - r, 1.5);
  g.strokePath();
  g.fillStyle(UIK.bevel, 0.22);
  for (const [rx, ry] of [
    [6, 6],
    [w - 8, 6],
    [6, h - 8],
    [w - 8, h - 8],
  ] as const) {
    g.fillRect(rx, ry, 2, 2);
  }
  return g;
}

/**
 * A header bar drawn into `container`: a lighter strip with a hairline under
 * it, the panel title (heading, amber), a small Dynamo glyph, and an [x]
 * close button. Returns nothing — pass `onClose` to wire the button.
 */
export function kitHeader(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  w: number,
  title: string,
  onClose?: () => void,
): void {
  const g = scene.add.graphics();
  g.fillStyle(UIK.border, 0.26);
  g.fillRoundedRect(1, 1, w - 2, HEADER_H, { tl: RADIUS - 1, tr: RADIUS - 1, bl: 0, br: 0 });
  g.lineStyle(1, UIK.border, 0.85);
  g.beginPath();
  g.moveTo(SPACE.sm, HEADER_H + 0.5);
  g.lineTo(w - SPACE.sm, HEADER_H + 0.5);
  g.strokePath();
  container.add(g);

  const glyph = scene.add
    .image(SPACE.md, HEADER_H / 2, 'fx-glow')
    .setTint(UIK.amber)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.08)
    .setAlpha(0.9);
  container.add(glyph);

  const t = kitText(scene, SPACE.md + 13, HEADER_H / 2 - 1, title, 'heading', {
    color: PALETTE.neonAmber,
    bold: true,
  }).setOrigin(0, 0.5);
  // F4: a long title must never cross the ✕ or the plate edge — one line,
  // ellipsis-clamped to the space between the glyph and the close button.
  t.setWordWrapWidth(Math.max(60, w - (SPACE.md + 13) - SPACE.md - 26));
  kitClampLines(t, 1);
  container.add(t);

  if (onClose !== undefined) container.add(kitCloseButton(scene, w - SPACE.md, HEADER_H / 2, onClose));
}

/** The [x] close glyph — a small hover-lit button, origin-centred at (x,y). */
export function kitCloseButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClose: () => void,
): Phaser.GameObjects.Text {
  const t = kitText(scene, x, y, '✕', 'body', { color: UI_TEXT_WARM, bold: true }).setOrigin(1, 0.5);
  t.setAlpha(0.7);
  t.setInteractive({ useHandCursor: true });
  t.on('pointerover', () => t.setColor(PALETTE.neonRose).setAlpha(1));
  t.on('pointerout', () => t.setColor(UI_TEXT_WARM).setAlpha(0.7));
  t.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    onClose();
  });
  return t;
}

export interface ButtonOpts {
  width?: number;
  height?: number;
  /** Amber gradient — the affirmative ACT (buy, craft, confirm, accept). */
  primary?: boolean;
  /** Rose gradient — DESTRUCTIVE / irreversible (drop, abandon, leave). */
  danger?: boolean;
  onClick: () => void;
}

/**
 * A kit button with idle / hover / pressed states.
 *
 * BUTTON-COLOUR RULE (enforced by convention — keep it):
 *   · AMBER (primary)  = ACT — affirmative, safe: buy, craft, confirm, accept,
 *                        rent, claim, donate.
 *   · ROSE  (danger)   = DESTROY — destructive or irreversible: drop an item,
 *                        abandon a quest, leave with an unsaved trade, log out.
 *                        Never dress a destructive action in the same friendly
 *                        amber as "buy" — that is a misclick hazard.
 *   · PLAIN plate (default) = CANCEL / SECONDARY — back, close, dismiss, and
 *                        low-stakes steppers (+/-).
 * Set exactly one of `primary` / `danger`; omit both for a secondary button.
 */
export function kitButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  opts: ButtonOpts,
): Phaser.GameObjects.Container {
  const danger = opts.danger === true;
  const filled = opts.primary === true || danger;
  const base = danger ? UIK.rose : UIK.amber;
  const light = danger ? UIK.roseLight : UIK.amberLight;
  const dark = danger ? UIK.roseDark : UIK.amberDark;
  const h = opts.height ?? 30;
  const probe = kitText(scene, 0, 0, label, 'body', { bold: true });
  const w = opts.width ?? Math.max(64, Math.ceil(probe.width) + SPACE.lg);
  probe.destroy();

  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const txt = kitText(scene, w / 2, h / 2, label, 'body', {
    bold: true,
    // Filled buttons carry dark ink text; a plain secondary reads amber.
    color: filled ? '#201626' : PALETTE.neonAmber,
  }).setOrigin(0.5);
  c.add([g, txt]);

  const paint = (state: 'idle' | 'hover' | 'press'): void => {
    g.clear();
    const dy = state === 'press' ? 1 : 0;
    if (filled) {
      // Two-band "gradient": lighter top, base bottom — amber (act) or rose
      // (destroy). Both filled so a destructive action never wears cancel grey.
      const top = state === 'hover' ? light : base;
      const bot = state === 'press' ? dark : base;
      g.fillStyle(UIK.shadow, 0.3);
      g.fillRoundedRect(1, 3, w, h, 8);
      g.fillStyle(bot, 1);
      g.fillRoundedRect(0, dy, w, h, 8);
      g.fillStyle(top, 1);
      g.fillRoundedRect(0, dy, w, Math.round(h * 0.55), { tl: 8, tr: 8, bl: 0, br: 0 });
      g.lineStyle(1, light, 0.5);
      g.strokeRoundedRect(0.5, dy + 0.5, w - 1, h - 1, 8);
    } else {
      // Secondary: ink plate, amber hairline — cancel / back / low-stakes.
      g.fillStyle(UIK.plate, state === 'hover' ? 0.98 : 0.9);
      g.fillRoundedRect(0, dy, w, h, 8);
      g.lineStyle(1, UIK.amber, state === 'hover' ? 0.9 : 0.55);
      g.strokeRoundedRect(0.5, dy + 0.5, w - 1, h - 1, 8);
    }
    txt.setY(h / 2 + dy);
  };
  paint('idle');

  c.setSize(w, h);
  c.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(0, 0, w, h),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  c.on('pointerover', () => paint('hover'));
  c.on('pointerout', () => paint('idle'));
  c.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    paint('press');
    opts.onClick();
  });
  c.on('pointerup', () => paint('hover'));
  return c;
}

/**
 * F4 — truncate a wrapped text with an ellipsis until it fits `maxLines`.
 * The blunt instrument that keeps captions inside their flow slot.
 */
export function kitClampLines(t: Phaser.GameObjects.Text, maxLines: number): void {
  if (t.getWrappedText().length <= maxLines) return;
  let s = t.text;
  while (s.length > 1 && t.getWrappedText().length > maxLines) {
    s = s.slice(0, -2).trimEnd();
    t.setText(`${s}…`);
  }
}

export interface TabRowItem {
  id: string;
  label: string;
  /** Accent the label (e.g. a completed Manifest page reads amber). */
  accent?: boolean;
}

export interface TabRowResult {
  /** Total height consumed — flow the content below from here. */
  height: number;
  /** Everything created, for dynamic-panel cleanup. */
  objects: Phaser.GameObjects.GameObject[];
}

const TAB_GAP = 14;
const TAB_ROW_H = 24;

/**
 * F4 — THE tab/chip row. The overflow rule for every tab row in the game,
 * in order: (1) shrink type one step (body → caption); (2) wrap onto a
 * second row; (3) page horizontally with ‹ › chevrons. A tab row never
 * clips and never escapes `maxW`. Returns the consumed height so callers
 * FLOW content beneath it instead of hard-coding a Y.
 */
export function kitTabRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: {
    x: number;
    y: number;
    maxW: number;
    items: readonly TabRowItem[];
    activeId: string;
    onPick(id: string): void;
    /** Paging window start (scroll fallback keeps it across refreshes). */
    pageStart?: number;
    onPageStart?(start: number): void;
  },
): TabRowResult {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const measure = (level: TypeLevel): number[] => {
    return opts.items.map((it) => {
      const probe = kitText(scene, 0, 0, it.label, level, { bold: true });
      const w = Math.ceil(probe.width);
      probe.destroy();
      return w;
    });
  };
  const totalW = (widths: number[]): number =>
    widths.reduce((a, w) => a + w, 0) + TAB_GAP * Math.max(0, widths.length - 1);

  // (1) shrink: body first, caption when the row would clip.
  let level: TypeLevel = 'body';
  let widths = measure(level);
  if (totalW(widths) > opts.maxW) {
    level = 'caption';
    widths = measure(level);
  }

  // (2) wrap: greedy fill up to two rows.
  const rows: number[][] = [[]];
  {
    let x = 0;
    widths.forEach((w, i) => {
      const row = rows[rows.length - 1] as number[];
      const need = (row.length > 0 ? TAB_GAP : 0) + w;
      if (x + need > opts.maxW && row.length > 0 && rows.length < 2) {
        rows.push([i]);
        x = w;
      } else {
        row.push(i);
        x += need;
      }
    });
  }

  // (3) scroll: two wrapped rows still clip → one paged row with chevrons.
  const overflowing = rows.some(
    (r) => totalW(r.map((i) => widths[i] as number)) > opts.maxW,
  );

  const drawTab = (i: number, tx: number, ty: number): number => {
    const it = opts.items[i] as TabRowItem;
    const on = it.id === opts.activeId;
    const w = widths[i] as number;
    if (on) {
      const bg = scene.add.graphics();
      bg.fillStyle(UIK.amber, 1);
      bg.fillRoundedRect(tx - 6, ty - 3, w + 12, TAB_ROW_H - 4, 6);
      container.add(bg);
      objects.push(bg);
    }
    const t = kitText(scene, tx, ty, it.label, level, {
      color: on ? PALETTE.ink : it.accent === true ? PALETTE.neonAmber : UI_TEXT_WARM,
      bold: on,
    });
    t.setInteractive({ useHandCursor: true });
    t.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      opts.onPick(it.id);
    });
    container.add(t);
    objects.push(t);
    return w;
  };

  if (!overflowing) {
    rows.forEach((row, r) => {
      let tx = opts.x;
      const ty = opts.y + r * TAB_ROW_H;
      for (const i of row) tx += drawTab(i, tx, ty) + TAB_GAP;
    });
    return { height: rows.length * TAB_ROW_H, objects };
  }

  // Paged single row: ‹ [window of tabs] › — the active tab is kept in view
  // by the caller via pageStart; chevrons step the window.
  const chevW = 18;
  const innerW = opts.maxW - chevW * 2 - TAB_GAP;
  const start = Math.min(opts.pageStart ?? 0, Math.max(0, opts.items.length - 1));
  // Window: greedy from `start` until innerW is spent.
  let end = start;
  {
    let x = 0;
    while (end < opts.items.length) {
      const need = (end > start ? TAB_GAP : 0) + (widths[end] as number);
      if (x + need > innerW && end > start) break;
      x += need;
      end++;
    }
  }
  const chev = (cx: number, glyph: string, enabled: boolean, step: number): void => {
    const t = kitText(scene, cx, opts.y, glyph, level, {
      color: enabled ? PALETTE.neonAmber : UI_TEXT_WARM,
      bold: true,
    });
    t.setAlpha(enabled ? 1 : 0.35);
    if (enabled) {
      t.setInteractive({ useHandCursor: true });
      t.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        opts.onPageStart?.(Math.max(0, start + step));
      });
    }
    container.add(t);
    objects.push(t);
  };
  chev(opts.x, '‹', start > 0, -1);
  let tx = opts.x + chevW + TAB_GAP / 2;
  for (let i = start; i < end; i++) tx += drawTab(i, tx, opts.y) + TAB_GAP;
  chev(opts.x + opts.maxW - chevW + 4, '›', end < opts.items.length, +1);
  return { height: TAB_ROW_H, objects };
}

/**
 * A HUD counter chip: a small pill plate with a leading glyph and a value.
 * Returns a Container at (x,y) with `.setValue(str)` for cheap live updates.
 */
export interface Chip extends Phaser.GameObjects.Container {
  setValue(str: string): void;
}

export function kitChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  value: string,
  opts: { glyphColor?: string } = {},
): Chip {
  const c = scene.add.container(x, y) as Chip;
  const g = scene.add.graphics();
  const gl = kitText(scene, SPACE.sm + 1, 0, glyph, 'body', {
    color: opts.glyphColor ?? PALETTE.neonAmber,
    bold: true,
  }).setOrigin(0, 0.5);
  const val = kitText(scene, 0, 0, value, 'body', { color: UI_TEXT_WARM, bold: true }).setOrigin(0, 0.5);
  c.add([g, gl, val]);

  const layout = (): void => {
    const gx = SPACE.sm + 1;
    gl.setX(gx);
    const vx = gx + Math.ceil(gl.width) + SPACE.xs + 2;
    val.setX(vx);
    const w = vx + Math.ceil(val.width) + SPACE.sm + 2;
    const h = 22;
    gl.setY(h / 2);
    val.setY(h / 2);
    g.clear();
    g.fillStyle(UIK.shadow, 0.28);
    g.fillRoundedRect(1, 2, w, h, h / 2);
    g.fillStyle(UIK.plate, 0.86);
    g.fillRoundedRect(0, 0, w, h, h / 2);
    g.lineStyle(1, UIK.border, 0.9);
    g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, h / 2);
    c.setSize(w, h);
    c.setData('kitClipRect', { ox: 0, oy: 0, w, h }); // F4 audit: opaque pill
  };
  layout();
  c.setValue = (str: string): void => {
    val.setText(str);
    layout();
  };
  return c;
}
