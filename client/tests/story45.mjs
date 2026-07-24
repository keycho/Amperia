/**
 * S2c checkpoint — chapters 4-5 playthrough shots:
 *   ch4: bar approach · intro · choice · task · outro · KEEPSAKE CARD · journal
 *   ch5: intro · real brass gathering · outro · keepsake card · pack
 * Usage: node client/tests/story45.mjs <outdir>   (dev stack must be up)
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.story45-out';
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

const psql = (sql) =>
  execSync(`PGPASSWORD=amperia psql -U amperia -h localhost amperia -c ${JSON.stringify(sql)}`);

async function openWorld(browser, token, name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));
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
  await page.waitForTimeout(1800);
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
  if (t === null) return;
  await page.evaluate(([tx, ty]) => {
    window.__amperia.session.room.send('move', { x: tx, y: ty });
  }, [t.x, t.y]);
  await page
    .waitForFunction(
      ([tx, ty]) => {
        const room = window.__amperia.session.room;
        const ps = room.state.players.get(room.sessionId);
        return ps !== undefined && ps.tileX === tx && ps.tileY === ty;
      },
      [t.x, t.y],
      { timeout: 40000, polling: 500 },
    )
    .catch(() => console.warn(`walkTo(${x},${y}) did not settle`));
  await page.waitForTimeout(400);
}

const panelNext = (page) =>
  page.evaluate(() => {
    const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
    panel.stepIdx += 1;
    panel.refresh();
  });
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📷 ${name}`);
};
const clearBanner = (page) =>
  page.evaluate(() => {
    const ui = window.__amperia.game.scene.getScene('ui');
    ui.banner?.destroy();
    ui.banner = null;
  });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const name = `Ember${Math.floor(Math.random() * 900) + 100}`;
const auth = await signIn();

// Create the character, then seed skills + chapters 1-3 done (close→seed→reopen).
let page = await openWorld(browser, auth.token, name);
await page.close();
await new Promise((r) => setTimeout(r, 2500));
psql(
  `UPDATE "Character" SET "skillsJson" = '{"skimming": 6000, "scavving": 30000}', ` +
    `"storyJson" = '{"chapters":{"ch1":{"state":"done","progress":10},"ch2":{"state":"done","progress":3},"ch3":{"state":"done","progress":5}},"rodeTram":true}' ` +
    `WHERE "sparkName" = '${name}'`,
);
page = await openWorld(browser, auth.token, name);
await page
  .waitForFunction(
    () => {
      const scene = window.__amperia.game.scene.getScene('world');
      return scene.storyState?.offered?.includes('ch4') === true;
    },
    null,
    { timeout: 15000, polling: 500 },
  )
  .catch(() => console.warn('ch4 never offered'));

// ── CH4 at the Amped Bar ────────────────────────────────────────────────────
const bar = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const b = scene.map.props.find((p) => p.kind === 'ampedbar');
  return { x: b.x + 2, y: b.y + 3 };
});
await walkTo(page, bar.x, bar.y + 1);
await clearBanner(page);
await shot(page, 'ch4-0-bar-door');
await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'barkeep'));
await shot(page, 'ch4-1-intro');
await panelNext(page);
await shot(page, 'ch4-2-choice');
await page.evaluate(() => {
  // Choice 1 ("Who's the stool for?") — splice the reply like the button does.
  const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
  const c = panel.chapter.choices[0];
  panel.steps.splice(panel.stepIdx + 1, 0, ...c.reply.map((line) => ({ kind: 'line', line })));
  panel.stepIdx += 1;
  panel.refresh();
});
await shot(page, 'ch4-3-choice-reply');
await panelNext(page); // send line
await panelNext(page); // the task beat
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'begin', id: 'ch4' });
  window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false);
});
await page.waitForTimeout(800);

// LIVE glowkoi attempts; the koi shadow-timing may not cooperate headless —
// fall back to a seeded finish (noted in the digest) so the outro is real.
const koi = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const k = scene.map.nodes.filter((n) => n.kind === 'glowkoi');
  return k.length > 0 ? { id: k[0].id, x: k[0].x, y: k[0].y } : null;
});
let ch4Done = false;
if (koi !== null) {
  await walkTo(page, koi.x, koi.y);
  // The Skimnet must be IN HAND (hotbar slot 2) — gather validates it.
  await page.evaluate(() => window.__amperia.session.room.send('selectSlot', { slot: 2 }));
  for (let i = 0; i < 10 && !ch4Done; i++) {
    await page.evaluate(([id]) => {
      window.__amperia.session.room.send('gather', { nodeId: id });
    }, [koi.id]);
    await page.waitForTimeout(3000);
    const p = await page.evaluate(
      () => window.__amperia.game.scene.getScene('world').storyState?.chapters?.ch4?.progress ?? 0,
    );
    if (i === 2) {
      await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'barkeep'));
      await shot(page, 'ch4-4-task');
      await page.evaluate(() =>
        window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false),
      );
    }
    ch4Done = p >= 4;
  }
}
if (!ch4Done) {
  console.warn('koi timing did not cooperate — seeding the finish (digest-noted)');
  await page.close();
  await new Promise((r) => setTimeout(r, 2500));
  psql(
    `UPDATE "Character" SET "storyJson" = '{"chapters":{"ch1":{"state":"done","progress":10},"ch2":{"state":"done","progress":3},"ch3":{"state":"done","progress":5},"ch4":{"state":"task","progress":4}},"rodeTram":true}' WHERE "sparkName" = '${name}'`,
  );
  page = await openWorld(browser, auth.token, name);
  await walkTo(page, bar.x, bar.y + 1);
  await clearBanner(page);
}
await clearBanner(page);
await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'barkeep'));
await shot(page, 'ch4-5-outro');
await panelNext(page);
await panelNext(page);
await panelNext(page);
await panelNext(page); // the fourth outro line -> the keepsake beat
await shot(page, 'ch4-6-KEEPSAKE-CARD');
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'complete', id: 'ch4' });
  const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
  panel.mode = 'done';
  panel.refresh();
});
await shot(page, 'ch4-7-journal');
await page.evaluate(() => window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false));
await page.waitForTimeout(600);

// ── CH5 at Sable ────────────────────────────────────────────────────────────
const sable = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const m = scene.map.props.find((p) => p.kind === 'merchant');
  return { x: m.x, y: m.y };
});
await walkTo(page, sable.x, sable.y + 1);
await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'merchant'));
await shot(page, 'ch5-1-intro');
await panelNext(page);
await panelNext(page); // choice fork
await panelNext(page); // send
await panelNext(page); // task beat
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'begin', id: 'ch5' });
  window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false);
});
await page.waitForTimeout(800);

// REAL brass gathering to 8 (brassSeam, stall-recovery loop).
const seam = await page.evaluate(() => {
  const scene = window.__amperia.game.scene.getScene('world');
  const room = window.__amperia.session.room;
  const seams = scene.map.nodes.filter((n) => n.kind === 'brassSeam');
  const mobs = [];
  room.state.mobs.forEach((mv) => mobs.push({ x: mv.tileX, y: mv.tileY }));
  const mobDist = (n) =>
    mobs.length === 0 ? 999 : Math.min(...mobs.map((b) => Math.hypot(n.x - b.x, n.y - b.y)));
  let pool = seams.filter((n) => mobDist(n) >= 8);
  if (pool.length === 0) pool = seams;
  const me = room.state.players.get(room.sessionId);
  pool.sort(
    (a, b) =>
      Math.hypot(a.x - me.tileX, a.y - me.tileY) - Math.hypot(b.x - me.tileX, b.y - me.tileY),
  );
  return pool[0] ?? null;
});
if (seam === null) throw new Error('no brass seam');
await walkTo(page, seam.x, seam.y);
// The Drillhammer must be IN HAND (hotbar slot 1) for seams.
await page.evaluate(() => window.__amperia.session.room.send('selectSlot', { slot: 1 }));
const ch5Progress = () =>
  page.evaluate(
    () => window.__amperia.game.scene.getScene('world').storyState?.chapters?.ch5?.progress ?? 0,
  );
const sendSeam = () =>
  page.evaluate(([id]) => {
    window.__amperia.session.room.send('gather', { nodeId: id });
  }, [seam.id]);
await sendSeam();
let last = 0;
let stall = 0;
let mid5 = false;
for (let i = 0; i < 70; i++) {
  await page.waitForTimeout(3000);
  const p = await ch5Progress();
  if (p === last) {
    stall += 1;
    if (stall >= 3) {
      await sendSeam();
      stall = 0;
    }
  } else stall = 0;
  last = p;
  if (i % 4 === 0) console.log(`  ch5 progress ${p}/8`);
  if (!mid5 && p >= 3 && p < 8) {
    await shot(page, 'ch5-2-gathering');
    mid5 = true;
    await sendSeam();
  }
  if (p >= 8) break;
}
if ((await ch5Progress()) < 8) console.warn('ch5 never completed');

await walkTo(page, sable.x, sable.y + 1);
await clearBanner(page);
await page.evaluate(() => window.__amperia.session.events.emit('openStory', 'merchant'));
await shot(page, 'ch5-3-outro');
await panelNext(page);
await panelNext(page);
await panelNext(page);
await panelNext(page); // fourth outro line -> keepsake
await shot(page, 'ch5-4-KEEPSAKE-CARD');
await page.evaluate(() => {
  window.__amperia.session.room.send('story', { action: 'complete', id: 'ch5' });
  const panel = window.__amperia.game.scene.getScene('ui').storyPanel;
  panel.mode = 'done';
  panel.refresh();
});
await shot(page, 'ch5-5-journal');
await page.evaluate(() => window.__amperia.game.scene.getScene('ui').storyPanel.setVisible(false));
await page.waitForTimeout(500);
await page.keyboard.press('I');
await shot(page, 'ch5-6-pack-both-curios');

await browser.close();
console.log('story 4-5 shots complete.');
