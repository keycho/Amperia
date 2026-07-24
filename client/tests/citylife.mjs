/**
 * CITY LIFE block checkpoint — four shots:
 *   1 bar-interior     two Sparks seated + drinking, Vessa mid-bubble
 *   2 round-toast      the "<name> bought a round." broadcast on screen
 *   3 coilroll-lean    a Spark leaning outside with the coilroll lit
 *   4 resting-spark    a REAL logout capture: dimmed "· resting" tag
 * Usage: node client/tests/citylife.mjs <outdir>
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.citylife-out';
const STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

async function signIn() {
  const account = privateKeyToAccount(generatePrivateKey());
  const { nonce } = await (await fetch(`${SERVER}/auth/nonce`)).json();
  const message = [
    'localhost wants you to sign in with your Ethereum account:',
    account.address, '', STATEMENT, '',
    'URI: http://localhost', 'Version: 1', 'Chain ID: 1', `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
  const signature = await account.signMessage({ message });
  const res = await fetch(`${SERVER}/auth/wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`sign-in failed: ${data.error}`);
  return data;
}

function seedBolts(sparkName, bolts) {
  const sql = `UPDATE "Character" SET bolts = ${bolts} WHERE "sparkName" = '${sparkName}'`;
  execSync(`PGPASSWORD=amperia psql -U amperia -h localhost amperia -c ${JSON.stringify(sql)}`);
}

async function openWorld(browser, token, name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(([t]) => {
    localStorage.setItem('amperia.token', t);
    localStorage.setItem('amperia.district', 'filament');
    localStorage.setItem('amperia.howtoplay.seen', '1');
    localStorage.setItem('amperia.firstloop.done', '1');
  }, [token]);
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, { timeout: 60000 });
  const stepIn = page.locator('button', { hasText: 'Step into the city' });
  try {
    await stepIn.waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('input[type="text"]').first().fill(name);
    await stepIn.click();
    await stepIn.waitFor({ state: 'detached', timeout: 10000 });
  } catch { /* returning */ }
  await page.waitForTimeout(1500);
  return page;
}

async function walkTo(page, x, y) {
  await page.evaluate(([tx, ty]) => {
    window.__amperia.session.room.send('move', { x: tx, y: ty });
  }, [x, y]);
  // SERVER truth + interval polling: a backgrounded page's client-side
  // tween mirror lags, but the replicated state never lies.
  await page
    .waitForFunction(
      ([tx, ty]) => {
        const room = window.__amperia.session.room;
        const ps = room.state.players.get(room.sessionId);
        return ps !== undefined && ps.tileX === tx && ps.tileY === ty;
      },
      [x, y],
      { timeout: 30000, polling: 500 },
    )
    .catch(() => console.warn(`walkTo(${x},${y}) did not settle`));
  await page.waitForTimeout(400);
}

const chat = (page, text) =>
  page.evaluate(([t]) => window.__amperia.session.room.send('chat', { text: t }), [text]);
const bar = (page, action, drinkId) =>
  page.evaluate(
    ([a, d]) => window.__amperia.session.room.send('bar', { action: a, drinkId: d }),
    [action, drinkId],
  );
const idle = (page, pose) =>
  page.evaluate(([p]) => window.__amperia.session.room.send('idle', { pose: p }), [pose]);
const photo = (page, tile, zoom, nameplates) =>
  page.evaluate(
    ([t, z, n]) => window.__amperia.photo.enter({ tile: t, zoom: z, nameplates: n }),
    [tile, zoom, nameplates],
  );
const photoExit = (page) => page.evaluate(() => window.__amperia.photo.exit());
/** Debug: camera midpoint + every Spark's server-vs-mirror tile. */
const truth = (page, label) =>
  page
    .evaluate(() => {
      const scene = window.__amperia.game.scene.getScene('world');
      const room = window.__amperia.session.room;
      const cam = scene.cameras.main;
      const rows = [];
      room.state.players.forEach((ps, sid) => {
        const s = scene.sparks.get(sid);
        rows.push(
          `${ps.sparkName}@server(${ps.tileX},${ps.tileY})pose=${ps.pose} mirror(${s?.tile.x},${s?.tile.y})drink=${ps.drink}`,
        );
      });
      return `cam(${Math.round(cam.midPoint.x)},${Math.round(cam.midPoint.y)})z${cam.zoom} | ${rows.join(' | ')}`;
    })
    .then((s) => console.log(`  [${label}] ${s}`));

/**
 * Headless pages run Phaser in slow motion (throttled rAF + clamped
 * delta), so tween mirrors lag their server tiles by seconds. Before any
 * shot: front the page, then SNAP every replicated Spark's sprite to its
 * server tile — the frame must show the truth, not the catch-up walk.
 */
async function settleView(page) {
  await page.bringToFront();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const room = window.__amperia.session.room;
    room.state.players.forEach((ps, sid) => {
      const s = scene.sparks.get(sid);
      if (s !== undefined && (s.tile.x !== ps.tileX || s.tile.y !== ps.tileY)) {
        s.snapTo({ x: ps.tileX, y: ps.tileY });
        s.setPose(ps.pose === '' ? null : ps.pose);
      }
    });
  });
  await page.waitForTimeout(600);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
});
const nameA = `Vessel${Math.floor(Math.random() * 900) + 100}`;
const nameB = `Ember${Math.floor(Math.random() * 900) + 100}`;
const authA = await signIn();
const authB = await signIn();
// First visit creates the characters (names), then we leave, seed Bolts, and
// come back. Order matters: onLeave persists the live runtime's bolts to the
// DB, so seeding while a session is open gets clobbered by the leave-persist.
let pageA = await openWorld(browser, authA.token, nameA);
let pageB = await openWorld(browser, authB.token, nameB);
await pageA.close();
await pageB.close();
await new Promise((r) => setTimeout(r, 2000)); // leave-persist lands
seedBolts(nameA, 400);
seedBolts(nameB, 400);
pageA = await openWorld(browser, authA.token, nameA);
pageB = await openWorld(browser, authB.token, nameB);

