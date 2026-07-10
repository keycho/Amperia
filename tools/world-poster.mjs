/**
 * WORLD POSTER RIG (D4b) — "four quarters, one city in the dark".
 *
 * Shoots one flattering wide angle per district through the client's
 * photo mode (window.__amperia.photo), then composites a 2×2 poster with
 * the wordmark band in a second headless page. Same dev-only assumptions
 * as marketing-shot.mjs: local server on :2567, Vite on :5173, postgres
 * via `su postgres -c psql`, Chromium at /opt/pw-browsers/chromium.
 *
 * Usage: node tools/world-poster.mjs
 * Output: docs/marketing/world-poster.png (2560×1440)
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const HTTP = 'http://localhost:2567';
const WEB = 'http://localhost:5173';
const SCRATCH = process.env.POSTER_TMP ?? '/tmp/amperia-poster';
mkdirSync(SCRATCH, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) => {
  writeFileSync('/tmp/po.sql', sql);
  return execSync('chmod 644 /tmp/po.sql && su postgres -c "psql amperia -f /tmp/po.sql"', { encoding: 'utf8' });
};

const r = await fetch(`${HTTP}/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const a = await r.json();

// One flattering wide angle per quarter (1280x720 each -> 2560x1440 poster).
const QUARTERS = [
  { d: 'filament', label: 'THE FILAMENT', tile: { x: 26, y: 18 }, zoom: 1.05, at: { x: 30, y: 22 } },
  { d: 'stacks', label: 'THE STACKS', tile: { x: 17, y: 15 }, zoom: 1.0, at: { x: 13, y: 16 } },
  { d: 'terrarium', label: 'THE TERRARIUM', tile: { x: 27, y: 17 }, zoom: 1.3, at: { x: 24, y: 18 } },
  { d: 'tangle', label: 'THE TANGLE', tile: { x: 20, y: 20 }, zoom: 1.0, at: { x: 18, y: 22 } },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let first = true;
for (const q of QUARTERS) {
  psql(`UPDATE "Character" SET district='${q.d}', "tileX"=${q.at.x}, "tileY"=${q.at.y} WHERE "sparkName"='${a.sparkName}';`);
  await page.addInitScript(([t, d]) => { localStorage.setItem('amperia.token', t); localStorage.setItem('amperia.district', d); }, [a.token, q.d]);
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
  await sleep(2500);
  await page.evaluate(([tile, zoom]) => window.__amperia.photo.enter({ tile, zoom }), [q.tile, q.zoom]);
  await sleep(1400);
  await page.screenshot({ path: `${SCRATCH}/poster-${q.d}.png` });
  await page.evaluate(() => window.__amperia.photo.exit());
  console.log(`poster-${q.d}.png ✓`);
  // Disconnect cleanly before flipping the persisted district.
  await page.goto('about:blank');
  await sleep(1500);
}

// Composite in-browser: a 2x2 grid, thin ink gutters, the wordmark band.
const b64 = (p) => readFileSync(p).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body { width: 2560px; height: 1440px; background: #0D0A18; position: relative; font-family: 'DejaVu Sans Mono', monospace; }
  .q { position: absolute; width: 1277px; height: 717px; object-fit: cover; }
  .nw { left: 0; top: 0; } .ne { right: 0; top: 0; }
  .sw { left: 0; bottom: 0; } .se { right: 0; bottom: 0; }
  .tag { position: absolute; color: #FFD9A0; letter-spacing: 3px; font-size: 22px;
         text-shadow: 0 0 14px rgba(255,178,102,0.85), 0 2px 6px #000; }
  .nw-t { left: 26px; top: 20px; } .ne-t { right: 26px; top: 20px; }
  .sw-t { left: 26px; bottom: 20px; } .se-t { right: 26px; bottom: 20px; }
  .band { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
          text-align: center; background: rgba(13,10,24,0.82); border: 2px solid #FFB266;
          border-radius: 10px; padding: 26px 64px; box-shadow: 0 0 60px rgba(255,178,102,0.35); }
  .band h1 { color: #FFD9A0; font-size: 88px; letter-spacing: 26px; text-indent: 26px;
             text-shadow: 0 0 30px rgba(255,178,102,0.9); }
  .band p { color: #B266FF; font-size: 26px; letter-spacing: 6px; margin-top: 10px;
            text-shadow: 0 0 16px rgba(178,102,255,0.8); }
</style></head><body>
  <img class="q nw" src="data:image/png;base64,${b64(`${SCRATCH}/poster-filament.png`)}">
  <img class="q ne" src="data:image/png;base64,${b64(`${SCRATCH}/poster-stacks.png`)}">
  <img class="q sw" src="data:image/png;base64,${b64(`${SCRATCH}/poster-terrarium.png`)}">
  <img class="q se" src="data:image/png;base64,${b64(`${SCRATCH}/poster-tangle.png`)}">
  <div class="tag nw-t">THE FILAMENT</div>
  <div class="tag ne-t">THE STACKS</div>
  <div class="tag sw-t">THE TERRARIUM</div>
  <div class="tag se-t">THE TANGLE</div>
  <div class="band"><h1>AMPERIA</h1><p>FOUR QUARTERS · ONE CITY IN THE DARK</p></div>
</body></html>`;
writeFileSync(`${SCRATCH}/poster.html`, html);
const pp = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
await pp.goto(`file://${SCRATCH}/poster.html`);
await sleep(1200);
mkdirSync('/home/user/Amperia/docs/marketing', { recursive: true });
await pp.screenshot({ path: '/home/user/Amperia/docs/marketing/world-poster.png' });
console.log('world-poster.png ✓');
await browser.close();
process.exit(0);
