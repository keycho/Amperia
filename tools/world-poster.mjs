/**
 * LAUNCH POSTER RIG v3 (G6) — the whole city as one image.
 *
 * Captures each district with a PURE-BLACK void (skyline, film grain,
 * vignette, and every screen-fixed overlay hidden; camera painted black;
 * the camera crew's own Spark removed from frame; edge-spilling cast
 * shadows dimmed), then flood-fills the void from the borders to cut
 * each island to its true silhouette + deck rim. Composites a classic
 * MMO world-map diamond on true black: the Filament centered and ~1.3x
 * the rest, Stacks upper-right, Terrarium lower-right, Tangle lower-left,
 * depth-ordered so nearer decks paint in front. Tram lines run gate to
 * gate with catenary sag and a lit dot at every gate; each island floats
 * on a subtle under-glow in its district hue; district names sit in the
 * void in letterspaced caps. Outputs:
 *   docs/marketing/world-poster.png    4096x2304 (the launch image)
 *   docs/marketing/world-banner-x.png  1500x500 (X banner crop)
 *   docs/marketing/world-square.png    2048x2048 (1:1 letterboxed)
 * Dev-only assumptions match marketing-shot.mjs (local :2567/:5173,
 * postgres via su, Chromium at /opt/pw-browsers/chromium).
 *
 * Usage: node tools/world-poster.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const HTTP = 'http://localhost:2567';
const WEB = 'http://localhost:5173';
const SCRATCH = process.env.POSTER_TMP ?? '/tmp/amperia-poster';
const OUT = '/home/user/Amperia/docs/marketing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) => {
  writeFileSync('/tmp/lp.sql', sql);
  return execSync('chmod 644 /tmp/lp.sql && su postgres -c "psql amperia -f /tmp/lp.sql"', { encoding: 'utf8' });
};

mkdirSync(SCRATCH, { recursive: true });
const r = await fetch(`${HTTP}/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const a = await r.json();

// ── 1. Captures: pure-black void, nothing screen-fixed, no own Spark ────
// CLARITY: ZOOM must be an INTEGER — fractional camera zoom resamples
// every texel unevenly, and the poster reads as mush at 100%.
const CAP_W = 3200, CAP_H = 2100, ZOOM = 1;
const DISTRICTS = ['filament', 'stacks', 'terrarium', 'tangle'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: CAP_W, height: CAP_H } });
let first = true;
for (const d of DISTRICTS) {
  psql(`UPDATE "Character" SET district='${d}', "tileX"=20, "tileY"=20 WHERE "sparkName"='${a.sparkName}';`);
  await page.addInitScript(([t, dd]) => { localStorage.setItem('amperia.token', t); localStorage.setItem('amperia.district', dd); }, [a.token, d]);
  await page.goto(WEB, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, { timeout: 90000 });
  if (first) {
    const creator = await page.$('#amperia-creator');
    if (creator) {
      await page.evaluate(() => { [...document.getElementById('amperia-creator').querySelectorAll('button')].find((b) => b.textContent === 'Step into the city')?.click(); });
      await sleep(1200);
    }
    first = false;
  }
  await sleep(2800);
  await page.evaluate(([z]) => {
    const scene = window.__amperia.game.scene.getScene('world');
    // Pure-black void: kill the skyline, every screen-fixed overlay
    // (film grain, vignette, washes), and paint the camera black.
    scene.children.list.forEach((o) => {
      if (o.texture?.key === 'tex-skyline') o.setVisible(false);
      if (o.scrollFactorX === 0 && o.scrollFactorY === 0 && o.setVisible) o.setVisible(false);
    });
    scene.cameras.main.setBackgroundColor('#000000');
    // Cast shadows spill past the deck into the void — dim them.
    scene.children.list
      .filter((o) => o.texture?.key?.endsWith('-shadow'))
      .forEach((o) => o.setAlpha(o.alpha * 0.4));
    // The camera crew stays out of frame (no tinted Sparks anywhere).
    const me = scene.sparks?.get(scene.room?.sessionId);
    me?.image?.setVisible(false);
    window.__amperia.photo.enter({ tile: { x: 20, y: 20 }, zoom: z });
  }, [ZOOM]);
  await sleep(1400);
  await page.screenshot({ path: `${SCRATCH}/launch-${d}.png` });
  console.log(`launch-${d}.png ✓`);
  await page.evaluate(() => window.__amperia.photo.exit());
  await page.goto('about:blank');
  await sleep(1500);
}

// ── 2. Composite: classic world-map diamond on TRUE black ───────────────
// Gate/Dynamo pixel positions inside a capture (camera on tile 20,20).
const capPx = (tx, ty) => [
  CAP_W / 2 + (tx - ty) * 32 * ZOOM,
  CAP_H / 2 + ((tx + ty) * 16 - 640) * ZOOM,
];
const GATE_SE = capPx(37, 20.5); // filament's gate (x=36,w=2,h=5)
const GATE_NW = capPx(2, 20.5);  // everyone else's gate (x=1)
const DYNAMO = capPx(19, 18);

const M_W = 4096, M_H = 2304;
// The heart in the CENTER and largest; Stacks upper-right, Terrarium
// lower-right, Tangle lower-left — a rough diamond. Draw order = depth
// (nearer islands paint in front).
// CLARITY: composite scales are integer RATIOS only — the Filament 1:1,
// the side islands an exact 1:2 decimation (imageSmoothing off). Any
// fractional resize (the old 0.72/0.55) smeared the texels back to mush.
const ISLANDS = [
  { d: 'stacks', cx: 3080, cy: 560, s: 0.5, gate: GATE_NW, hue: '#B266FF', label: 'THE STACKS', lx: 3520, ly: 240 },
  { d: 'filament', cx: 2048, cy: 1150, s: 1, gate: GATE_SE, hue: '#FFB266', label: 'THE FILAMENT', lx: 1210, ly: 620 },
  { d: 'tangle', cx: 940, cy: 1760, s: 0.5, gate: GATE_NW, hue: '#C97C52', label: 'THE TANGLE', lx: 680, ly: 2225 },
  { d: 'terrarium', cx: 3160, cy: 1780, s: 0.5, gate: GATE_NW, hue: '#7BC59A', label: 'THE TERRARIUM', lx: 3380, ly: 2225 },
];
const isl = (name) => ISLANDS.find((i) => i.d === name);
const gatePos = (i) => [
  i.cx + (i.gate[0] - CAP_W / 2) * i.s,
  i.cy + (i.gate[1] - CAP_H / 2) * i.s,
];
// The tram line's stops, in line order: Filament → Stacks → Terrarium → Tangle.
const LINE = ['filament', 'stacks', 'terrarium', 'tangle'].map((d) => gatePos(isl(d)));
const dynIsl = isl('filament');
const dyn = [
  dynIsl.cx + (DYNAMO[0] - CAP_W / 2) * dynIsl.s,
  dynIsl.cy + (DYNAMO[1] - CAP_H / 2) * dynIsl.s,
];
const b64 = (p) => readFileSync(p).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body { width: ${M_W}px; height: ${M_H}px; background: #000; position: relative;
         overflow: hidden; font-family: 'DejaVu Sans Mono', monospace; }
  canvas { position: absolute; left: 0; top: 0; }
  .lbl { position: absolute; transform: translateX(-50%); color: #D9C6A8; opacity: 0.85;
         font-size: 26px; letter-spacing: 9px; text-indent: 9px; white-space: nowrap;
         text-shadow: 0 0 12px rgba(255,178,102,0.35), 0 1px 4px #000; }
  .mark { position: absolute; left: 50%; bottom: 60px; transform: translateX(-50%); text-align: center; }
  .mark h1 { color: #FFD9A0; font-size: 108px; letter-spacing: 46px; text-indent: 46px;
             text-shadow: 0 0 40px rgba(255,178,102,0.9), 0 0 90px rgba(255,178,102,0.4); }
  .mark p { color: #B266FF; font-size: 27px; letter-spacing: 11px; text-indent: 11px; margin-top: 10px;
            text-shadow: 0 0 16px rgba(178,102,255,0.8); }
</style></head><body>
  <canvas id="c" width="${M_W}" height="${M_H}"></canvas>
  ${ISLANDS.map((i) => `<div class="lbl" style="left:${i.lx}px; top:${i.ly}px;">${i.label}</div>`).join('')}
  <div class="mark"><h1>AMPERIA</h1><p>ONE CITY IN THE DARK</p></div>
  <script>
  const ISLANDS = ${JSON.stringify(ISLANDS.map((i) => ({ ...i, gate: gatePos(i) })))};
  const LINE = ${JSON.stringify(LINE)};
  const DYN = ${JSON.stringify(dyn)};
  const CAP_W = ${CAP_W}, CAP_H = ${CAP_H};
  const SRC = { ${DISTRICTS.map((d) => `${d}: 'data:image/png;base64,${b64(`${SCRATCH}/launch-${d}.png`)}'`).join(', ')} };

  const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });

  // Silhouette cutout: flood the void from the borders through near-black
  // pixels and knock it to alpha 0 — the island keeps its deck, rim, and
  // glow bleed; interior darks are unreachable across the lit deck.
  function cutout(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data, W = c.width, H = c.height;
    const THR = 9;
    const dark = (i) => d[i] < THR && d[i + 1] < THR && d[i + 2] < THR;
    const visited = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length > 0) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const i = p * 4;
      if (!dark(i)) continue;
      d[i + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  async function build() {
    const ctx = document.getElementById('c').getContext('2d');
    // CLARITY: nearest-neighbor only — island scales are 1:1 or exact 1:2.
    ctx.imageSmoothingEnabled = false;
    // Under-glows: each island floats on the black in its district hue.
    for (const i of ISLANDS) {
      const g = ctx.createRadialGradient(i.cx, i.cy + 60, 0, i.cx, i.cy + 60, 1050 * i.s);
      g.addColorStop(0, i.hue + '26');
      g.addColorStop(0.55, i.hue + '12');
      g.addColorStop(1, i.hue + '00');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(i.cx, i.cy + 60);
      ctx.scale(1, 0.55);
      ctx.translate(-i.cx, -(i.cy + 60));
      ctx.beginPath();
      ctx.arc(i.cx, i.cy + 60, 1050 * i.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // The Dynamo's halo — the city's bright heart reads at poster scale.
    const hg = ctx.createRadialGradient(DYN[0], DYN[1], 0, DYN[0], DYN[1], 560);
    hg.addColorStop(0, 'rgba(255,178,102,0.30)');
    hg.addColorStop(0.4, 'rgba(255,178,102,0.10)');
    hg.addColorStop(1, 'rgba(255,178,102,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(DYN[0] - 560, DYN[1] - 560, 1120, 1120);
    // Tram lines: gentle catenary sag between the actual gates.
    const seg = (a, b) => {
      const mx = (a[0] + b[0]) / 2, dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const my = (a[1] + b[1]) / 2 + Math.min(150, dist * 0.11);
      for (const [w, al, col] of [[20, 0.13, '#FFB266'], [6, 0.5, '#FFB266'], [2.5, 0.95, '#FFD9A0']]) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = al;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(mx, my, b[0], b[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    for (let k = 0; k < LINE.length - 1; k++) seg(LINE[k], LINE[k + 1]);
    // Islands, back to front, cut to their true silhouettes.
    for (const i of ISLANDS) {
      const cut = cutout(await load(SRC[i.d]));
      const w = CAP_W * i.s, h = CAP_H * i.s;
      ctx.drawImage(cut, i.cx - w / 2, i.cy - h / 2, w, h);
    }
    // Lit gate-dots where each line meets an island.
    for (const [gx, gy] of LINE) {
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 22);
      gg.addColorStop(0, 'rgba(255,217,160,0.9)');
      gg.addColorStop(0.4, 'rgba(255,178,102,0.45)');
      gg.addColorStop(1, 'rgba(255,178,102,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - 22, gy - 22, 44, 44);
      ctx.fillStyle = '#FFD9A0';
      ctx.beginPath();
      ctx.arc(gx, gy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    window.__done = true;
  }
  build();
  </script>
</body></html>`;
writeFileSync(`${SCRATCH}/launch-poster.html`, html);
mkdirSync(OUT, { recursive: true });
const pp = await browser.newPage({ viewport: { width: M_W, height: M_H } });
await pp.goto(`file://${SCRATCH}/launch-poster.html`);
await pp.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
await sleep(600);
await pp.screenshot({ path: `${OUT}/world-poster.png` });
console.log('world-poster.png (4096×2304) ✓');

// ── 3. Crops: X banner 1500×500 + square 1:1 ────────────────────────────
// CLARITY: every scale step integer — the poster halves EXACTLY (2:1,
// pixelated) and the banner is a 1:1 crop out of that half-size image.
const master = b64(`${OUT}/world-poster.png`);
const HALF_W = M_W / 2; // 2048
const HALF_H = M_H / 2; // 1152
const bandTop = Math.max(0, Math.min(HALF_H - 500, Math.round(dyn[1] / 2) - 250));
const bandLeft = Math.max(0, Math.min(HALF_W - 1500, Math.round(dyn[0] / 2) - 750));
writeFileSync(`${SCRATCH}/banner.html`, `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; } body { width:1500px; height:500px; overflow:hidden; background:#000; position:relative; }
  img { position:absolute; left:${-bandLeft}px; top:${-bandTop}px; width:${HALF_W}px; image-rendering:pixelated; }
</style></head><body><img src="data:image/png;base64,${master}"></body></html>`);
const bp = await browser.newPage({ viewport: { width: 1500, height: 500 } });
await bp.goto(`file://${SCRATCH}/banner.html`);
await sleep(900);
await bp.screenshot({ path: `${OUT}/world-banner-x.png` });
console.log('world-banner-x.png (1500×500) ✓');

// Square: the full panorama letterboxed on black — an exact 2:1 half.
const sqTop = Math.round((2048 - HALF_H) / 2);
writeFileSync(`${SCRATCH}/square.html`, `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; } body { width:2048px; height:2048px; overflow:hidden; background:#000; position:relative; }
  img { position:absolute; left:0; top:${sqTop}px; width:2048px; image-rendering:pixelated; }
</style></head><body><img src="data:image/png;base64,${master}"></body></html>`);
const sp = await browser.newPage({ viewport: { width: 2048, height: 2048 } });
await sp.goto(`file://${SCRATCH}/square.html`);
await sleep(900);
await sp.screenshot({ path: `${OUT}/world-square.png` });
console.log('world-square.png (2048×2048) ✓');
await browser.close();
process.exit(0);
