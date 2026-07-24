/**
 * CITY TICKER BILLBOARD checkpoint — four shots:
 *   1 pretoken-board   THE TICKER / WAKES AT LAUNCH on the plaza board
 *   2 price-panel      the mock-fed $AMP price panel (24h dim rose)
 *   3 city-panel       SPARKS IN THE CITY — the live city count
 *   4 inspect-panel    E — Inspect: the City Board kit panel, open
 *
 * This driver OWNS the game server lifecycle: it restarts it without the
 * feed env (pre-token), then with MARKET_DATA_URL pointed at a local mock
 * DexScreener endpoint. Usage: node client/tests/billboard.mjs <outdir>
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.billboard-out';
const FEED_PORT = 9377;
const STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

// ── the mock market feed (DexScreener shape) ────────────────────────────────
const feed = http.createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      pairs: [
        {
          priceUsd: '0.0182',
          priceChange: { h24: -3.2 },
          marketCap: 18_200_000,
          liquidity: { usd: 250_000 },
        },
      ],
    }),
  );
});
await new Promise((r) => feed.listen(FEED_PORT, '127.0.0.1', r));

// ── game-server lifecycle ───────────────────────────────────────────────────
let serverProc = null;

async function startServer(extraEnv) {
  try {
    execSync('pkill -f "node server/dist/index.mjs"');
  } catch {
    /* none running */
  }
  await new Promise((r) => setTimeout(r, 1500));
  serverProc = spawn('node', ['server/dist/index.mjs'], {
    env: { ...process.env, ...extraEnv },
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${SERVER}/auth/nonce`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
  }
  throw new Error('game server never came up');
}

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

/** Pin the board to the panel whose caption matches, then repaint. */
const showPanel = (page, caption) =>
  page.evaluate(([cap]) => {
    const scene = window.__amperia.game.scene.getScene('world');
    for (let i = 0; i < 8; i++) {
      scene.boardIndex = i;
      scene.renderBoardFace();
      if (scene.boardFace?.caption.text === cap) return scene.boardFace.value.text;
    }
    return null;
  }, [caption]);

const photo = (page, tile, zoom, nameplates) =>
  page.evaluate(
    ([t, z, n]) => window.__amperia.photo.enter({ tile: t, zoom: z, nameplates: n }),
    [tile, zoom, nameplates],
  );
const photoExit = (page) => page.evaluate(() => window.__amperia.photo.exit());

const shoot = async (page, name) => {
  await page.waitForTimeout(700);
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

// ── 1: PRE-TOKEN — no feed env at all; the ticker rests ─────────────────────
await startServer({ MARKET_DATA_URL: '', AMP_TOKEN_ADDRESS: '' });
{
  const auth = await signIn();
  const page = await openWorld(browser, auth.token, `Gauge${Math.floor(Math.random() * 900) + 100}`);
  const v = await showPanel(page, 'THE TICKER');
  console.log(`  pre-token panel: ${v}`);
  await photo(page, { x: 29, y: 36 }, 2, false);
  await shoot(page, '1-pretoken-board');
  await photoExit(page);
  await page.close();
}

// ── 2-4: the mock feed wakes the ticker ─────────────────────────────────────
await startServer({
  MARKET_DATA_URL: `http://127.0.0.1:${FEED_PORT}/pair`,
  AMP_TOKEN_ADDRESS: '0x00000000000000000000000000000000000amp01',
});
{
  const auth = await signIn();
  const page = await openWorld(browser, auth.token, `Meter${Math.floor(Math.random() * 900) + 100}`);
  // The seed snapshot may predate the first fetch — wait for a live one.
  await page
    .waitForFunction(
      () => {
        const scene = window.__amperia.game.scene.getScene('world');
        return scene.market?.live === true;
      },
      null,
      { timeout: 90000, polling: 1000 },
    )
    .catch(() => console.warn('market snapshot never went live'));

  const price = await showPanel(page, '$AMP');
  console.log(`  price panel: ${price}`);
  await photo(page, { x: 29, y: 36 }, 2, false);
  await shoot(page, '2-price-panel');
  await photoExit(page);
  await page.waitForTimeout(300);

  const sparks = await showPanel(page, 'SPARKS IN THE CITY');
  console.log(`  city panel: ${sparks}`);
  await photo(page, { x: 29, y: 36 }, 2, false);
  await shoot(page, '3-city-panel');
  await photoExit(page);
  await page.waitForTimeout(300);

  // E — Inspect: open the kit panel over the plaza (the same event chain
  // the world interact fires: current state first, then the open).
  await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const ev = window.__amperia.session.events;
    if (scene.lastCharge != null) ev.emit('charge', { ...scene.lastCharge });
    if (scene.market != null) ev.emit('marketSync', scene.market);
    ev.emit('openBoard');
  });
  await shoot(page, '4-inspect-panel');
  await page.close();
}

await browser.close();
feed.close();
// Leave a NORMAL (pre-token) server running for whatever runs next.
await startServer({ MARKET_DATA_URL: '', AMP_TOKEN_ADDRESS: '' });
serverProc?.unref();
console.log('billboard shots complete.');
