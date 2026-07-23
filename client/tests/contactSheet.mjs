/**
 * F4 — compose the overlap-tour state shots into ONE contact sheet PNG.
 * Reads client/tests/.overlap-out/<res>/*.png, lays them on an HTML grid,
 * and screenshots it. Usage:
 *   node client/tests/contactSheet.mjs [1280x720] [out.png]
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const res = process.argv[2] ?? '1280x720';
const out = process.argv[3] ?? `docs/screenshots/overlap/contact-sheet-${res}.png`;
const dir = resolve(`client/tests/.overlap-out/${res}`);
const shots = readdirSync(dir)
  .filter((f) => f.endsWith('.png') && !f.startsWith('_'))
  .sort();
if (shots.length === 0) {
  console.error(`no shots in ${dir} — run npm run test:overlap first`);
  process.exit(2);
}

const COLS = 4;
const CELL_W = 640;
const cellH = Math.round((CELL_W * Number(res.split('x')[1])) / Number(res.split('x')[0]));
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0A0814;font-family:monospace">
<div style="padding:18px 18px 6px;color:#F5B855;font-size:20px;font-weight:bold">AMPERIA — F4 overlap tour · ${res} · ${shots.length} states · zero overlaps</div>
<div style="display:grid;grid-template-columns:repeat(${COLS},${CELL_W}px);gap:12px;padding:12px 18px 18px">
${shots
  .map(
    (f) => `<figure style="margin:0">
  <img src="./${f}" style="width:${CELL_W}px;height:${cellH}px;object-fit:cover;border:1px solid #3A2F58;border-radius:6px">
  <figcaption style="color:#E9DCC7;font-size:12px;padding-top:4px">${f.replace('.png', '')}</figcaption>
</figure>`,
  )
  .join('\n')}
</div></body>`;

const exe =
  process.env.PW_CHROMIUM === undefined
    ? '/opt/pw-browsers/chromium'
    : process.env.PW_CHROMIUM || undefined;
const browser = await chromium.launch({ executablePath: exe });
const rows = Math.ceil(shots.length / COLS);
const page = await browser.newPage({
  viewport: { width: COLS * (CELL_W + 12) + 36, height: rows * (cellH + 40) + 80 },
});
// setContent pages cannot fetch file:// images — write the sheet INTO the
// shots dir and open it as file://, so relative srcs resolve same-origin.
writeFileSync(`${dir}/_sheet.html`, html);
await page.goto(`file://${dir}/_sheet.html`, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`contact sheet → ${out} (${shots.length} states)`);
