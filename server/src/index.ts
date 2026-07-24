import 'dotenv/config';
// Fail-fast env contract — must evaluate before any module opens a DB or
// Redis handle (ESM side-effect imports run in declaration order).
import './services/env.js';
import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { SPARK_NAME_RE } from '@shared/appearance';
import { authRateOk, initOps } from './services/ops.js';
import { allowedOrigin } from './services/origins.js';
import { redis, redisHealthy } from './services/redis.js';
import { authenticateWallet } from './services/auth.js';
import { issueNonce } from './services/siwe.js';
import { computeTodayMetrics, scheduleNightlyRollup } from './services/metrics.js';
import { marketData } from './services/marketdata.js';
import { computePublicStatsResponse } from './services/publicStats.js';
import { renderLedgerPage } from './services/ledgerPage.js';
import { prisma } from './services/db.js';
import { FilamentRoom } from './rooms/FilamentRoom.js';
import { StacksRoom } from './rooms/StacksRoom.js';
import { TerrariumRoom } from './rooms/TerrariumRoom.js';
import { UnderworksRoom } from './rooms/UnderworksRoom.js';
import { TangleRoom } from './rooms/TangleRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

// H4 ops: rotating structured logs + crash/restart alerts, installed
// before anything else can log or throw.
initOps();

const app = express();
// D4: one origin policy for everything — CORS headers only for allow-listed
// origins, and browser requests from anywhere else are rejected outright
// (not just left without CORS headers). WS upgrades enforce the same
// predicate below. Origin-less requests (curl, healthchecks) pass.
app.use(cors({ origin: (origin, cb) => cb(null, allowedOrigin(origin)) }));
// P1/P2: the public ledger surfaces are aggregate, non-personal, read-only —
// they are exempt from the origin allow-list so any browser (the /ledger page
// itself, a marketing page) can read them; each sets its own permissive CORS.
const PUBLIC_PATHS = ['/api/public-stats', '/ledger'];
const isPublicPath = (p: string): boolean =>
  PUBLIC_PATHS.some((base) => p === base || p.startsWith(`${base}/`));
app.use((req, res, next) => {
  if (isPublicPath(req.path)) {
    next();
    return;
  }
  if (!allowedOrigin(req.headers.origin)) {
    res.status(403).json({ error: 'Origin not allowed.' });
    return;
  }
  next();
});
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
 * Deploy healthcheck (D3) — Railway polls this path. 200 only when the
 * process can actually serve players: DB answering, and Redis answering if
 * one is configured (REDIS_URL unset ⇒ reported "off", still healthy).
 */
const VERSION = process.env.npm_package_version ?? '0.0.0';
const COMMIT =
  process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? 'unknown';
const within = <T>(ms: number, p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref()),
  ]);

app.get('/healthz', (_req, res) => {
  void (async () => {
    const db = await within(2500, prisma.$queryRaw`SELECT 1`).then(
      () => 'ok' as const,
      () => 'fail' as const,
    );
    const redisState =
      redis === null
        ? ('off' as const)
        : await within(2500, redisHealthy()).then(
            (up) => (up ? ('ok' as const) : ('fail' as const)),
            () => 'fail' as const,
          );
    const ok = !shuttingDown && db === 'ok' && redisState !== 'fail';
    res.status(ok ? 200 : 503).json({
      ok,
      version: VERSION,
      commit: COMMIT,
      uptime: Math.round(process.uptime()),
      db,
      redis: redisState,
    });
  })().catch(() => res.status(503).json({ ok: false }));
});

/**
 * PUBLIC STATS (P1) — aggregate, non-personal city numbers. No auth, cached
 * 60s in-memory, permissive CORS so a marketing page can read it too. The
 * response shape is the shared PublicStatsResponse contract (P3). On a DB
 * hiccup we serve the last good snapshot rather than an error, so the public
 * dashboard never flashes broken.
 */
let statsCache: { at: number; body: unknown } | null = null;
async function publicStatsBody(): Promise<unknown> {
  const now = Date.now();
  if (statsCache !== null && now - statsCache.at < 60_000) return statsCache.body;
  const body = await computePublicStatsResponse(now);
  statsCache = { at: now, body };
  return body;
}