// ── 1: both Sparks to the bar, seats, drinks, Vessa mid-bubble ─────────────
await walkTo(pageA, 32, 52);
await walkTo(pageB, 33, 52);
await walkTo(pageA, 31, 50);
await walkTo(pageB, 32, 50);
await walkTo(pageA, 31, 49);
await walkTo(pageB, 33, 49);
await idle(pageA, 'sit');
await idle(pageB, 'sit');
await pageA.waitForTimeout(400);
await bar(pageA, 'buy', 'filamentAle');
await bar(pageB, 'buy', 'glowkoiSour');
// The mugs must be IN HAND before the shutter.
const drinkPredicate = () => {
  const room = window.__amperia.session.room;
  return room.state.players.get(room.sessionId)?.drink !== '';
};
await pageA
  .waitForFunction(drinkPredicate, null, { timeout: 8000, polling: 500 })
  .catch(() => console.warn('drink A never poured'));
await pageB
  .waitForFunction(drinkPredicate, null, { timeout: 8000, polling: 500 })
  .catch(() => console.warn('drink B never poured'));
await settleView(pageA);
// Vessa speaks, deterministically (the ambient timer also does this live).
await pageA.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const p = scene.map.props.find((pr) => pr.kind === 'ampedbar');
  const a = scene.propAnchor(p);
  scene.speakNpc('ampedbar', a.x, a.y, "Heard it all already. Pour's still the same.");
});
await photo(pageA, { x: 32, y: 49 }, 2, true);
await pageA.waitForTimeout(700);
await truth(pageA, 'shot1');
await pageA.screenshot({ path: `${OUT}/1-bar-interior.png` });
console.log('  📷 1-bar-interior');
await photoExit(pageA);
await pageA.waitForTimeout(300);

// ── 2: the round toast ─────────────────────────────────────────────────────
// B's screen shows the toast. Fronting B unfreezes its (Phaser-clock)
// toast queue; then wait until the visible pill IS the round line — older
// pills each hold 2.6s, so the round can be a few pills back.
await settleView(pageB);
// The headless clock runs ~5× slow, so each queued pill holds ~13s real —
// clear B's pill backlog so the round line is the NEXT pill on screen.
await pageB.evaluate(() => {
  const ui = window.__amperia.game.scene.getScene('ui');
  ui.toastQueue.length = 0;
  ui.toast?.destroy();
  ui.toast = null;
  ui.toastRunning = false;
});
await bar(pageA, 'round', 'filamentAle');
await pageB
  .waitForFunction(
    () => {
      const ui = window.__amperia.game.scene.getScene('ui');
      const txt = ui.toast?.list?.[1];
      return typeof txt?.text === 'string' && txt.text.includes('bought a round');
    },
    null,
    { timeout: 20000, polling: 300 },
  )
  .catch(() => console.warn('round toast never surfaced'));
await pageB.waitForTimeout(400); // pill slide-in settles
await truth(pageB, 'shot2');
await pageB.screenshot({ path: `${OUT}/2-round-toast.png` });
console.log('  📷 2-round-toast');

// ── 3: B leans at the deck-edge rail with the coilroll ─────────────────────
// The promenade rim (y=59) carries guardrails on even x — an odd tile puts
// the Spark between two rail segments with the void falling away behind.
await walkTo(pageB, 31, 59); // approach from the west so the lean faces the camera
await walkTo(pageB, 33, 59);
await idle(pageB, 'lean');
await settleView(pageA); // A's client renders B — front A so the smoke ticks
await pageA.waitForTimeout(9000); // headless clock runs ~5× slow — let a curl or two rise
await photo(pageA, { x: 33, y: 58 }, 3, true);
await pageA.waitForTimeout(700);
await truth(pageA, 'shot3');
await pageA.screenshot({ path: `${OUT}/3-coilroll-lean.png` });
console.log('  📷 3-coilroll-lean');
await photoExit(pageA);
await pageA.waitForTimeout(300);

// ── 4: B sits on the deck edge and LOGS OUT — the Spark stays ──────────────
await walkTo(pageB, 36, 59);
await idle(pageB, 'sit');
await pageB.waitForTimeout(500);
await pageB.close(); // the logout capture happens server-side in onLeave
await pageA
  .waitForFunction(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.resters.size > 0;
  }, null, { timeout: 15000, polling: 500 })
  .catch(() => console.warn('rester never appeared'));
await settleView(pageA);
await photo(pageA, { x: 36, y: 58 }, 3, true);
await pageA.waitForTimeout(700);
await truth(pageA, 'shot4');
await pageA.screenshot({ path: `${OUT}/4-resting-spark.png` });
console.log('  📷 4-resting-spark');
await photoExit(pageA);

await browser.close();
console.log('city life shots complete.');
