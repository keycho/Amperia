// Deploy smoke test (see DEPLOY.md §smoke-test): drives the BUILT client in a
// real browser through register → creator → move → gather → chat. Run from
// the repo root:
//   CLIENT_URL=https://your-client.vercel.app node tools/deploy-smoke.mjs
// Local extras: set SERVER_PID_FILE + SERVER_RESTART_CMD to also prove the
// SIGTERM persistence path (kill server gracefully, restart, relog, verify
// the gathered salvage survived). Leave both unset against live deploys.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:4173';
const PID_FILE = process.env.SERVER_PID_FILE;
const RESTART_CMD = process.env.SERVER_RESTART_CMD;

const EMAIL = `e2e-${Math.floor(Math.random() * 1e9)}@example.com`;
const PASS = 'e2e-password-1';
const SPARK = `E2E${Math.floor(Math.random() * 1e6)}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const until = async (fn, label, ms = 20000, step = 400) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return;
    await page.waitForTimeout(step);
  }
  fail(`timeout waiting for ${label}`);
};

const signIn = async (fresh) => {
  await page.goto(CLIENT_URL);
  await page.waitForTimeout(1500);
  if (!fresh) {
    // A stored token auto-resumes the session — no landing button, no form.
    await until(() => page.evaluate(() => !!window.__amperia?.session?.room?.sessionId), 'auto-resume', 30000);
    return;
  }
  await page.locator('button', { hasText: 'Enter the City' }).click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="email"]').fill(EMAIL);
  await page.locator('input[placeholder="password (8+)"]').fill(PASS);
  if (fresh) {
    await page.locator('input[placeholder="Spark name (for new accounts)"]').fill(SPARK);
    await page.locator('button', { hasText: 'Register a new Spark' }).click();
  } else {
    await page.locator('button', { hasText: 'Sign in' }).click();
  }
  await until(() => page.evaluate(() => !!window.__amperia?.session?.room?.sessionId), 'room join', 30000);
};

// 1) REGISTER through the real UI on the fresh DB.
await signIn(true);
console.log('login/register: room joined ✓');

// Creator overlay (first login): confirm the default Spark look.
const creator = page.locator('button', { hasText: 'Step into the city' });
if (await creator.count()) {
  await creator.click();
  await page.waitForTimeout(800);
  console.log('creator confirmed ✓');
}

const me = () => page.evaluate(() => {
  const r = window.__amperia.session.room;
  const p = r.state.players.get(r.sessionId);
  return p ? { x: p.tileX, y: p.tileY } : null;
});

// 2) MOVE: pick a nearby walkable tile, send the intent, watch the tile change.
const start = await me();
if (!start) fail('no player in state');
const target = await page.evaluate(([s]) => {
  const scene = window.__amperia.game.scene.getScene('world');
  for (let r = 1; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if ((dx !== 0 || dy !== 0) && scene.map.walkable[y]?.[x] === true) return { x, y };
      }
  return null;
}, [start]);
if (!target) fail('no walkable tile near spawn');
await page.evaluate(([t]) => window.__amperia.session.room.send('move', t), [target]);
await until(async () => {
  const p = await me();
  return p && (p.x !== start.x || p.y !== start.y);
}, 'movement');
console.log(`move: ${JSON.stringify(start)} → ${JSON.stringify(await me())} ✓`);

// 3) GATHER: equip slot 0 (starter Magclaw) and send gather at the nearest
// live junk heap — the server paths the Spark to it and runs the session.
// Inventory is NOT in room state (private); gameState.count() tracks the
// pack-sync messages the client receives.
const salvage = () => page.evaluate(() => window.__amperia.gameState.count('salvage'));
await page.evaluate(() => window.__amperia.session.room.send('selectSlot', { slot: 0 }));
const heap = await page.evaluate(([s]) => {
  const scene = window.__amperia.game.scene.getScene('world');
  const r = window.__amperia.session.room;
  const live = (scene.map.nodes ?? []).filter(
    (n) => n.kind === 'junkHeap' && r.state.nodes?.get(String(n.id))?.depleted === false,
  );
  live.sort((a, b) => (Math.abs(a.x - s.x) + Math.abs(a.y - s.y)) - (Math.abs(b.x - s.x) + Math.abs(b.y - s.y)));
  return live[0] ? { id: live[0].id } : null;
}, [start]);
if (!heap) fail('no live junk heap found');
const s0 = await salvage();
const gatherTimer = setInterval(() => {
  page.evaluate(([id]) => window.__amperia.session.room.send('gather', { nodeId: id }), [heap.id]).catch(() => {});
}, 2000);
await until(async () => (await salvage()) > s0, 'salvage gathered', 90000, 800);
clearInterval(gatherTimer);
const gained = await salvage();
console.log(`gather: salvage ${s0} → ${gained} ✓`);

// 4) CHAT round trip: second listener (colyseus.js appends), send, receive.
const phrase = `warm circuits ${Date.now() % 100000}`;
await page.evaluate(([msg]) => {
  window.__chatEcho = [];
  window.__amperia.session.room.onMessage('chatMsg', (m) => window.__chatEcho.push(m));
  window.__amperia.session.room.send('chat', { text: msg });
}, [phrase]);
await until(() => page.evaluate(([msg]) =>
  (window.__chatEcho ?? []).some((m) => JSON.stringify(m).includes(msg)), [phrase]), 'chat echo');
console.log(`chat: "${phrase}" round-tripped ✓`);

// 5) Optional (local only): SIGTERM persistence — kill the server
// gracefully, restart it, relog; the gathered salvage must survive
// (this is the rollback-day-loss test).
if (PID_FILE !== undefined && RESTART_CMD !== undefined) {
  console.log('sending SIGTERM to server…');
  execSync(`kill -TERM $(cat ${PID_FILE})`);
  await page.waitForTimeout(4000);
  execSync(RESTART_CMD, { shell: '/bin/bash' });
  await page.waitForTimeout(4000);
  await signIn(false);
  const after = await salvage();
  console.log(`relog after SIGTERM: salvage ${after} (was ${gained}) ${after === gained ? '✓' : '✗'}`);
  if (after !== gained) fail('salvage lost across SIGTERM restart');
}

await browser.close();
console.log('\nSMOKE: ALL PASS — login → move → gather → chat' +
  (PID_FILE !== undefined && RESTART_CMD !== undefined ? ' → SIGTERM persistence' : ''));
