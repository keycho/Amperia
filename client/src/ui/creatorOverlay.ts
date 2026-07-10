import type Phaser from 'phaser';
import {
  ACCESSORIES,
  type Appearance,
  decodeAppearance,
  DEFAULT_APPEARANCE,
  encodeAppearance,
  HAIR_COLORS,
  HAIR_STYLES,
  JACKET_COLORS,
  SKIN_TONES,
  SPARK_NAME_RE,
} from '@shared/appearance';
import { intToHex, PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { bakeSparkAppearance } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';

/**
 * The character creator (I2) — first login (full: name + look) and
 * /wardrobe (limited: look only). DOM overlay in the login style; the live
 * preview draws the REAL baked sprite (same pipeline as the world) on a lit
 * pedestal. Appearance is presentation only — no stats anywhere near this.
 */

export interface CreatorHandle {
  setError(text: string): void;
  close(): void;
}

export interface CreatorOpts {
  scene: Phaser.Scene;
  mode: 'first' | 'wardrobe';
  currentCode: string;
  currentName: string;
  onConfirm(code: string, name: string | undefined): void;
  onCancel?: () => void;
}

const SWATCH = 22;

export function showCreatorOverlay(opts: CreatorOpts): CreatorHandle {
  const a: Appearance = { ...(decodeAppearance(opts.currentCode) ?? DEFAULT_APPEARANCE) };

  const root = document.createElement('div');
  root.id = 'amperia-creator';
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    `background:${PALETTE.duskSky}CC`,
    'z-index:11',
    'font-family:monospace',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    `background:${PALETTE.structureMid}`,
    `border:2px solid ${PALETTE.ink}`,
    'border-radius:14px',
    'padding:22px 24px',
    'display:flex',
    'gap:20px',
    'box-shadow:0 12px 40px rgba(0,0,0,0.35)',
  ].join(';');

  // ── live preview: the real baked sprite on a lit pedestal ──────────────
  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 330;
  canvas.style.cssText = `background:${PALETTE.ink};border-radius:10px;image-rendering:pixelated;`;
  const caption = document.createElement('div');
  caption.style.cssText = `color:${UI_TEXT_WARM};opacity:.7;font-size:11px;`;
  caption.textContent = 'as seen in the lanes';
  previewWrap.append(canvas, caption);

  const drawPreview = () => {
    const code = encodeAppearance(a);
    bakeSparkAppearance(opts.scene, code, { previewOnly: true });
    const baked = voxelSprite(`spark@${code}-sw`);
    const src = opts.scene.game.textures.get(baked.key).getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // Pedestal glow: layered warm pools under and behind the Spark.
    const glow = (r: number, alpha: number, cy: number) => {
      const g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, r);
      g.addColorStop(0, `rgba(255, 217, 160, ${alpha})`);
      g.addColorStop(1, 'rgba(255, 217, 160, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(W / 2 - r, cy - r, r * 2, r * 2);
    };
    glow(95, 0.16, H * 0.45);
    glow(60, 0.22, H * 0.78);
    // Pedestal disc.
    ctx.fillStyle = PALETTE.duskSky;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 30, 62, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.neonAmber;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // The Spark, nearest-neighbor upscaled to fit, feet on the pedestal.
    ctx.imageSmoothingEnabled = false;
    const s = Math.max(0.75, Math.min(2, (W - 24) / src.width, (H - 74) / src.height));
    const dw = src.width * s;
    const dh = src.height * s;
    ctx.drawImage(src, Math.round((W - dw) / 2), Math.round(H - 44 - dh + 14), dw, dh);
  };

  // ── controls ────────────────────────────────────────────────────────────
  const controls = document.createElement('div');
  controls.style.cssText = 'width:330px;display:flex;flex-direction:column;gap:9px;';

  const title = document.createElement('div');
  title.textContent = opts.mode === 'first' ? 'SHAPE YOUR SPARK' : 'THE WARDROBE';
  title.style.cssText = `color:${PALETTE.neonAmber};font-size:19px;font-weight:bold;letter-spacing:2px;`;
  const sub = document.createElement('div');
  sub.textContent =
    opts.mode === 'first'
      ? 'the city will know you by this'
      : 'a fresh look, same Spark';
  sub.style.cssText = `color:${UI_TEXT_WARM};opacity:.8;font-size:11px;margin-top:-6px;`;

  const msg = document.createElement('div');
  msg.style.cssText = `color:${PALETTE.neonRose};font-size:11px;min-height:14px;`;

  let nameInput: HTMLInputElement | null = null;
  if (opts.mode === 'first') {
    nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = opts.currentName;
    nameInput.maxLength = 16;
    nameInput.placeholder = 'Spark name';
    nameInput.style.cssText = [
      'padding:8px 10px',
      `background:${PALETTE.ink}`,
      `color:${UI_TEXT_WARM}`,
      `border:1px solid ${PALETTE.groundBase}`,
      'border-radius:8px',
      'font-family:monospace',
      'font-size:13px',
      'outline:none',
    ].join(';');
    nameInput.onkeydown = (e) => e.stopPropagation();
  }

  const rowLabel = (text: string) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `color:${UI_TEXT_WARM};font-size:11px;opacity:.85;margin-bottom:2px;`;
    return el;
  };

  type Refresh = () => void;
  const refreshers: Refresh[] = [];
  const refreshAll = () => {
    for (const r of refreshers) r();
    drawPreview();
  };

  /** A row of color swatch dots bound to a numeric appearance field. */
  const swatchRow = (label: string, colors: readonly number[], field: keyof Appearance) => {
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    const dots: HTMLButtonElement[] = [];
    colors.forEach((c, i) => {
      const dot = document.createElement('button');
      dot.style.cssText = [
        `width:${SWATCH}px`,
        `height:${SWATCH}px`,
        'border-radius:6px',
        `background:${intToHex(c)}`,
        'cursor:pointer',
        'padding:0',
      ].join(';');
      dot.onclick = () => {
        a[field] = i;
        refreshAll();
      };
      dots.push(dot);
      row.append(dot);
    });
    refreshers.push(() => {
      dots.forEach((d, i) => {
        d.style.border =
          a[field] === i ? `2px solid ${PALETTE.neonTeal}` : `2px solid ${PALETTE.ink}`;
      });
    });
    wrap.append(rowLabel(label), row);
    return wrap;
  };

  /** A row of labeled chips bound to a numeric appearance field. */
  const chipRow = (
    label: string,
    items: readonly { label: string }[],
    field: keyof Appearance,
  ) => {
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';
    const chips: HTMLButtonElement[] = [];
    items.forEach((item, i) => {
      const chip = document.createElement('button');
      chip.textContent = item.label;
      chip.style.cssText = [
        'padding:4px 8px',
        'border-radius:7px',
        'font-family:monospace',
        'font-size:11px',
        'cursor:pointer',
      ].join(';');
      chip.onclick = () => {
        a[field] = i;
        refreshAll();
      };
      chips.push(chip);
      row.append(chip);
    });
    refreshers.push(() => {
      chips.forEach((c, i) => {
        const on = a[field] === i;
        c.style.background = on ? PALETTE.neonAmber : PALETTE.ink;
        c.style.color = on ? PALETTE.ink : UI_TEXT_WARM;
        c.style.border = `1px solid ${on ? PALETTE.neonAmber : PALETTE.groundBase}`;
      });
    });
    wrap.append(rowLabel(label), row);
    return wrap;
  };

  const button = (label: string, primary: boolean) => {
    const el = document.createElement('button');
    el.textContent = label;
    el.style.cssText = [
      'flex:1',
      'padding:9px',
      `background:${primary ? PALETTE.neonAmber : PALETTE.ink}`,
      `color:${primary ? PALETTE.ink : UI_TEXT_WARM}`,
      'border:none',
      'border-radius:8px',
      'font-family:monospace',
      'font-size:13px',
      'font-weight:bold',
      'cursor:pointer',
    ].join(';');
    return el;
  };

  const randomBtn = button('Randomize', false);
  randomBtn.onclick = () => {
    a.skin = Math.floor(Math.random() * SKIN_TONES.length);
    a.hair = Math.floor(Math.random() * HAIR_STYLES.length);
    a.hairColor = Math.floor(Math.random() * HAIR_COLORS.length);
    a.jacket = Math.floor(Math.random() * JACKET_COLORS.length);
    a.accessory = Math.floor(Math.random() * ACCESSORIES.length);
    refreshAll();
  };
  const confirmBtn = button(opts.mode === 'first' ? 'Step into the city' : 'Wear it', true);
  confirmBtn.onclick = () => {
    let name: string | undefined;
    if (nameInput !== null) {
      const wanted = nameInput.value.trim();
      if (wanted !== opts.currentName) {
        if (!SPARK_NAME_RE.test(wanted)) {
          msg.textContent = 'Names are 3-16 letters, digits, spaces, - or _.';
          return;
        }
        name = wanted;
      }
    }
    confirmBtn.disabled = true;
    randomBtn.disabled = true;
    msg.textContent = '';
    opts.onConfirm(encodeAppearance(a), name);
    // Re-enable after a beat in case the server bounces it.
    window.setTimeout(() => {
      confirmBtn.disabled = false;
      randomBtn.disabled = false;
    }, 1500);
  };

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
  buttonRow.append(randomBtn, confirmBtn);

  controls.append(title, sub, msg);
  if (nameInput !== null) controls.append(nameInput);
  controls.append(
    swatchRow('Skin', SKIN_TONES, 'skin'),
    chipRow('Hair', HAIR_STYLES, 'hair'),
    swatchRow('Hair color', HAIR_COLORS, 'hairColor'),
    swatchRow('Jacket', JACKET_COLORS, 'jacket'),
    chipRow('Flair', ACCESSORIES, 'accessory'),
    buttonRow,
  );

  if (opts.mode === 'wardrobe') {
    const closeBtn = button('Keep the old look', false);
    closeBtn.onclick = () => {
      root.remove();
      opts.onCancel?.();
    };
    controls.append(closeBtn);
  }

  panel.append(previewWrap, controls);
  root.append(panel);
  document.body.append(root);
  refreshAll();

  return {
    setError(text: string): void {
      msg.textContent = text;
      confirmBtn.disabled = false;
      randomBtn.disabled = false;
    },
    close(): void {
      root.remove();
    },
  };
}
