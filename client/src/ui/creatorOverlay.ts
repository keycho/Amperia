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
import {
  COSMETIC_SLOTS,
  decodeEquipped,
  encodeEquipped,
  type EquippedMap,
  ownedForSlot,
} from '@shared/cosmetics';
import { intToHex, PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { sound } from '../audio/sound';
import { bakeSparkAppearance, equipKey } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';
import { swallowGameInput } from './domGuard';

/** U2d: roll-a-name — seeds in the city's voice. */
const NAME_HEADS = ['Weld', 'Volt', 'Flux', 'Brass', 'Coil', 'Ember', 'Socket', 'Dyna', 'Rivet', 'Amp'];
const NAME_TAILS = ['a', 'ka', 'ric', 'low', 'mira', 'tin', 'na', 'wick', 'ette', 'bolt', 'sy', 'ler'];
function rollName(): string {
  const head = NAME_HEADS[Math.floor(Math.random() * NAME_HEADS.length)] as string;
  const tail = NAME_TAILS[Math.floor(Math.random() * NAME_TAILS.length)] as string;
  const n = Math.random() < 0.35 ? `-${Math.floor(10 + Math.random() * 90)}` : '';
  return `${head}${tail}${n}`;
}

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
  /** Owned cosmetics + worn wire (wardrobe mode shows the slot rows). */
  owned?: string[];
  currentEquipped?: string;
  onConfirm(code: string, name: string | undefined): void;
  onWardrobe?: (equippedWire: string) => void;
  onCancel?: () => void;
}

const SWATCH = 22;

