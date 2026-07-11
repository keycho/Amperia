/**
 * Boot-time env contract (deploy prep D2). Imported first in index.ts so a
 * misconfigured deploy dies immediately with ONE readable message listing
 * every missing/invalid variable — not a Prisma stack trace five minutes in.
 *
 * Rules:
 *  - Only NAMES are ever printed. Several of these are secrets; their values
 *    must never reach logs, alerts, or error messages.
 *  - Vars with safe defaults (PORT, LOG_DIR, rate knobs) are not checked here;
 *    the full table lives in server/.env.example and DEPLOY.md.
 */

const isProd = process.env.NODE_ENV === 'production';

// The dev fallback baked into auth.ts — fine locally, fatal in production.
const DEV_JWT_PLACEHOLDER = 'amperia-dev-secret-change-me';

const problems: string[] = [];

function must(name: string, hint: string): void {
  const v = process.env[name];
  if (v === undefined || v === '') problems.push(`  ${name} — ${hint}`);
}

// The server cannot do anything without Postgres, in any environment.
must('DATABASE_URL', 'Postgres connection string (Supabase pooled, port 6543, ?pgbouncer=true)');

if (isProd) {
  must('JWT_SECRET', 'session signing secret — generate with: openssl rand -hex 32');
  const jwt = process.env.JWT_SECRET;
  if (jwt !== undefined && (jwt === DEV_JWT_PLACEHOLDER || jwt.length < 32)) {
    problems.push('  JWT_SECRET — set, but is the dev placeholder or under 32 chars; generate a real one');
  }
  must('CORS_ORIGIN', "comma-separated allowed browser origins, e.g. https://amperia.vercel.app");
  const corsEntries = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  for (const entry of corsEntries) {
    if (entry.includes('*')) {
      problems.push('  CORS_ORIGIN — wildcard origins are not allowed in production');
    } else if (/localhost|127\.0\.0\.1/.test(entry)) {
      problems.push('  CORS_ORIGIN — localhost origins are dev-only; list real client origins');
    } else if (!/^https?:\/\/[^/]+$/.test(entry)) {
      problems.push(`  CORS_ORIGIN — '${entry}' is not a bare origin (scheme://host[:port], no path)`);
    }
  }
}

// Optional, but if present it must be a URL ioredis can parse.
const redisUrl = process.env.REDIS_URL;
if (redisUrl !== undefined && redisUrl !== '' && !/^rediss?:\/\//.test(redisUrl)) {
  problems.push('  REDIS_URL — must start with redis:// or rediss:// (Railway: use the provided REDIS_URL as-is)');
}

if (problems.length > 0) {
  // Plain stderr on purpose: this runs before the ops log capture exists.
  console.error(
    [
      '[amperia] refusing to start — environment is incomplete:',
      ...problems,
      isProd
        ? 'Set these on the Railway service (Variables tab), then redeploy. See DEPLOY.md.'
        : 'Copy server/.env.example to server/.env and fill in local values.',
    ].join('\n'),
  );
  process.exit(1);
}
