/**
 * WORLD MAP block checkpoint driver — opens the TAB map and screenshots it.
 * Usage: node client/tests/mapshot.mjs [outdir] [hoverIsland]
 *   outdir       where shots land (default client/tests/.map-out)
 *   hoverIsland  district id to hover before the shot (M3+), or "none"
 * Shoots at 1280×720 and 1920×1080.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SERVER = 'http://localhost:2567';
const CLIENT = 'http://localhost:5173';
const OUT = process.argv[2] ?? 'client/tests/.map-out';
const HOVER = process.argv[3] ?? 'none';
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

async function shoot(browser, vp, token) {
  const tag = `${vp.w}x${vp.h}`;
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
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
    await page.locator('input[type="text"]').first().fill(`Mapper${Math.floor(Math.random() * 9000)}`);
    await stepIn.click();
    await stepIn.waitFor({ state: 'detached', timeout: 10000 });
  } catch { /* returning wallet */ }
  await page.waitForTimeout(1500);
  await page.mouse.move(Math.round(vp.w / 2), Math.round(vp.h * 0.6));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  if (HOVER !== 'none') {
    const pt = await page.evaluate(([d]) => {
      const ui = window.__amperia.game.scene.getScene('ui');
      return ui.worldMapPanel.islandScreenPoint?.(d) ?? null;
    }, [HOVER]);
    if (pt !== null) {
      await page.mouse.move(Math.round(pt.x), Math.round(pt.y));
      await page.waitForTimeout(500);
    } else {
      console.warn(`hover: islandScreenPoint('${HOVER}') unavailable`);
    }
  }
  await page.screenshot({ path: `${OUT}/map-${tag}${HOVER !== 'none' ? '-hover' : ''}.png` });
  console.log(`  📷 map-${tag}${HOVER !== 'none' ? '-hover' : ''}`);
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const auth = await signIn();
await shoot(browser, { w: 1280, h: 720 }, auth.token);
await shoot(browser, { w: 1920, h: 1080 }, auth.token);
await browser.close();
console.log('map shots complete.');
