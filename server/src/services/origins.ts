/**
 * Browser-origin allow-list (deploy prep D4), driven by CORS_ORIGIN — a
 * comma-separated list of origins, e.g.
 *   CORS_ORIGIN=https://amperia.vercel.app,https://amperia.city
 *
 * One predicate feeds BOTH the HTTP CORS layer and the WebSocket upgrade
 * (Colyseus handshake), so the two can never drift.
 *
 * Requests without an Origin header (curl, Railway healthchecks, native
 * clients) pass: origin checks are a browser protection (CSRF / cross-site
 * WebSocket hijacking) — authentication is what gates actual access. A
 * spoofed Origin gains nothing that no Origin wouldn't.
 *
 * Localhost is auto-allowed only outside production; env.ts additionally
 * refuses wildcard or localhost entries in a production CORS_ORIGIN.
 */

const isProd = process.env.NODE_ENV === 'production';

const normalize = (o: string): string => o.trim().replace(/\/+$/, '').toLowerCase();

const configured: ReadonlySet<string> = new Set(
  (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map(normalize)
    .filter((o) => o !== ''),
);

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** True when a browser Origin (or an origin-less request) may talk to us. */
export function allowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === '') return true; // not a browser
  const o = normalize(origin);
  if (configured.has(o)) return true;
  if (!isProd && LOCALHOST_RE.test(o)) return true;
  return false;
}
