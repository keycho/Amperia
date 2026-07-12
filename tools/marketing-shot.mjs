/**
 * MARKETING SHOT RIG — "the city at night" and every shot after it.
 *
 * Drives the client's photo mode (window.__amperia.photo) with a staged
 * cast: stall keepers who rent + stock real pitches, browsers, a gatherer
 * mid-swing at a junk heap, and walkers on the lane. All value flows go
 * through the real server (rent is paid, stock is escrowed) — the camera
 * is the only thing that cheats.
 *
 * Dev-only assumptions: local server on :2567, Vite on :5173, a local
 * postgres reachable via `su postgres -c psql` for casting-department
 * SQL (appearance, wardrobe money, stage positions). Playwright-core +
 * the pre-installed Chromium at /opt/pw-browsers/chromium.
 *
 * Usage: node tools/marketing-shot.mjs
 * Output: docs/marketing/city-at-night-{a-lane,b-plaza,c-stall}.png
 *         + docs/marketing/city-at-night.png (the default pick, angle A)
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { Client } from '../node_modules/colyseus.js/build/esm/index.mjs';

const HTTP = 'http://localhost:2567';
const WEB = 'http://localhost:5173';
const OUT = new URL('../docs/marketing/', import.meta.url).pathname;
const WIDTH = 2560;
const HEIGHT = 1440;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const psql = (sql) => {
  writeFileSync('/tmp/mkt.sql', sql);
  return execSync('chmod 644 /tmp/mkt.sql && su postgres -c "psql amperia -f /tmp/mkt.sql"', {
    encoding: 'utf8',
  });
};

async function register() {
  const r = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return r.json();
}

/** The three candidate angles. Tune here for future shots. */
const ANGLES = [
  { key: 'a-lane', tile: { x: 28, y: 18 }, zoom: 1.7 }, // lane-length: gate → Dynamo
  { key: 'b-plaza', tile: { x: 24, y: 17 }, zoom: 1.7 }, // plaza toward the stalls
  { key: 'c-stall', tile: { x: 28.5, y: 17.5 }, zoom: 3.2 }, // one stall + its customer
];

/** The cast: appearance codes are creator-table indices (see appearance.ts). */
const CAST = [
  { role: 'keeper-A', name: 'Tindra', code: '1:1:1:1:2:1' }, // stocks stall 0, then browses
  { role: 'keeper-B', name: 'Volt-Mara', code: '1:2:3:2:3:0' }, // stocks stall 1, then browses
  { role: 'gatherer', name: 'Sprocket', code: '1:0:2:4:1:2' }, // mid-gather at the junk heap
  { role: 'walker-1', name: 'Haldi', code: '1:3:0:0:4:3' },
  { role: 'walker-2', name: 'Mox', code: '1:4:4:3:0:0' },
];

