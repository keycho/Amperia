/**
 * F4 — THE TEXT-OVERLAP DETECTOR (permanent regression test).
 *
 * Drives a scripted tour of every UI state (every panel, every Manifest tab,
 * tutorial HUD, toasts, and a dense market with nameplates + E-prompt +
 * speech bubbles at two zooms), pulls `window.__amperia.textAudit()` in each
 * state, and asserts:
 *   · zero intersections between visible texts that don't intentionally
 *     share a plate (explicit `overlapOk` tag pairs are the only exemption;
 *     an intersection fully covered by a plate BETWEEN the two texts is
 *     occlusion, not collision);
 *   · zero texts escaping their owning plate (kitPlate/chip/bubble/prompt
 *     rects, +2px tolerance);
 *   · texts ≥90% covered by a higher plate count as hidden;
 *   · a state that leaks an open panel into the next FAILS (state-leak) —
 *     leaked panels once masked the dense-market case entirely.
 *
 * Runs at 1280×720 and 1920×1080. Any failure = non-zero exit = red CI.
 *
 * Requirements: the dev stack must be up —
 *   server  http://localhost:2567   (node server/dist/index.mjs)
 *   client  http://localhost:5173   (npm run dev -w client)
 * Run: npm run test:overlap   (repo root)
 * Shots land in client/tests/.overlap-out/<res>/<state>.png (gitignored).
 */
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = process.env.AMPERIA_SERVER ?? 'http://localhost:2567';
const CLIENT = process.env.AMPERIA_CLIENT ?? 'http://localhost:5173';
const OUT = process.env.OVERLAP_OUT ?? 'client/tests/.overlap-out';
const RESOLUTIONS = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
];
const MANIFEST_PAGES = [
  'scavving', 'delving', 'skimming', 'tuning', 'gardens', 'mobs', 'errands', 'wardrobe',
];
const STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

// ── SIWE sign-in with a FRESH wallet (fresh Spark ⇒ tutorial HUD active) ────
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

async function openWorld(browser, viewport, token) {
  const page = await browser.newPage({ viewport: { width: viewport.w, height: viewport.h } });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(([t]) => {
    localStorage.setItem('amperia.token', t);
    localStorage.setItem('amperia.district', 'filament');
  }, [token]);
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, {
    timeout: 60000,
  });
  // First sign-in pops the DOM creator — step straight in.
  const stepIn = page.locator('button', { hasText: 'Step into the city' });
  try {
    await stepIn.waitFor({ state: 'visible', timeout: 6000 });
    await stepIn.click();
    await page.waitForTimeout(600);
  } catch {
    /* creator already passed on an earlier run of this wallet */
  }
  await page.waitForTimeout(1500);
  // Park the pointer mid-screen: a real pointermove, so edge-pan never runs.
  await page.mouse.move(Math.round(viewport.w / 2), Math.round(viewport.h * 0.55));
  return page;
}

/** Walk to the nearest WALKABLE tile at/around (tx,ty) — props aren't tiles
 *  you can stand on, so targets snap to an adjacent floor tile first. */
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
  if (target === null) {
    console.warn(`walkTo(${tx},${ty}): no walkable tile nearby`);
    return;
  }
  await page.evaluate(([x, y]) => {
    window.__amperia.session.room.send('move', { x, y });
  }, [target.x, target.y]);
  await page
    .waitForFunction(
      ([x, y]) => {
        const scene = window.__amperia.game.scene.getScene('world');
        const room = window.__amperia.session.room;
        const me = scene.sparks.get(room.sessionId);
        return me !== undefined && Math.abs(me.tile.x - x) <= 1 && Math.abs(me.tile.y - y) <= 1;
      },
      [target.x, target.y],
      { timeout: 25000 },
    )
    .catch(() => console.warn(`walkTo(${target.x},${target.y}) did not arrive — state may partial`));
}

