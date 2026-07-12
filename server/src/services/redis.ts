import { Redis } from 'ioredis';

/**
 * Optional Redis handle (CLAUDE.md stack: cache / presence / rate-limit).
 * Nothing gameplay-critical reads it yet — it exists so the production
 * topology (Colyseus + Redis on Railway) is wired and health-checked from
 * day one, and so the future multi-instance presence layer has its
 * connection story settled.
 *
 * REDIS_URL accepts the full URL form with auth, exactly as Railway
 * provides it:  redis://default:<password>@<host>:<port>
 * (rediss:// for TLS). Unset ⇒ the server runs without Redis and /healthz
 * reports it as "off".
 *
 * The URL embeds the password — it must never be logged; error handlers
 * below only ever print err.message (host/port at most).
 */
export const redis: Redis | null =
  process.env.REDIS_URL !== undefined && process.env.REDIS_URL !== ''
    ? new Redis(process.env.REDIS_URL, {
        // Fail requests fast instead of queueing forever when Redis is down —
        // nothing depends on it hard enough to justify blocking.
        maxRetriesPerRequest: 2,
        // Capped backoff so a Redis outage logs a line every ~10s, not a flood.
        retryStrategy: (times) => Math.min(times * 500, 10_000),
      })
    : null;

if (redis !== null) {
  redis.on('connect', () => console.log('[redis] connected'));
  redis.on('error', (err: Error) => console.error('[redis] error:', err.message));
}

/** True when Redis is configured and answering PING. */
export async function redisHealthy(): Promise<boolean> {
  if (redis === null) return false;
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