app.get('/api/public-stats', (_req, res) => {
  void (async () => {
    try {
      const body = await publicStatsBody();
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=60');
      res.json(body);
    } catch (err) {
      console.error('[public-stats] failed', err);
      if (statsCache !== null) {
        res.set('Access-Control-Allow-Origin', '*');
        res.json(statsCache.body);
      } else {
        res.status(503).json({ error: 'stats unavailable' });
      }
    }
  })();
});

// The public City Ledger dashboard (P2). Server-rendered from the same shared
// helpers so the tiles never drift from /api/public-stats.
app.get('/ledger', (_req, res) => {
  void (async () => {
    try {
      const body = (await publicStatsBody()) as Awaited<ReturnType<typeof computePublicStatsResponse>>;
      res.set('Cache-Control', 'public, max-age=60');
      res.type('html').send(renderLedgerPage(body));
    } catch (err) {
      console.error('[ledger] page failed', err);
      res.status(503).type('html').send('<!doctype html><meta charset="utf-8"><body style="background:#0A0814;color:#9B8BA3;font-family:monospace;padding:40px">The City Ledger is catching its breath. Try again shortly.</body>');
    }
  })();
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

// SIWE (W2) is the ONLY login — no email/password/guest routes exist. The
// client fetches a single-use nonce, folds it into an EIP-4361 message, has the
// wallet sign it, and posts the message + signature back. authenticateWallet
// verifies the signature server-side (no token/RPC needed) and finds-or-creates
// the account keyed by the wallet.
app.get('/auth/nonce', (_req, res) => {
  res.json({ nonce: issueNonce() });
});
post('/auth/wallet', (b) => authenticateWallet(String(b.message ?? ''), String(b.signature ?? '')));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // D4: same origin policy as HTTP, enforced at the upgrade — a browser
    // from an unlisted origin never reaches the Colyseus handshake.
    verifyClient: (info, done) => done(allowedOrigin(info.origin || undefined), 403),
  }),
  // We own the SIGTERM sequence below — Colyseus must not also register
  // its own signal handlers and race us to process.exit.
  gracefullyShutdown: false,
});

gameServer.define('filament', FilamentRoom);
gameServer.define('tangle', TangleRoom);
gameServer.define('stacks', StacksRoom);
gameServer.define('terrarium', TerrariumRoom);
gameServer.define('underworks', UnderworksRoom);

// Railway (and most PaaS) assign PORT and route to all interfaces; binding
// 0.0.0.0 explicitly keeps this from ever resolving to loopback-only.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[amperia] server listening on 0.0.0.0:${PORT} — keep the city lit`);
});

// The nightly economy rollup (E4b): one EconomySummary row per UTC day —
// the data spine of the future City Ledger.
scheduleNightlyRollup();

// T1 — the City Board's market feed. A no-op while MARKET_DATA_URL is unset
// (pre-launch: the ticker rests); unref'd timer, so shutdown never waits.
marketData.start();

/**
 * Graceful shutdown (D3). Railway sends SIGTERM on every redeploy; if we
 * die mid-flight, everything since the last 30s persist tick is lost —
 * rollback-day item loss. Sequence: stop accepting connections → dispose
 * rooms (each room's onDispose persists every active Spark) → close DB and
 * Redis → exit 0. A hard 20s deadline force-exits if anything wedges.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ops] ${signal} received — graceful shutdown begins`);
  const deadline = setTimeout(() => {
    console.error('[ops] shutdown deadline (20s) hit — forcing exit');
    process.exit(1);
  }, 20_000);
  try {
    httpServer.close(); // refuse new HTTP + WebSocket upgrades immediately
    await gameServer.gracefullyShutdown(false); // disconnects clients, awaits onDispose persists
    await prisma.$disconnect();
    if (redis !== null) await redis.quit().catch(() => undefined);
    clearTimeout(deadline);
    console.log('[ops] shutdown complete — all rooms persisted');
    process.exit(0);
  } catch (err) {
    console.error('[ops] shutdown error', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