// ── the assertions ──────────────────────────────────────────────────────────
const inset = (r, n) => ({ x: r.x + n, y: r.y + n, w: Math.max(0, r.w - 2 * n), h: Math.max(0, r.h - 2 * n) });
const interRect = (a, b) => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};
const overlapArea = (a, b) => {
  const r = interRect(a, b);
  return r === null ? 0 : r.w * r.h;
};
const contains = (outer, r) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const sameRect = (a, b) =>
  Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2;

function analyze(rep, state) {
  const fails = [];
  const texts = rep.texts.filter((t) => t.box.w > 0.5 && t.box.h > 0.5);
  const plateAbove = (p, t) => {
    if (p.scene !== t.scene) return p.scene === 'ui' && t.scene === 'world';
    if (t.clip !== null && sameRect(p, t.clip)) return false; // its own plate
    return p.depth >= t.depth;
  };
  const coverage = (t) => {
    const a = t.box.w * t.box.h;
    if (a <= 0) return 1;
    let best = 0;
    for (const p of rep.plates) {
      if (!plateAbove(p, t)) continue;
      best = Math.max(best, overlapArea(p, t.box) / a);
    }
    return best;
  };
  const vis = texts.filter((t) => coverage(t) < 0.9);

  for (const t of vis) {
    if (t.clip !== null && !contains(inset(t.clip, -2), t.box)) {
      fails.push({ state, kind: 'escapes-plate', text: t.text, box: t.box, clip: t.clip });
    }
  }
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i];
      const b = vis[j];
      if (a.overlapOk !== null && a.overlapOk === b.overlapOk) continue;
      if (a.scene !== b.scene) {
        // Text on a plate is visually separated from the world behind it.
        const ui = a.scene === 'ui' ? a : b;
        if (ui.clip !== null) continue;
      }
      const inter = interRect(inset(a.box, 1), inset(b.box, 1));
      if (inter === null || inter.w * inter.h <= 2) continue;
      // A plate BETWEEN the two texts (above one, not the other) covering the
      // whole intersection = occlusion, not collision — e.g. HUD text sliding
      // under a panel edge while the panel's own title sits on top of it.
      const separated = rep.plates.some(
        (p) =>
          overlapArea(p, inter) >= inter.w * inter.h * 0.95 &&
          plateAbove(p, a) !== plateAbove(p, b),
      );
      if (separated) continue;
      fails.push({ state, kind: 'text-overlap', a: a.text, b: b.text, boxA: a.box, boxB: b.box });
    }
  }
  return fails;
}