export function showCreatorOverlay(opts: CreatorOpts): CreatorHandle {
  const a: Appearance = { ...(decodeAppearance(opts.currentCode) ?? DEFAULT_APPEARANCE) };
  const owned = opts.owned ?? [];
  const eq: EquippedMap = decodeEquipped(opts.currentEquipped ?? '', owned);

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
  swallowGameInput(root);

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
  // U2a: the pedestal faces the camera (mascot angle) and can rotate.
  const FACINGS = ['sw', 'se', 'ne', 'nw'] as const;
  let facing = 0;
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 330;
  canvas.style.cssText = `background:${PALETTE.ink};border-radius:10px;image-rendering:pixelated;`;
  const caption = document.createElement('div');
  caption.style.cssText = `color:${UI_TEXT_WARM};opacity:.7;font-size:11px;`;
  caption.textContent = 'as seen in the lanes';
  const rotateBtn = document.createElement('button');
  rotateBtn.textContent = '↻ turn';
  rotateBtn.style.cssText = [
    'padding:5px 12px',
    `background:${PALETTE.ink}`,
    `color:${UI_TEXT_WARM}`,
    `border:1px solid ${PALETTE.groundBase}`,
    'border-radius:7px',
    'font-family:monospace',
    'font-size:11px',
    'cursor:pointer',
  ].join(';');
  rotateBtn.onclick = () => {
    facing = (facing + 1) % FACINGS.length;
    sound.uiClick();
    drawPreview();
  };
  previewWrap.append(canvas, rotateBtn, caption);

  const drawPreview = () => {
    const code = encodeAppearance(a);
    const wire = encodeEquipped(eq);
    bakeSparkAppearance(opts.scene, code, { previewOnly: true, equipped: wire });
    const baked = voxelSprite(`spark@${code}#${equipKey(eq)}-${FACINGS[facing]}`);
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
  let nameRow: HTMLDivElement | null = null;
  let nameHint: HTMLDivElement | null = null;
  if (opts.mode === 'first') {
    nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
    nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = opts.currentName;
    nameInput.maxLength = 16;
    nameInput.placeholder = 'Spark name';
    nameInput.style.cssText = [
      'flex:1',
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
    const rollBtn = document.createElement('button');
    rollBtn.textContent = '⚂ roll';
    rollBtn.title = 'roll a name';
    rollBtn.style.cssText = [
      'padding:8px 10px',
      `background:${PALETTE.ink}`,
      `color:${UI_TEXT_WARM}`,
      `border:1px solid ${PALETTE.groundBase}`,
      'border-radius:8px',
      'font-family:monospace',
      'font-size:12px',
      'cursor:pointer',
    ].join(';');
    rollBtn.onclick = () => {
      if (nameInput === null) return;
      nameInput.value = rollName();
      sound.uiClick();
      nameInput.dispatchEvent(new Event('input'));
    };
    nameRow.append(nameInput, rollBtn);
    // U2d: live availability — debounced check against the city's records.
    nameHint = document.createElement('div');
    nameHint.style.cssText = `font-size:10px;min-height:12px;color:${UI_TEXT_WARM};opacity:.75;`;
    let checkTimer = 0;
    let checkSeq = 0;
    nameInput.addEventListener('input', () => {
      if (nameInput === null || nameHint === null) return;
      const wanted = nameInput.value.trim();
      window.clearTimeout(checkTimer);
      if (wanted === opts.currentName || wanted === '') {
        nameHint.textContent = '';
        return;
      }
      if (!SPARK_NAME_RE.test(wanted)) {
        nameHint.textContent = '3–16 letters, digits, spaces, - or _';
        nameHint.style.color = PALETTE.neonRose;
        return;
      }
      nameHint.textContent = 'checking…';
      nameHint.style.color = UI_TEXT_WARM;
      const seq = (checkSeq += 1);
      checkTimer = window.setTimeout(() => {
        void fetch(
          `${location.protocol}//${location.hostname}:2567/auth/name-check?name=${encodeURIComponent(wanted)}`,
        )
          .then((r2) => r2.json())
          .then((res: { available?: boolean }) => {
            if (seq !== checkSeq || nameHint === null) return;
            nameHint.textContent = res.available === true ? 'free — it suits you' : 'taken already';
            nameHint.style.color = res.available === true ? PALETTE.neonTeal : PALETTE.neonRose;
          })
          .catch(() => undefined);
      }, 350);
    });
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
  // U2c: slot-machine shuffle — the reels settle left to right over ~1s.
  let spinning = false;
  randomBtn.onclick = () => {
    if (spinning) return;
    spinning = true;
    const order: Array<keyof Appearance> = ['skin', 'hair', 'hairColor', 'jacket', 'accessory'];
    const sizes: Record<keyof Appearance, number> = {
      skin: SKIN_TONES.length,
      hair: HAIR_STYLES.length,
      hairColor: HAIR_COLORS.length,
      jacket: JACKET_COLORS.length,
      accessory: ACCESSORIES.length,
    };
    const TICKS = 13;
    let tick = 0;
    const spin = window.setInterval(() => {
      tick += 1;
      const locked = Math.max(0, Math.floor((tick - 4) / 2));
      for (let i = locked; i < order.length; i++) {
        const f = order[i] as keyof Appearance;
        a[f] = Math.floor(Math.random() * sizes[f]);
      }
      sound.uiClick();
      refreshAll();
      if (tick >= TICKS) {
        window.clearInterval(spin);
        spinning = false;
      }
    }, 75);
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
    if (opts.mode === 'wardrobe') opts.onWardrobe?.(encodeEquipped(eq));
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

  /** Wardrobe rows (anchor slots, §10.2): None + every OWNED cosmetic. */
  const slotRow = (slot: (typeof COSMETIC_SLOTS)[number], label: string) => {
    const options = ownedForSlot(owned, slot);
    if (options.length === 0) return null;
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';
    const chips: Array<{ el: HTMLButtonElement; id: string | undefined }> = [];
    const mkChip = (text: string, id: string | undefined) => {
      const chip = document.createElement('button');
      chip.textContent = text;
      chip.style.cssText =
        'padding:4px 8px;border-radius:7px;font-family:monospace;font-size:11px;cursor:pointer;';
      chip.onclick = () => {
        if (id === undefined) delete eq[slot];
        else eq[slot] = id;
        refreshAll();
      };
      chips.push({ el: chip, id });
      row.append(chip);
    };
    mkChip('None', undefined);
    for (const def of options) mkChip(def.label, def.id);
    refreshers.push(() => {
      for (const { el, id } of chips) {
        const on = eq[slot] === id || (id === undefined && eq[slot] === undefined);
        el.style.background = on ? PALETTE.neonTeal : PALETTE.ink;
        el.style.color = on ? PALETTE.ink : UI_TEXT_WARM;
        el.style.border = `1px solid ${on ? PALETTE.neonTeal : PALETTE.groundBase}`;
      }
    });
    wrap.append(rowLabel(label), row);
    return wrap;
  };

  controls.append(title, sub, msg);
  if (nameRow !== null) controls.append(nameRow);
  if (nameHint !== null) controls.append(nameHint);
  controls.append(
    swatchRow('Skin', SKIN_TONES, 'skin'),
    chipRow('Hair', HAIR_STYLES, 'hair'),
    swatchRow('Hair color', HAIR_COLORS, 'hairColor'),
    swatchRow('Jacket', JACKET_COLORS, 'jacket'),
    chipRow('Flair', ACCESSORIES, 'accessory'),
  );
  if (opts.mode === 'wardrobe') {
    const slotLabels: Array<[(typeof COSMETIC_SLOTS)[number], string]> = [
      ['head', 'Worn · head'],
      ['back', 'Worn · back'],
      ['jacket', 'Worn · jacket'],
      ['tool', 'Worn · tool shine'],
      ['trail', 'Worn · trail'],
      ['nameGlow', 'Worn · name glow'],
    ];
    let any = false;
    for (const [slot, label] of slotLabels) {
      const row = slotRow(slot, label);
      if (row !== null) {
        controls.append(row);
        any = true;
      }
    }
    if (!any) {
      const empty = document.createElement('div');
      empty.textContent = 'The wardrobe is bare — the city rewards its own.';
      empty.style.cssText = `color:${UI_TEXT_WARM};opacity:.6;font-size:11px;`;
      controls.append(empty);
    }
  }
  controls.append(buttonRow);

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
