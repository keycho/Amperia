import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/**
 * Ops basics (H4): structured JSON logs to daily rotating files (stdout
 * keeps the human mirror), plus an optional webhook that hears about
 * process starts (= restarts under a supervisor) and uncaught errors.
 *
 * Env: LOG_DIR (default ./logs) · LOG_KEEP_DAYS (default 7) ·
 *      ALERT_WEBHOOK (optional POST { text } target — Slack/Discord-style)
 */

const LOG_DIR = process.env.LOG_DIR ?? 'logs';
const KEEP = Math.max(1, Number(process.env.LOG_KEEP_DAYS ?? 7));

let currentDay = '';
let currentFile = '';

function logFile(): string {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== currentDay) {
    currentDay = day;
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    currentFile = path.join(LOG_DIR, `amperia-${day}.log`);
    // Rotation: drop files past the retention window.
    try {
      const files = readdirSync(LOG_DIR)
        .filter((f) => /^amperia-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .sort();
      for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
        unlinkSync(path.join(LOG_DIR, f));
      }
    } catch {
      // rotation is best-effort — never take the server down over logs
    }
  }
  return currentFile;
}

function writeLine(level: 'info' | 'warn' | 'error', args: unknown[]): void {
  try {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    appendFileSync(
      logFile(),
      `${JSON.stringify({ ts: new Date().toISOString(), level, msg })}\n`,
    );
  } catch {
    // disk trouble must never crash gameplay
  }
}

/** Fire-and-forget webhook alert (no-op without ALERT_WEBHOOK). */
export function alert(text: string): void {
  const url = process.env.ALERT_WEBHOOK;
  if (url === undefined || url === '') return;
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `[amperia] ${text}` }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}

/** Install once at boot, before anything logs. */
export function initOps(): void {
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args: unknown[]) => {
    writeLine('info', args);
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    writeLine('warn', args);
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    writeLine('error', args);
    origError(...args);
  };

  process.on('uncaughtException', (err) => {
    console.error('[ops] uncaught exception', err.stack ?? String(err));
    alert(`uncaught exception: ${err.message}`);
    // Crash fast — the supervisor restarts us into a clean state, and the
    // next boot's alert says so.
    setTimeout(() => process.exit(1), 1500);
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    console.error('[ops] unhandled rejection', msg);
    alert(`unhandled rejection: ${msg.slice(0, 300)}`);
  });

  // A boot IS the restart signal under a supervisor.
  console.log(`[ops] server boot pid=${process.pid} node=${process.version}`);
  alert(`server started (pid ${process.pid})`);
}

/**
 * Auth rate limit (H4): a small per-IP sliding window for the /auth/*
 * endpoints. In-memory by design — one instance per process is exactly
 * the scope these endpoints have. Env: AUTH_RATE_PER_MIN (default 20).
 */
const AUTH_RATE = Math.max(1, Number(process.env.AUTH_RATE_PER_MIN ?? 20));
const hits = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, arr] of hits) {
    const live = arr.filter((t) => t >= cutoff);
    if (live.length === 0) hits.delete(ip);
    else hits.set(ip, live);
  }
}, 300_000).unref();

export function authRateOk(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= AUTH_RATE) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}
