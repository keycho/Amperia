/**
 * F5 FINAL CHECKPOINT — the 10-minute playthrough screenshot set.
 * A stranger's first session, beat by beat: arrival → creator → first
 * gather (pickup chip in flight) → the Pack → selling at the Nightstalls →
 * crafting at the Tinkerbench (result card) → Manifest → map → Mastery →
 * the tram to another district. 1280×720 (the stranger's laptop).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.env.PLAY_OUT ?? 'shots';
const VP = { w: 1280, h: 720 };
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

/** Seed the fresh Spark's pack so the craft beat is reachable inside the
 *  ten minutes (bench + merchant beats still run through live server intents). */
function seedPack(sparkName) {
  const pack = JSON.stringify([
    { itemId: 'salvage', qty: 20 },
    { itemId: 'brass', qty: 8 },
  ]);
  const sql = `UPDATE "Character" SET "packJson" = '${pack}'::jsonb, bolts = 60 WHERE "sparkName" = '${sparkName}'`;
  execSync(`PGPASSWORD=amperia psql -U amperia -h localhost amperia -c ${JSON.stringify(sql)}`);
}

async function walkTo(page, tx, ty) {
  const target = await page.evaluate(([x, y]) => {
    const scene = window.__amperia.game.scene.getScene('world');
    const walk = scene.map.walkable;
    const ok = (px, py) => walk[py]?.[px] === true;
    if (ok(x, y)) return { x, y };
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }, [tx, ty]);
  if (target === null) throw new Error(`walkTo(${tx},${ty}): no walkable tile`);
  await page.evaluate(([x, y]) => {
    window.__amperia.session.room.send('move', { x, y });
  }, [target.x, target.y]);
  await page.waitForFunction(
    ([x, y]) => {
      const scene = window.__amperia.game.scene.getScene('world');
      const room = window.__amperia.session.room;
      const me = scene.sparks.get(room.sessionId);
      return me !== undefined && Math.abs(me.tile.x - x) <= 1 && Math.abs(me.tile.y - y) <= 1;
    },
    [target.x, target.y],
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📷 ${name}`);
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const auth = await signIn();
  console.log(`Spark seated: ${auth.sparkName}`);
  seedPack(auth.sparkName);

  const page = await browser.newPage({ viewport: { width: VP.w, height: VP.h } });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(([t]) => {
    localStorage.setItem('amperia.token', t);
    localStorage.setItem('amperia.district', 'filament');
  }, [auth.token]);
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, { timeout: 60000 });

  // ── 01: arrival — the creator is the first thing a stranger sees ─────────
  const stepIn = page.locator('button', { hasText: 'Step into the city' });
  await stepIn.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(900); // creator turntable settles
  await shot(page, '01-first-light');
  const nameField = page.locator('input[type="text"]').first();
  const uniqueName = `Weldamira${Math.floor(Math.random() * 900) + 100}`;
  try {
    await nameField.fill(uniqueName, { timeout: 3000 });
  } catch { /* wardrobe-only creator has no name field */ }
  await stepIn.click();
  await stepIn.waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForTimeout(1800);
  await page.mouse.move(Math.round(VP.w / 2), Math.round(VP.h * 0.55));

  // ── 02: the intro cards auto-open for a brand-new Spark ──────────────────
  await shot(page, '02-how-the-city-works');
  await page.keyboard.press('Escape'); // dismiss — the [?] button remains
  await page.waitForTimeout(400);

  // ── 03: first clear sight of the city (tutorial checklist up) ────────────
  await shot(page, '03-step-into-the-city');

  // ── 04/05: work a junk heap; catch the pickup chip mid-flight ────────────
  const heap = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const room = window.__amperia.session.room;
    const heaps = scene.map.nodes.filter((n) => n.kind === 'junkHeap');
    // A heap CLEAR OF MOBS first (live positions from room state — a bitten
    // Spark mid-shoot ruins the beat), nearest the market row among those.
    const m = scene.map.props.find((p) => p.kind === 'merchant') ?? { x: 0, y: 0 };
    const mobs = [];
    room.state.mobs.forEach((mv) => mobs.push({ x: mv.tileX, y: mv.tileY }));
    const mobDist = (h) =>
      mobs.length === 0 ? 999 : Math.min(...mobs.map((b) => Math.hypot(h.x - b.x, h.y - b.y)));
    let pool = heaps.filter((h) => mobDist(h) >= 8);
    if (pool.length === 0) pool = [...heaps].sort((a, b) => mobDist(b) - mobDist(a)).slice(0, 1);
    pool.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y));
    return pool[0] ?? null;
  });
  if (heap === null) throw new Error('no junk heap in the district');
  await walkTo(page, heap.x, heap.y);
  await page.evaluate(() => {
    window.__chipFlights = 0;
    window.__amperia.session.events.on('lootChipFly', () => (window.__chipFlights += 1));
  });
  /** One full cycle: send the intent, return the moment the chip launches
   *  (counter read + send are one evaluate — no race with a fast cycle). */
  const gatherCycle = async () => {
    await page.evaluate(([id]) => {
      window.__chipWait = window.__chipFlights;
      window.__amperia.session.room.send('gather', { nodeId: id });
    }, [heap.id]);
    await page
      .waitForFunction(() => window.__chipFlights > window.__chipWait, null, {
        timeout: 20000,
        polling: 'raf',
      })
      .catch(() => {});
  };
  // First cycle (~8s server-side): arm the counter BEFORE the send and ride
  // this same cycle to the haul shot — a re-send mid-cycle restarts the
  // clock. The working shot lands mid-gather (bar up, Magclaw out).
  await page.evaluate(([id]) => {
    window.__chipWait = window.__chipFlights;
    window.__amperia.session.room.send('gather', { nodeId: id });
  }, [heap.id]);
  await page.waitForTimeout(450);
  await shot(page, '04-working-the-heap');
  // The cycle's loot lands next; shot mid-flight. Headless screenshot latency on the WebGL
  // canvas is ~2s (measured: GPU ReadPixels stall) — far past the 420ms arc.
  // So stretch tween time to 6% for the one beat (arc ≈ 7s, float text ≈
  // 18s) and shoot the instant the chip launches: the shutter lag itself
  // delivers the mid-arc frame.
  await page.evaluate(() => {
    window.__amperia.game.scene.getScene('ui').tweens.timeScale = 0.06;
    window.__amperia.game.scene.getScene('world').tweens.timeScale = 0.06;
  });
  await page.waitForFunction(() => window.__chipFlights > window.__chipWait, null, {
    timeout: 20000,
    polling: 'raf',
  });
  await shot(page, '05-the-haul');
  await page.evaluate(() => {
    window.__amperia.game.scene.getScene('ui').tweens.timeScale = 1;
    window.__amperia.game.scene.getScene('world').tweens.timeScale = 1;
  });
  // Two more cycles so the Pack reads like ten minutes of work.
  for (let i = 0; i < 2; i++) await gatherCycle();
  await page.waitForTimeout(800);

  // ── 06: the Pack, tooltip up on the salvage stack ────────────────────────
  await page.keyboard.press('I');
  await page.waitForTimeout(400); // pop settles
  const slotPos = await page.evaluate(() => {
    const ui = window.__amperia.game.scene.getScene('ui');
    const idx = window.__amperia.gameState.inventory.slots.findIndex(
      (s) => s !== null && s.itemId === 'salvage',
    );
    if (idx < 0) return null;
    return ui.inventoryPanel.slotCenter(idx);
  });
  if (slotPos !== null) {
    await page.mouse.move(Math.round(slotPos.x), Math.round(slotPos.y));
    await page.waitForTimeout(500);
  }
  await shot(page, '06-the-pack');
  await page.mouse.move(200, 640); // park clear of the strip
  await page.keyboard.press('I');
  await page.waitForTimeout(300);

  // ── 07: the Nightstalls — sell the haul, walk out with Bolts ─────────────
  const merchant = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.map.props.find((p) => p.kind === 'merchant') ?? null;
  });
  if (merchant === null) throw new Error('no merchant prop');
  await walkTo(page, merchant.x + Math.floor(merchant.w / 2), merchant.y + merchant.h + 1);
  await page.evaluate(() => window.__amperia.session.events.emit('openMerchant'));
  await page.waitForTimeout(500);
  await page.evaluate(() =>
    window.__amperia.session.room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 10 }),
  );
  await page.waitForTimeout(700); // Bolts tick + panel re-render
  await shot(page, '07-the-nightstalls');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 08/09: the Tinkerbench — showcase, then the result card ──────────────
  const bench = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.map.props.find((p) => p.kind === 'tinkerbench') ?? null;
  });
  if (bench === null) throw new Error('no tinkerbench prop');
  await walkTo(page, bench.x + Math.floor(bench.w / 2), bench.y + bench.h + 1);
  await page.evaluate(() => window.__amperia.session.events.emit('openBench'));
  await page.waitForTimeout(500);
  await shot(page, '08-the-tinkerbench');
  await page.evaluate(() => window.__amperia.session.room.send('craft', { recipeId: 'wrench1' }));
  await page.waitForTimeout(900); // result card fully in, mid-hold
  await shot(page, '09-fresh-from-the-bench');
  await page.waitForTimeout(2600); // card fades on its own
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 10/11/12: the Manifest · the city map · Mastery ──────────────────────
  await page.keyboard.press('J');
  await page.waitForTimeout(500);
  await shot(page, '10-the-manifest');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await shot(page, '11-the-city-map');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('K');
  await page.waitForTimeout(500);
  await shot(page, '12-mastery');
  await page.keyboard.press('K');
  await page.waitForTimeout(300);

  // ── 13: the tram — out of the Filament, into the Stacks ──────────────────
  const gate = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.map.props.find((p) => p.kind === 'tramgate') ?? null;
  });
  if (gate === null) throw new Error('no tramgate prop');
  await walkTo(page, gate.x + Math.floor(gate.w / 2), gate.y + gate.h + 1);
  await page.evaluate(() => window.__amperia.session.room.send('travel', { to: 'stacks' }));
  await page.waitForFunction(() => window.__amperia.session.room?.name === 'stacks', null, {
    timeout: 30000,
  });
  await page.waitForTimeout(2500); // district render settles
  await page.mouse.move(Math.round(VP.w / 2), Math.round(VP.h * 0.55));
  await shot(page, '13-the-tram-to-the-stacks');

  await browser.close();
  console.log('Playthrough set complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