// ── the tour ────────────────────────────────────────────────────────────────
async function runTour(viewport) {
  const resTag = `${viewport.w}x${viewport.h}`;
  mkdirSync(`${OUT}/${resTag}`, { recursive: true });
  // Dev container ships chromium at /opt; CI sets PW_CHROMIUM ('' = let
  // playwright-core resolve its own installed browser).
  const exe =
    process.env.PW_CHROMIUM === undefined
      ? '/opt/pw-browsers/chromium'
      : process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch({ executablePath: exe });
  const authA = await signIn();
  const pageA = await openWorld(browser, viewport, authA.token);
  let pageB = null;
  const ensureB = async () => {
    if (pageB !== null) return pageB;
    const authB = await signIn();
    pageB = await openWorld(browser, viewport, authB.token);
    return pageB;
  };

  const allFails = [];
  const capture = async (state) => {
    await pageA.waitForTimeout(650);
    const rep = await pageA.evaluate(() => window.__amperia.textAudit());
    const fails = analyze(rep, `${resTag}/${state}`);
    allFails.push(...fails);
    await pageA.screenshot({ path: `${OUT}/${resTag}/${state}.png` });
    const mark = fails.length === 0 ? '✓' : `✗ ${fails.length}`;
    console.log(`  [${resTag}] ${state} ${mark} (${rep.texts.length} texts)`);
  };
  /** Close whatever the state opened and PROVE the table is clean — a leaked
   *  panel silently masks every later state's assertions (it happened: the
   *  Ledgerhouse leak blanked the dense-market case on the first run). */
  const teardown = async (state) => {
    for (let i = 0; i < 3; i++) {
      const open = await pageA.evaluate(() => window.__amperia.session.panelOpen);
      if (!open) break;
      await pageA.keyboard.press('Escape');
      await pageA.waitForTimeout(150);
    }
    const leaked = await pageA.evaluate(() => {
      if (!window.__amperia.session.panelOpen) return null;
      const ui = window.__amperia.game.scene.getScene('ui');
      const names = [];
      for (const k of ['merchantPanel','benchPanel','questPanel','tradePanel','shopPanel','chargePanel','manifestPanel','goalPanel','bankPanel','worldMapPanel','howToPlayPanel','skillsPanel','foundryPanel','inventoryPanel']) {
        if (ui[k]?.visible === true) {
          names.push(k);
          ui[k].setVisible(false); // force-close so later states stay honest
        }
      }
      return names;
    });
    if (leaked !== null && leaked.length > 0) {
      allFails.push({ state: `${resTag}/${state}`, kind: 'state-leak', panels: leaked });
      console.log(`  [${resTag}] ${state} ✗ state-leak: ${leaked.join(', ')}`);
    }
  };

  // 1 — HUD base (fresh Spark ⇒ FIRST BOLTS tutorial tracker is live).
  await capture('hud-base');

  // 2 — stacked toasts.
  await pageA.evaluate(() => {
    const s = window.__amperia.session;
    s.events.emit('notice', 'The tram conductor waves you through.');
    s.events.emit('notice', 'A Warmcup would take the edge off.');
    s.events.emit('notice', 'The Dynamo hums a little brighter.');
  });
  await capture('toasts');
  await pageA.waitForTimeout(2500); // let toasts drain

  // 3 — keyboard panels.
  for (const [state, key] of [
    ['inventory', 'i'],
    ['skills', 'k'],
    ['goals', 'g'],
    ['map', 'Tab'],
  ]) {
    await pageA.keyboard.press(key);
    await capture(state);
    await teardown(state);
  }

  // 4 — how-to-play (no direct key; open it as the ? button would).
  await pageA.evaluate(() => {
    window.__amperia.game.scene.getScene('ui').howToPlayPanel.setVisible(true);
  });
  await capture('howtoplay');
  await teardown('howtoplay');

  // 5 — the Manifest, every tab (the tab row + flow layout under test).
  await pageA.keyboard.press('j');
  await pageA.waitForTimeout(300);
  for (const pg of MANIFEST_PAGES) {
    await pageA.evaluate(([p]) => {
      const ui = window.__amperia.game.scene.getScene('ui');
      ui.manifestPanel.page = p;
      ui.manifestPanel.tabStart = 0;
      ui.manifestPanel.refresh();
    }, [pg]);
    await capture(`manifest-${pg}`);
  }
  await teardown('manifest');

  // 6 — event-opened panels.
  for (const [state, ev] of [
    ['merchant', 'openMerchant'],
    ['bench', 'openBench'],
    ['quests', 'openQuests'],
    ['foundry', 'openFoundry'],
  ]) {
    await pageA.evaluate(([e]) => {
      window.__amperia.session.events.emit(e);
    }, [ev]);
    await capture(state);
    await teardown(state);
  }

  // 7 — the Citywide Charge panel (server-answered).
  await pageA.evaluate(() => {
    window.__amperia.session.room.send('chargeInfo', {});
  });
  await capture('charge');
  await teardown('charge');

  // 8 — walk to the market stalls; browse one (server checks proximity).
  const spot = await pageA.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const stall = scene.map.props.find((p) => p.kind === 'stall');
    const merchant = scene.map.props.find((p) => p.kind === 'merchant');
    const stallIdx =
      stall === undefined
        ? 0
        : scene.map.shopStalls.findIndex((s) => s.x === stall.x && s.y === stall.y);
    return { stall, merchant, stallIdx: Math.max(0, stallIdx) };
  });
  if (spot.stall !== undefined) {
    await walkTo(pageA, spot.stall.x, spot.stall.y + spot.stall.h);
    await pageA.evaluate(([id]) => {
      window.__amperia.session.room.send('shop', { action: 'browse', stallId: id });
    }, [spot.stallIdx]);
    await capture('shop-browse');
    await teardown('shop-browse');

    // 9 — the DENSE MARKET case (catches stack-rule violations): A at the
    // stall with the E-prompt up (stall label yields), the merchant speaking
    // (label yields), B beside A chatting (bubble suppresses B's nameplate) —
    // at zoom 1 and at min zoom (counter-scaled text is the bigger risk).
    const b = await ensureB();
    const aTile = await pageA.evaluate(() => {
      const scene = window.__amperia.game.scene.getScene('world');
      return scene.sparks.get(window.__amperia.session.room.sessionId).tile;
    });
    await walkTo(b, aTile.x - 2, aTile.y + 1);
    const speak = () =>
      pageA.evaluate(() => {
        const scene = window.__amperia.game.scene.getScene('world');
        const m = scene.map.props.find((p) => p.kind === 'merchant');
        if (m !== undefined) {
          const a = scene.propAnchor(m);
          scene.speakNpc('merchant', a.x, a.y, 'Fresh Salvage? I weigh it fair, love.');
        }
      });
    await speak();
    await b.evaluate(() => {
      window.__amperia.session.room.send('chat', { text: 'holding the market down tonight' });
    });
    await capture('dense-market-zoom1');
    await pageA.mouse.wheel(0, 120); // → 0.5
    await pageA.waitForTimeout(400);
    await speak();
    await b.evaluate(() => {
      window.__amperia.session.room.send('chat', { text: 'plenty of glow to go around' });
    });
    await capture('dense-market-zoom05');
    await pageA.mouse.wheel(0, -120); // back to 1
    await pageA.waitForTimeout(400);

    // 10 — trade (panels on both ends; audit A's side). B is already close.
    const bSession = await b.evaluate(() => window.__amperia.session.room.sessionId);
    await pageA.evaluate(([sid]) => {
      window.__amperia.session.room.send('ptrade', { action: 'request', targetSessionId: sid });
    }, [bSession]);
    await b.waitForTimeout(700);
    await b.evaluate(() => {
      const ui = window.__amperia.game.scene.getScene('ui');
      const id = ui.tradePanel.tradeId ?? null;
      if (id !== null) {
        window.__amperia.session.room.send('ptrade', { action: 'accept', tradeId: id });
      }
    });
    await capture('trade');
    await teardown('trade');
    await b.keyboard.press('Escape');
  }

  // 11 — the Ledgerhouse bank, LAST (deep walk; nothing runs after it).
  const bankTile = await pageA.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    return scene.map.bankInterior[0] ?? null;
  });
  if (bankTile !== null) {
    await walkTo(pageA, bankTile.x, bankTile.y);
    await pageA.evaluate(() => {
      window.__amperia.session.room.send('bank', { action: 'open' });
    });
    await capture('bank');
    await teardown('bank');
  }

  await browser.close();
  return allFails;
}

// ── main ────────────────────────────────────────────────────────────────────
const t0 = Date.now();
try {
  await fetch(`${SERVER}/health`);
} catch {
  console.error(`overlap tour: server not reachable at ${SERVER} — start it first`);
  process.exit(2);
}
let failures = [];
for (const res of RESOLUTIONS) {
  console.log(`— tour at ${res.w}×${res.h} —`);
  failures = failures.concat(await runTour(res));
}
await writeFile(`${OUT}/failures.json`, JSON.stringify(failures, null, 2));
console.log(`\ntour done in ${Math.round((Date.now() - t0) / 1000)}s — ${failures.length} overlap failure(s)`);
if (failures.length > 0) {
  for (const f of failures.slice(0, 30)) console.log(' ', JSON.stringify(f));
  process.exit(1);
}
