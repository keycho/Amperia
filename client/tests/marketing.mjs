/**
 * The v3-final six-shot marketing set (GOLDEN DARK grade):
 *   1 title           the entry screen, fresh visitor
 *   2 market-night    the Nightstalls row, photo mode
 *   3 foundry         the Cosmetic Foundry showcase open over the market
 *   4 plaza           the Dynamo plaza, wide
 *   5 roofline-vista  the Stacks, high wide vista over the rooflines
 *   6 ledger          the Ledgerhouse hall
 * World shots 2560x1440 via photo mode; title + foundry 1920x1080 (UI on).
 * Usage: node client/tests/marketing.mjs [outdir]   (dev stack must be up)
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'docs/screenshots/marketing';
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

async function openWorld(browser, token, district, viewport, name) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(([t, d]) => {
    localStorage.setItem('amperia.token', t);
    localStorage.setItem('amperia.district', d);
    localStorage.setItem('amperia.howtoplay.seen', '1');
    localStorage.setItem('amperia.firstloop.done', '1');
  }, [token, district]);
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, {
    timeout: 60000,
  });
  const stepIn = page.locator('button', { hasText: 'Step into the city' });
  try {
    await stepIn.waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('input[type="text"]').first().fill(name);
    await stepIn.click();
    await stepIn.waitFor({ state: 'detached', timeout: 10000 });
  } catch {
    /* returning */
  }
  await page.waitForTimeout(2500);
  await page.bringToFront();
  return page;
}

const photo = async (page, tile, zoom, path) => {
  await page.evaluate(([t, z]) => window.__amperia.photo.enter({ tile: t, zoom: z }), [tile, zoom]);
  // The 6Hz nameplate fade lags the slow headless clock — clear it directly.
  await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    for (const [, sp] of scene.sparks) sp.setNameFade(0);
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path });
  await page.evaluate(() => window.__amperia.photo.exit());
  await page.waitForTimeout(300);
  console.log(`  📷 ${path.split('/').pop()}`);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const auth = await signIn();
const SPARK = `Keyart${Math.floor(Math.random() * 9000)}`;

// ── 2/3/4/6: the Filament ───────────────────────────────────────────────────
{
  const page = await openWorld(
    browser,
    auth.token,
    'filament',
    { width: 2560, height: 1440 },
    SPARK,
  );
  const spots = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const find = (k) => scene.map.props.find((p) => p.kind === k);
    const m = find('merchant');
    const d = find('dynamo');
    const b = find('ledgerhouse');
    return {
      market: { x: m.x, y: m.y + 2 },
      plaza: { x: d.x + 1, y: d.y + 5 },
      bank: { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) },
    };
  });
  await photo(page, spots.market, 2, `${OUT}/market-night.png`);
  await photo(page, spots.plaza, 1, `${OUT}/plaza.png`);
  await photo(page, spots.bank, 3, `${OUT}/ledger.png`);
  await page.close();

  // Foundry: UI on, the showcase open over the market lane (1920x1080).
  const fpage = await openWorld(
    browser,
    auth.token,
    'filament',
    { width: 1920, height: 1080 },
    SPARK,
  );
  await fpage.evaluate(() => {
    const ui = window.__amperia.game.scene.getScene('ui');
    ui.banner?.destroy();
    ui.banner = null;
    window.__amperia.session.events.emit('openFoundry');
  });
  await fpage.waitForTimeout(1200);
  await fpage.screenshot({ path: `${OUT}/foundry.png` });
  console.log('  📷 foundry.png');
  await fpage.close();
}

// ── N4d: the fishing water — a glowkoi spot framed close ────────────────────
{
  const page = await openWorld(
    browser,
    auth.token,
    'filament',
    { width: 2560, height: 1440 },
    SPARK,
  );
  const koi = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const k = scene.map.nodes.filter((n) => n.kind === 'glowkoi');
    return k.length > 0 ? { x: k[0].x, y: k[0].y } : null;
  });
  if (koi !== null) await photo(page, koi, 3, `${OUT}/fishing-spot.png`);
  else console.warn('no glowkoi node found');
  await page.close();
}

// ── N4d: the Underworks lift landing (own account — the previous page's
// seat can linger a beat and one Spark holds one seat) ──────────────────────
{
  const auth2 = await signIn();
  const page = await openWorld(
    browser,
    auth2.token,
    'underworks',
    { width: 2560, height: 1440 },
    SPARK,
  );
  await photo(page, { x: 6, y: 20 }, 2, `${OUT}/underworks-lift.png`);
  await page.close();
}

// ── 5: the Stacks roofline vista ────────────────────────────────────────────
{
  const page = await openWorld(
    browser,
    auth.token,
    'stacks',
    { width: 2560, height: 1440 },
    SPARK,
  );
  const mid = await page.evaluate(() => {
    const scene = window.__amperia.game.scene.getScene('world');
    const size = scene.map.walkable.length;
    return { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  });
  await photo(page, mid, 1, `${OUT}/roofline-vista.png`);
  await page.close();
}

// ── the title screen LAST — its backdrop (client/public/title-bg.jpg) is
// regenerated from the fresh plaza render before this runs.
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForTimeout(6000); // the entry screen settles (headless clock)
  await page.screenshot({ path: `${OUT}/title.png` });
  console.log('  📷 title.png');
  await page.close();
}

await browser.close();
console.log('marketing set complete.');
