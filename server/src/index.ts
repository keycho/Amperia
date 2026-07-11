import 'dotenv/config';
import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { SPARK_NAME_RE } from '@shared/appearance';
import { authRateOk, initOps } from './services/ops.js';
import { guestJoin, linkWallet, loginEmail, registerEmail, verifyToken } from './services/auth.js';
import { computeTodayMetrics, scheduleNightlyRollup } from './services/metrics.js';
import { prisma } from './services/db.js';
import { FilamentRoom } from './rooms/FilamentRoom.js';
import { StacksRoom } from './rooms/StacksRoom.js';
import { TerrariumRoom } from './rooms/TerrariumRoom.js';
import { TangleRoom } from './rooms/TangleRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

// H4 ops: rotating structured logs + crash/restart alerts, installed
// before anything else can log or throw.
initOps();

const app = express();
app.use(cors());
app.use(express.json());

// H4: auth endpoints get a per-IP sliding-window rate limit.
app.use('/auth', (req, res, next) => {
  if (!authRateOk(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many attempts — take a breath and try again.' });
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, city: 'AMPERIA' });
});

/**
 * Internal economy dashboard (E4) — DEV ONLY. In production it stays off
 * unless METRICS_KEY is set and matched (?key=…). Shows today-so-far
 * faucets vs sinks per source, supply health, trade volume + anomalies,
 * Charge donations, and NPC band positions, plus the nightly rollups.
 */
app.get('/metrics', (req, res) => {
  const key = process.env.METRICS_KEY;
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (key === undefined || req.query.key !== key)) {
    res.status(404).end();
    return;
  }
  void (async () => {
    try {
      const m = await computeTodayMetrics(Date.now());
      const history = await prisma.economySummary.findMany({
        orderBy: { date: 'desc' },
        take: 14,
      });
      const rows = (o: Record<string, number>) =>
        Object.entries(o)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`)
          .join('');
      const bandRows = Object.entries(m.bands)
        .map(
          ([r, b]) =>
            `<tr><td>${r}</td><td class="n">${b.unit}</td><td class="n">${b.floor}–${b.ceiling}</td><td class="n">${b.pressure}</td></tr>`,
        )
        .join('');
      const histRows = history
        .map(
          (h) =>
            `<tr><td>${h.date}</td><td class="n">${h.faucetBolts}</td><td class="n">${h.sinkBolts}</td><td class="n">${h.netBolts}</td><td class="n">${h.growthPct}%</td><td class="n">${h.tradeCount}</td><td class="n">${h.anomalyCount}</td><td class="n">${h.shopVolumeBolts}</td><td class="n">${h.chargeAmperite}</td></tr>`,
        )
        .join('');
      res.type('html').send(`<!doctype html><meta charset="utf-8">
<title>AMPERIA — economy metrics</title>
<style>
  body{background:#17131f;color:#e8d9c3;font:13px/1.5 monospace;padding:24px;max-width:900px;margin:auto}
  h1{color:#f5b855;font-size:18px} h2{color:#6fd6c8;font-size:14px;margin-top:26px}
  table{border-collapse:collapse;margin-top:6px} td,th{padding:2px 14px 2px 0;text-align:left}
  .n{text-align:right;color:#f5b855} .muted{color:#9b8ba3}
  .big{font-size:15px;color:#f5b855}
</style>
<h1>⚙ AMPERIA economy — ${m.date} (UTC, so far)</h1>
<p class="big">faucets ${m.faucetBolts} B · sinks ${m.sinkBolts} B · net ${m.netBolts >= 0 ? '+' : ''}${m.netBolts} B
 (${m.growthPct}% of the ${m.supplyBolts} B supply)</p>
<p class="muted">${m.playerCount} Sparks · median ${m.medianBolts} B · P90 ${m.p90Bolts} B</p>
<h2>faucets (Bolts created)</h2><table>${rows(m.faucets) || '<tr><td class="muted">quiet so far</td></tr>'}</table>
<h2>sinks (Bolts destroyed)</h2><table>${rows(m.sinks) || '<tr><td class="muted">quiet so far</td></tr>'}</table>
<h2>player trade</h2>
<table>
<tr><td>direct trades</td><td class="n">${m.tradeCount}</td></tr>
<tr><td>direct-trade est. volume</td><td class="n">${m.tradeVolumeEst} B</td></tr>
<tr><td>shop-stall volume (gross)</td><td class="n">${m.shopVolumeBolts} B</td></tr>
<tr><td>anomaly rows</td><td class="n">${m.anomalyCount}</td></tr>
</table>
<h2>the Citywide Charge</h2>
<table><tr><td>Amperite donated today</td><td class="n">${m.chargeAmperite}</td></tr></table>
<h2>NPC band positions</h2>
<table><tr><th>resource</th><th>unit</th><th>band</th><th>pressure</th></tr>${bandRows}</table>
<h2>nightly rollups (last 14)</h2>
<table><tr><th>date</th><th>faucets</th><th>sinks</th><th>net</th><th>growth</th><th>trades</th><th>anomalies</th><th>shop vol</th><th>charge</th></tr>
${histRows || '<tr><td class="muted" colspan="9">none yet — the first rollup lands at UTC midnight</td></tr>'}</table>`);
    } catch (err) {
      console.error('[metrics] page failed', err);
      res.status(500).json({ error: 'metrics failed' });
    }
  })();
});

type Handler = (body: Record<string, unknown>) => Promise<unknown>;
const post = (path: string, handler: Handler) => {
  app.post(path, (req, res) => {
    void (async () => {
      try {
        const result = await handler((req.body ?? {}) as Record<string, unknown>);
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Request failed.' });
      }
    })();
  });
};

// U2d: live name availability for the creator (rate-limited with /auth).
app.get('/auth/name-check', (req, res) => {
  void (async () => {
    const name = String(req.query.name ?? '').trim();
    if (!SPARK_NAME_RE.test(name)) {
      res.json({ available: false });
      return;
    }
    const hit = await prisma.character.findFirst({
      where: { sparkName: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    res.json({ available: hit === null });
  })().catch(() => res.status(500).json({ available: false }));
});

post('/auth/register', (b) =>
  registerEmail(String(b.email ?? ''), String(b.password ?? ''), String(b.sparkName ?? '')),
);
post('/auth/login', (b) => loginEmail(String(b.email ?? ''), String(b.password ?? '')));
post('/auth/guest', (b) =>
  guestJoin(typeof b.sparkName === 'string' && b.sparkName !== '' ? b.sparkName : undefined),
);
post('/auth/link-wallet', async (b) => {
  const auth = verifyToken(String(b.token ?? ''));
  await linkWallet(
    auth.accountId,
    String(b.walletAddress ?? ''),
    String(b.message ?? ''),
    String(b.signature ?? ''),
  );
  return { linked: true };
});

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('filament', FilamentRoom);
gameServer.define('tangle', TangleRoom);
gameServer.define('stacks', StacksRoom);
gameServer.define('terrarium', TerrariumRoom);

// Railway (and most PaaS) assign PORT and route to all interfaces; binding
// 0.0.0.0 explicitly keeps this from ever resolving to loopback-only.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[amperia] server listening on 0.0.0.0:${PORT} — keep the city lit`);
});

// The nightly economy rollup (E4b): one EconomySummary row per UTC day —
// the data spine of the future City Ledger.
scheduleNightlyRollup();
