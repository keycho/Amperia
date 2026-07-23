/**
 * GROUNDING block checkpoint driver — same-angle photo-mode shots of the
 * market street and a quiet back street at 100% zoom (fixed tiles, so
 * before/after pairs align pixel-true), plus a storefront close-up (G3).
 * Usage: node client/tests/groundshot.mjs <outdir> <prefix>
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.ground-out';
const PREFIX = process.argv[3] ?? 'shot';
const STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

/** Fixed camera anchors (Filament tiles) — NEVER change these between a
 *  before and an after run; the pairs must align. */
const ANGLES = (process.env.GROUND_ANGLES ?? 'market-street:merchant:1,back-street:backstreet:1,storefront:ledgerhouse:2')
  .split(',')
  .map((spec) => {
    const [name, probe, zoom] = spec.split(':');
    return { name, probe, zoom: Number(zoom) };
  });

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

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const auth = await signIn();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
await page.addInitScript(([t]) => {
  localStorage.setItem('amperia.token', t);
  localStorage.setItem('amperia.district', 'filament');
  localStorage.setItem('amperia.howtoplay.seen', '1');
  localStorage.setItem('amperia.firstloop.done', '1');
}, [auth.token]);
await page.goto(CLIENT, { waitUntil: 'load' });
await page.waitForFunction(() => window.__amperia?.session?.room != null, null, { timeout: 60000 });
const stepIn = page.locator('button', { hasText: 'Step into the city' });
try {
  await stepIn.waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('input[type="text"]').first().fill(`Ground${Math.floor(Math.random() * 9000)}`);
  await stepIn.click();
  await stepIn.waitFor({ state: 'detached', timeout: 10000 });
} catch { /* returning wallet */ }
await page.waitForTimeout(2000);

for (const a of ANGLES) {
  const tile = await page.evaluate(([probe]) => {
    const scene = window.__amperia.game.scene.getScene('world');
    const m = scene.map;
    if (probe !== 'backstreet') {
      const p = m.props.find((pr) => pr.kind === probe);
      return p === undefined ? null : { x: Math.round(p.x + p.w / 2), y: Math.round(p.y + p.h + 2) };
    }
    // backstreet: the walkable tile FARTHEST from plaza+merchant+dynamo in
    // the north-east quadrant — deterministic, quiet, lamp-poor.
    const anchors = [
      { x: m.plaza.cx, y: m.plaza.cy },
      ...m.props.filter((p) => p.kind === 'merchant' || p.kind === 'dynamo').map((p) => ({ x: p.x, y: p.y })),
    ];
    let best = null;
    let bestD = -1;
    for (let y = 8; y < m.size / 2; y++) {
      for (let x = m.size / 2; x < m.size - 8; x++) {
        if (m.walkable[y]?.[x] !== true) continue;
        const d = Math.min(...anchors.map((an) => Math.hypot(an.x - x, an.y - y)));
        if (d > bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }, [a.probe]);
  if (tile === null) {
    console.warn(`no tile for ${a.name}`);
    continue;
  }
  await page.evaluate(([t, z]) => {
    window.__amperia.photo.enter({ tile: t, zoom: z });
  }, [tile, a.zoom]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${PREFIX}-${a.name}.png` });
  console.log(`  📷 ${PREFIX}-${a.name} @ (${tile.x},${tile.y}) z${a.zoom}`);
  await page.evaluate(() => window.__amperia.photo.exit());
  await page.waitForTimeout(300);
}
await browser.close();
console.log('ground shots complete.');
