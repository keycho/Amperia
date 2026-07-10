/**
 * LAUNCH POSTER RIG (G6) — the whole city as one image.
 *
 * Captures each district whole (photo mode, true-black void, skyline off,
 * cast shadows dimmed so nothing floats), then composites the four decks
 * as screen-blended islands on a 4K black canvas: the tram line strung
 * gate to gate across the void, the Dynamo glowing as the city's heart,
 * the G6b rims making every deck read as a structure — an island of
 * light in the dark. Outputs:
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

// ── 1. Capture each district whole, high-res, void-clean ────────────────
const CAP_W = 3200, CAP_H = 2100, ZOOM = 1.15;
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
    // The skyline backdrop belongs to gameplay, not the void poster — and
    // the void itself goes TRUE black so islands screen-blend seamlessly.
    scene.children.list.filter((o) => o.texture?.key === 'tex-skyline').forEach((o) => o.setVisible(false));
    scene.cameras.main.setBackgroundColor('#000000');
    // Cast shadows spill past the deck edge and read as grey slabs in the
    // void — dim them for the poster (in-deck grounding survives).
    scene.children.list
      .filter((o) => o.texture?.key?.endsWith('-shadow'))
      .forEach((o) => o.setAlpha(o.alpha * 0.4));
    window.__amperia.photo.enter({ tile: { x: 20, y: 20 }, zoom: z });
  }, [ZOOM]);
  await sleep(1400);
  await page.screenshot({ path: `${SCRATCH}/launch-${d}.png` });
  console.log(`launch-${d}.png ✓`);
  await page.evaluate(() => window.__amperia.photo.exit());
  await page.goto('about:blank');
  await sleep(1500);
}

// ── 2. Composite: one city in the black void, 4K ─────────────────────────
// Gate pixel positions inside a capture (camera on tile 20,20 center):
// world(tx,ty) = ((tx-ty)*32, (tx+ty)*16); capture px = center + delta*zoom.
const capPx = (tx, ty) => [
  CAP_W / 2 + ((tx - ty) * 32 - 0) * ZOOM,
  CAP_H / 2 + ((tx + ty) * 16 - 640) * ZOOM,
];
const GATE_SE = capPx(37, 20.5);  // filament's gate (x=36,w=2,h=5)
const GATE_NW = capPx(2, 20.5);   // everyone else's gate (x=1)
const DYNAMO = capPx(19, 18);

// Island placement on the 4096×2304 master (tram order F→S→T→Tangle).
const M_W = 4096, M_H = 2304;
const ISLANDS = [
  { d: 'filament', cx: 1250, cy: 1180, s: 0.62, gate: GATE_SE },
  { d: 'stacks', cx: 2700, cy: 640, s: 0.44, gate: GATE_NW },
  { d: 'terrarium', cx: 3300, cy: 1450, s: 0.44, gate: GATE_NW },
  { d: 'tangle', cx: 2250, cy: 1900, s: 0.42, gate: GATE_NW },
];
const gatePos = (i) => [
  i.cx + (i.gate[0] - CAP_W / 2) * i.s,
  i.cy + (i.gate[1] - CAP_H / 2) * i.s,
];
const stops = ISLANDS.map(gatePos);
const dyn = [
  ISLANDS[0].cx + (DYNAMO[0] - CAP_W / 2) * ISLANDS[0].s,
  ISLANDS[0].cy + (DYNAMO[1] - CAP_H / 2) * ISLANDS[0].s,
];
const b64 = (p) => readFileSync(p).toString('base64');
const rail = stops.map(([x, y]) => `${x},${y}`).join(' ');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body { width: ${M_W}px; height: ${M_H}px; background: #030208; position: relative;
         overflow: hidden; font-family: 'DejaVu Sans Mono', monospace; }
  .isl { position: absolute; transform-origin: center center; mix-blend-mode: screen; }
  .heart { position: absolute; width: 1100px; height: 1100px; border-radius: 50%;
           background: radial-gradient(circle, rgba(255,178,102,0.30) 0%, rgba(255,178,102,0.10) 40%, transparent 70%);
           mix-blend-mode: screen; }
  svg { position: absolute; left: 0; top: 0; }
  .mark { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); text-align: center; }
  .mark h1 { color: #FFD9A0; font-size: 64px; letter-spacing: 30px; text-indent: 30px;
             text-shadow: 0 0 26px rgba(255,178,102,0.85); }
  .mark p { color: #B266FF; font-size: 20px; letter-spacing: 8px; margin-top: 6px;
            text-shadow: 0 0 14px rgba(178,102,255,0.8); }
</style></head><body>
  <svg width="${M_W}" height="${M_H}">
    <polyline points="${rail}" fill="none" stroke="#FFB266" stroke-opacity="0.16" stroke-width="20" stroke-linejoin="round"/>
    <polyline points="${rail}" fill="none" stroke="#FFB266" stroke-opacity="0.55" stroke-width="5" stroke-linejoin="round"/>
    <polyline points="${rail}" fill="none" stroke="#1E1930" stroke-opacity="0.9" stroke-width="2.5"
              stroke-dasharray="4 14" stroke-linejoin="round"/>
  </svg>
  <div class="heart" style="left:${dyn[0] - 550}px; top:${dyn[1] - 550}px;"></div>
  ${ISLANDS.map((i) => `
    <img class="isl" src="data:image/png;base64,${b64(`${SCRATCH}/launch-${i.d}.png`)}"
         style="left:${i.cx - CAP_W / 2}px; top:${i.cy - CAP_H / 2}px; transform: scale(${i.s});">
  `).join('')}
  <div class="mark"><h1>AMPERIA</h1><p>ONE CITY IN THE DARK</p></div>
</body></html>`;
writeFileSync(`${SCRATCH}/launch-poster.html`, html);
mkdirSync(OUT, { recursive: true });
const pp = await browser.newPage({ viewport: { width: M_W, height: M_H } });
await pp.goto(`file://${SCRATCH}/launch-poster.html`);
await sleep(1800);
await pp.screenshot({ path: `${OUT}/world-poster.png` });
console.log('world-poster.png (4096×2304) ✓');

// ── 3. Crops: X banner 1500×500 + square 1:1 ────────────────────────────
const master = b64(`${OUT}/world-poster.png`);
const bannerScale = 1500 / M_W;
const bandTop = Math.max(0, Math.min(M_H * bannerScale - 500, dyn[1] * bannerScale - 250));
writeFileSync(`${SCRATCH}/banner.html`, `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; } body { width:1500px; height:500px; overflow:hidden; background:#07050E; position:relative; }
  img { position:absolute; left:0; top:${-bandTop}px; width:1500px; }
</style></head><body><img src="data:image/png;base64,${master}"></body></html>`);
const bp = await browser.newPage({ viewport: { width: 1500, height: 500 } });
await bp.goto(`file://${SCRATCH}/banner.html`);
await sleep(900);
await bp.screenshot({ path: `${OUT}/world-banner-x.png` });
console.log('world-banner-x.png (1500×500) ✓');

// Square: the full panorama letterboxed on black — clean for 1:1 posts.
const sqScale = 2048 / M_W;
const sqTop = Math.round((2048 - M_H * sqScale) / 2);
writeFileSync(`${SCRATCH}/square.html`, `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; } body { width:2048px; height:2048px; overflow:hidden; background:#07050E; position:relative; }
  img { position:absolute; left:0; top:${sqTop}px; width:2048px; }
</style></head><body><img src="data:image/png;base64,${master}"></body></html>`);
const sp = await browser.newPage({ viewport: { width: 2048, height: 2048 } });
await sp.goto(`file://${SCRATCH}/square.html`);
await sleep(900);
await sp.screenshot({ path: `${OUT}/world-square.png` });
console.log('world-square.png (2048×2048) ✓');
await browser.close();
process.exit(0);
