/**
 * THE GOLDEN DARK (art v3) — same-angle grade shots. Fixed camera anchors,
 * NEVER change these between a before and an after:
 *   dynamo-wide    the Dynamo plaza, wide (the banner's subject)
 *   market-street  the Nightstalls row, mid
 *   stacks-canyon  a Stacks tower canyon
 *   backstreet     a quiet, lamp-poor Filament back street
 * Usage: node client/tests/gradeshots.mjs <outdir> <prefix>
 *   e.g. ... .grade-out before   |   ... .grade-out after-au1
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.grade-out';
const PREFIX = process.argv[3] ?? 'shot';
const STATEMENT =
  'Sign in to AMPERIA. This proves you control this wallet — it costs nothing and moves no funds.';

/** LOCKED anchors (tile + zoom). Filament unless noted. */
const ANGLES = [
  { name: 'dynamo-wide', district: 'filament', tile: { x: 33, y: 34 }, zoom: 1 },
  { name: 'market-street', district: 'filament', tile: { x: 30, y: 44 }, zoom: 2 },
  { name: 'stacks-canyon', district: 'stacks', tile: { x: 20, y: 24 }, zoom: 1 },
  { name: 'backstreet', district: 'filament', tile: { x: 46, y: 16 }, zoom: 2 },
];

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

for (const district of ['filament', 'stacks']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(([t, d]) => {
    localStorage.setItem('amperia.token', t);
    localStorage.setItem('amperia.district', d);
    localStorage.setItem('amperia.howtoplay.seen', '1');
    localStorage.setItem('amperia.firstloop.done', '1');
  }, [auth.token, district]);
  await page.goto(CLIENT, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__amperia?.session?.room != null, null, {
    timeout: 60000,
  });
  const stepIn = page.locator('button', { hasText: 'Step into the city' });
  try {
    await stepIn.waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('input[type="text"]').first().fill(`Grade${Math.floor(Math.random() * 9000)}`);
    await stepIn.click();
    await stepIn.waitFor({ state: 'detached', timeout: 10000 });
  } catch {
    /* returning */
  }
  await page.waitForTimeout(2500);
  await page.bringToFront();
  for (const a of ANGLES.filter((x) => x.district === district)) {
    await page.evaluate(([t, z]) => {
      window.__amperia.photo.enter({ tile: t, zoom: z });
    }, [a.tile, a.zoom]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${PREFIX}-${a.name}.png` });
    console.log(`  📷 ${PREFIX}-${a.name}`);
    await page.evaluate(() => window.__amperia.photo.exit());
    await page.waitForTimeout(300);
  }
  await page.close();
}
await browser.close();
console.log('grade shots complete.');
