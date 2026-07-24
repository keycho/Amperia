/**
 * S2 chapter-1 playthrough checkpoint — "WICKS", start to keepsake:
 *   1 intro         Sable's offer, page one of the private dialogue panel
 *   2 choice        the flavor fork ("Lamp-wicks? The city's got the Dynamo.")
 *   3 task          mid-task: the tracker panel with real gather progress
 *   4 outro         the payoff conversation (the Long Dark reveal)
 *   5 keepsake      the keepsake beat, ready to keep
 *   6 pack          the Pack open: A Dead Filament in a slot
 * Usage: node client/tests/story.mjs <outdir>   (dev stack must be up)
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.story-out';
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

function seedSkills(sparkName, skillsJson) {
  const sql = `UPDATE "Character" SET "skillsJson" = '${skillsJson}' WHERE "sparkName" = '${sparkName}'`;
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
  } catch {
    /* returning */
  }
  await page.waitForTimeout(1500);
  await page.bringToFront();
  return page;
}

async function walkTo(page, x, y) {
  const t = await page.evaluate(([tx, ty]) => {
    const walk = window.__amperia.game.scene.getScene('world').map.walkable;
    const ok = (px, py) => walk[py]?.[px] === true;
    if (ok(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (ok(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }, [x, y]);
  if (t === null) {
    console.warn(`walkTo(${x},${y}): no walkable tile nearby`);
    return;
  }
  x = t.x;
  y = t.y;
  await page.evaluate(([tx, ty]) => {
    window.__amperia.session.room.send('move', { x: tx, y: ty });
  }, [x, y]);
  await page
    .waitForFunction(
      ([tx, ty]) => {
        const room = window.__amperia.session.room;
        const ps = room.state.players.get(room.sessionId);
        return ps !== undefined && ps.tileX === tx && ps.tileY === ty;
      },
      [x, y],
      { timeout: 40000, polling: 500 },
    )
    .catch(() => console.warn(`walkTo(${x},${y}) did not settle`));
  await page.waitForTimeout(400);
}

/** Drive the story panel's steps (the same code paths the buttons run). */
const panelNext = (page) =>
  page.evaluate(() => {
    const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
    panel.stepIdx += 1;
    panel.refresh();
  });
const panelChoose = (page, idx) =>
  page.evaluate(([i]) => {
    const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
    const def = panel.chapter;
    const c = def.choices[i];
    const replySteps = c.reply.map((line) => ({ kind: 'line', line }));
    panel.steps.splice(panel.stepIdx + 1, 0, ...replySteps);
    panel.stepIdx += 1;
    panel.refresh();
  }, [idx]);

const shot = async (page, name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📷 ${name}`);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
});
const name = `Wick${Math.floor(Math.random() * 900) + 100}`;
const auth = await signIn();

// First visit creates the character; leave, seed Scavving 3+, come back
// (the leave-persist would clobber a live-session seed).
let page = await openWorld(browser, auth.token, name);
await page.close();
await new Promise((r) => setTimeout(r, 2000));
seedSkills(name, '{"scavving": 800}');
page = await openWorld(browser, auth.token, name);

// The chapter should be OFFERED (Scavving gate passed) — verify.
await page
  .waitForFunction(
    () => {
      const scene = window.__amperia.game.scene.getScene('world');
      return scene.storyState?.offered?.includes('ch1') === true;
    },
    null,
    { timeout: 15000, polling: 500 },
  )
  .catch(() => console.warn('ch1 never offered'));

// ── to Sable; the story panel opens over the merchant interact ─────────────
const sable = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const m = scene.map.props.find((p) => p.kind === 'merchant');
  return { x: m.x, y: m.y };
});
await walkTo(page, sable.x, sable.y + 1);
await page.evaluate(() => {
  // The seeded-XP level-up banner would linger over the shots on the slow
  // headless clock — dismiss it; it's not part of chapter one.
  const ui = window.__amperia.game.scene.getScene('ui');
  ui.banner?.destroy();
  ui.banner = null;
  window.__amperia.session.events.emit('openStory', 'merchant');
});
await shot(page, '1-intro');
await panelNext(page); // intro line 2
await panelNext(page); // the choice fork
await shot(page, '2-choice');
await panelChoose(page, 0); // "Lamp-wicks? The city's got the Dynamo."
await shot(page, '3-choice-reply');
await panelNext(page); // the send line
await panelNext(page); // the task beat
// take it on — the real intent.
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'begin', id: 'ch1' });
  const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
  panel.setVisible(false);
});
await page.waitForTimeout(600);

// ── REAL gathering: work heaps until the task is done ──────────────────────
const heap = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const room = window.__amperia.session.room;
  const heaps = scene.map.nodes.filter((n) => n.kind === 'junkHeap');
  const mobs = [];
  room.state.mobs.forEach((mv) => mobs.push({ x: mv.tileX, y: mv.tileY }));
  const mobDist = (h) =>
    mobs.length === 0 ? 999 : Math.min(...mobs.map((b) => Math.hypot(h.x - b.x, h.y - b.y)));
  let pool = heaps.filter((h) => mobDist(h) >= 8);
  if (pool.length === 0) pool = heaps;
  const me = room.state.players.get(room.sessionId);
  pool.sort(
    (a, b) =>
      Math.hypot(a.x - me.tileX, a.y - me.tileY) - Math.hypot(b.x - me.tileX, b.y - me.tileY),
  );
  return pool[0] ?? null;
});
if (heap === null) throw new Error('no junk heap');
await walkTo(page, heap.x, heap.y);
const progress = () =>
  page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.storyState?.chapters?.ch1?.progress ?? 0;
  });
const sendGather = () =>
  page.evaluate(([id]) => {
    window.__amperia.session.room.send('gather', { nodeId: id });
  }, [heap.id]);
await sendGather();
let mid = false;
let last = 0;
let stall = 0;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  const p = await progress();
  if (p === last) {
    stall += 1;
    if (stall >= 3) {
      await sendGather(); // depleted heap respawned / session ended
      stall = 0;
    }
  } else {
    stall = 0;
  }
  last = p;
  if (i % 3 === 0) console.log(`  ch1 progress ${p}/10`);
  if (!mid && p >= 3 && p < 10) {
    // ── 3: the mid-task tracker, real numbers ──────────────────────────────
    await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'merchant'));
    await shot(page, '3-task-progress');
    await page.evaluate(() =>
      window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false),
    );
    mid = true;
    await sendGather();
  }
  if (p >= 10) break;
}
if ((await progress()) < 10) console.warn('task never completed');

// ── back to Sable: the payoff ──────────────────────────────────────────────
await walkTo(page, sable.x, sable.y + 1);
await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'merchant'));
await shot(page, '4-outro');
await panelNext(page);
await panelNext(page);
await panelNext(page); // through the reveal to the keepsake handoff
await panelNext(page);
await shot(page, '5-keepsake');
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'complete', id: 'ch1' });
  const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
  panel.mode = 'done';
  panel.refresh();
});
await shot(page, '6-journal');
await page.evaluate(() =>
  window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false),
);
await page.waitForTimeout(400);

// ── the Pack: the keepsake is real ─────────────────────────────────────────
await page.keyboard.press('I');
await shot(page, '7-pack-keepsake');

await browser.close();
console.log('story shots complete.');