async function main() {
  mkdirSync(OUT, { recursive: true });

  // ── casting: register everyone, dress them, hand out wardrobe money ────
  const photographer = await register();
  const cast = [];
  for (const member of CAST) {
    const acc = await register();
    cast.push({ ...member, ...acc });
  }
  for (const m of cast) {
    psql(
      `UPDATE "Character" SET "sparkName"='${m.name}', appearance='${m.code}', bolts=600, ` +
        `"packJson"='[{"itemId":"salvage","qty":80},{"itemId":"brass","qty":40},{"itemId":"amperite","qty":25}]' ` +
        `WHERE "sparkName"='${m.sparkName}';`,
    );
  }

  // ── the cast takes the stage ────────────────────────────────────────────
  const rooms = new Map();
  for (const m of cast) {
    const c = new Client('ws://localhost:2567');
    rooms.set(m.role, await c.joinOrCreate('filament', { token: m.token }));
    await sleep(400);
  }
  const send = (role, type, msg) => rooms.get(role).send(type, msg);

  // Stall keepers: walk into reach, rent the pitch, stock the counter.
  const stock = async (role, stallId, stand, lines) => {
    send(role, 'move', stand);
    await sleep(4500);
    send(role, 'shop', { action: 'rent', stallId });
    await sleep(900);
    for (const line of lines) {
      send(role, 'shop', { action: 'stock', stallId, ...line });
      await sleep(700);
    }
  };
  await stock('keeper-A', 0, { x: 28, y: 19 }, [
    { slot: 0, qty: 40, priceBolts: 6 }, // salvage
    { slot: 1, qty: 20, priceBolts: 14 }, // brass
    { slot: 2, qty: 10, priceBolts: 30 }, // amperite
  ]);
  await stock('keeper-B', 1, { x: 31, y: 19 }, [
    { slot: 1, qty: 25, priceBolts: 13 },
    { slot: 0, qty: 50, priceBolts: 5 },
  ]);

  // Keepers turn customer: drift down the row and browse a neighbour.
  send('keeper-A', 'move', { x: 34, y: 19 });
  await sleep(2500);
  send('keeper-A', 'move', { x: 34, y: 18 }); // last step faces the counters
  send('keeper-B', 'move', { x: 26, y: 19 });
  await sleep(2500);
  send('keeper-B', 'move', { x: 25, y: 18 });

  // The gatherer: junk heap #1 sits at (35,14) by the old siding.
  send('gatherer', 'move', { x: 35, y: 15 });
  await sleep(5000);
  const keepGathering = setInterval(() => send('gatherer', 'gather', { nodeId: 1 }), 2600);
  send('gatherer', 'gather', { nodeId: 1 });

  // Walkers: opposite laps of the lane, staggered.
  let flip = false;
  const keepWalking = setInterval(() => {
    flip = !flip;
    send('walker-1', 'move', { x: flip ? 33 : 28, y: 20 });
    send('walker-2', 'move', { x: flip ? 29 : 34, y: 21 });
  }, 5200);
  send('walker-1', 'move', { x: 33, y: 20 });
  await sleep(2600);
  send('walker-2', 'move', { x: 29, y: 21 });

  // ── the photographer arrives ────────────────────────────────────────────
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(
    ([t]) => {
      localStorage.setItem('amperia.token', t);
      localStorage.setItem('amperia.district', 'filament');
    },
    [photographer.token],
  );
  await page.goto(WEB, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, { timeout: 90000 });
  const creator = await page.$('#amperia-creator');
  if (creator) {
    await page.evaluate(() => {
      [...document.getElementById('amperia-creator').querySelectorAll('button')]
        .find((b) => b.textContent === 'Step into the city')
        ?.click();
    });
    await sleep(1000);
  }
  // Step out of frame — the photographer is crew, not cast.
  await page.evaluate(() => window.__amperia.session.room.send('move', { x: 14, y: 28 }));
  await sleep(6000);

  // Let the stage settle (stock synced, gather pose up, walkers mid-stride).
  await sleep(3000);

  // ── the shots ───────────────────────────────────────────────────────────
  for (const angle of ANGLES) {
    await page.evaluate(
      ([tile, zoom]) => window.__amperia.photo.enter({ tile, zoom }),
      [angle.tile, angle.zoom],
    );
    await sleep(1200); // nameplate fade tick + a steam breath
    await page.screenshot({ path: `${OUT}city-at-night-${angle.key}.png` });
    console.log(`city-at-night-${angle.key}.png ✓`);
  }
  await page.evaluate(() => window.__amperia.photo.exit());

  // Default pick: the lane-length view. Swap by copying a different one.
  copyFileSync(`${OUT}city-at-night-a-lane.png`, `${OUT}city-at-night.png`);
  console.log('city-at-night.png ✓ (angle A — swap freely)');

  clearInterval(keepGathering);
  clearInterval(keepWalking);
  process.exit(0);
}

main().catch((e) => {
  console.error('MARKETING SHOT FAILED', e);
  process.exit(1);
});
