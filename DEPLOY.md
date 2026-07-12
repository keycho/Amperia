# AMPERIA — Production Deploy Runbook

Topology: **Postgres on Supabase · Colyseus server + Redis on Railway ·
client on Vercel.** Follow the sections in order — each one tells you exactly
what to click and what to copy where. Nothing in this file requires reading
code. Do the whole thing in ~30 minutes.

Production order for the database, always: **migrate → seed → start.**

---

## 0. What runs where (build + start commands)

| Service | Platform | Build | Start |
|---|---|---|---|
| Game server | Railway (Dockerfile `server/Dockerfile`, context = repo root) | `docker build -f server/Dockerfile .` (Railway does this) | `node server/dist/index.mjs` (the image CMD) |
| Game server (Nixpacks fallback) | Railway | `npm ci -w server -w db --include-workspace-root && npm run db:generate && npm run build -w server` | `npm run start -w server` |
| Client | Vercel (root directory `client`, framework Vite) | `npm run build` (runs `tsc --noEmit && vite build`) → output `client/dist` | static hosting (none) |
| Migrations | Railway service shell | — | `npm run db:deploy` |
| Seed (idempotent) | Railway service shell | — | `npm run db:seed` |

The server binds `0.0.0.0:$PORT` (Railway injects `PORT`). Local production
sanity check: `npm ci && npm run db:generate && npm run build && npm run start -w server`.

---

## 1. Supabase (Postgres)

1. [supabase.com](https://supabase.com) → **New project**. Pick a strong DB
   password and a region near your Railway region.
2. **Enable backups from day one:** Project Settings → Database →
   **Backups** — daily backups are on by default on paid plans; also enable
   **Point-in-Time Recovery** if the plan allows. Without this there is no
   honest recovery story.
3. Click **Connect** (top bar) and copy TWO connection strings:

   | Supabase string | Port | Goes into env var | Note |
   |---|---|---|---|
   | **Transaction pooler** | `6543` | `DATABASE_URL` | append `?pgbouncer=true` |
   | **Direct connection** | `5432` | `DIRECT_URL` | used only by migrations |

   Example `DATABASE_URL` (one line):
   `postgresql://postgres.abcdefgh:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

   Runtime traffic goes through the pooler; `prisma migrate deploy` uses the
   direct string (the Prisma schema is already wired for this split via
   `directUrl`).

---

## 2. Railway (server + Redis)

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub
   repo** → pick this repo.
2. In the new service → **Settings**:
   - **Root Directory:** leave `/` (repo root — the Dockerfile needs the
     whole workspace).
   - **Builder:** Dockerfile, path `server/Dockerfile`. (Nixpacks also works
     with the fallback commands from §0, but the Dockerfile is the tested
     path.)
   - **Healthcheck path:** `/healthz`. Railway will only route traffic and
     finish a deploy when it returns 200.
3. **Add Redis:** in the project canvas, **Create → Database → Redis**.
4. Service → **Variables** — set these:

   | Variable | Required | Where the value comes from | Example format |
   |---|---|---|---|
   | `DATABASE_URL` | yes | Supabase pooled string (§1.3) + `?pgbouncer=true` | `postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true` |
   | `DIRECT_URL` | yes | Supabase direct string (§1.3) | `postgresql://...supabase.com:5432/postgres` |
   | `JWT_SECRET` | yes | generate: `openssl rand -hex 32` | 64 hex chars |
   | `CORS_ORIGIN` | yes | your Vercel domain(s), comma-separated — set after §3, see §3.4 | `https://amperia.vercel.app` |
   | `REDIS_URL` | recommended | Railway reference: `${{Redis.REDIS_URL}}` | `redis://default:pass@host:6379` |
   | `METRICS_KEY` | recommended | any long random string; opens `https://<server>/metrics?key=...` | 32+ random chars |
   | `ALERT_WEBHOOK` | optional | Slack/Discord-style webhook URL (hears restarts + crashes) | `https://hooks.slack.com/services/...` |
   | `NODE_ENV` | no (Dockerfile bakes `production`) | set `production` explicitly if using Nixpacks | `production` |
   | `PORT` | no — Railway injects it | — | — |
   | `LOG_DIR` / `LOG_KEEP_DAYS` / `AUTH_RATE_PER_MIN` | no (defaults: `logs` / `7` / `20`) | only to override | — |

   Never set in production: `ROOM_MAX_CLIENTS`, `TRADE_TIMEOUT_SECONDS`,
   `DRAYMULE_TEST_MINUTES` (dev/load-test knobs).

   The server **refuses to boot** and prints the full list of anything
   required that's missing — check the deploy logs if it won't start.
   `CORS_ORIGIN` isn't known until §3; to deploy before that, set it to a
   placeholder like `https://pending.example` — browsers just can't connect
   until it's the real domain.

5. **Migrate + seed** (first deploy, and after any release that adds a
   migration): service → **⋯ → Shell** (or `railway shell`):

   ```
   npm run db:deploy   # applies db/prisma/migrations (17 on first ship)
   npm run db:seed     # idempotent — safe to run twice, never resets live data
   ```

6. **Settings → Networking → Generate Domain.** Copy the
   `https://....up.railway.app` URL — the client needs it next. Check
   `https://<that domain>/healthz` returns `{"ok":true,...}`.

---

## 3. Vercel (client)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this
   repo.
2. Configure:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite (build `npm run build`, output `dist` —
     the defaults)
   - Leave "Include source files outside of the Root Directory" ON (default)
     — the client imports `/shared`.
3. **Environment Variables:** add `VITE_SERVER_URL` =
   `https://<your-railway-domain>` (from §2.6, **https**, no trailing
   slash). This is baked in at build time; the client derives `wss://` from
   it automatically. A production build without it fails loudly on purpose.
4. Deploy, note the production domain (e.g. `https://amperia.vercel.app`),
   then **go back to Railway** and set `CORS_ORIGIN` to exactly that origin
   (comma-separate if you add a custom domain later). Railway redeploys on
   the variable change; after it's healthy the game is live.

---

## 4. Smoke-test checklist (do all of these)

- [ ] `https://<railway-domain>/healthz` → `{"ok":true, "db":"ok", "redis":"ok", ...}`
- [ ] Open the Vercel URL in **two different browsers**; register two Sparks —
      each sees the other move on the Filament.
- [ ] Chat from one browser arrives in the other.
- [ ] Gather a junk heap (Magclaw on hotbar slot 1, click the heap) —
      Salvage lands in the pack.
- [ ] Close one browser mid-session, reopen — the Spark is back where it was
      with the same pack (stored token auto-resume).
- [ ] `https://<railway-domain>/metrics` → 404, and `.../metrics?key=WRONG`
      → 404; `.../metrics?key=<METRICS_KEY>` → the economy dashboard.
- [ ] Wrong origin is rejected:
      `curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' https://<railway-domain>/healthz`
      → `403` (and without the header → `200`).
- [ ] Optional, scripted (drives a real browser through register → move →
      gather → chat): `CLIENT_URL=https://<vercel-domain> node tools/deploy-smoke.mjs`
- [ ] Push any commit → Railway redeploys → players relogging afterwards kept
      their items (graceful SIGTERM persist; watch for
      `[ops] shutdown complete — all rooms persisted` in the old deploy's logs).

---

## 5. Rollback

**Server (bad release):** Railway → service → **Deployments** → previous
good deployment → **⋯ → Redeploy**. Rooms persist players on SIGTERM, so a
rollback costs at most the moment of cutover. If the bad release added a
migration, note that migrations are forward-only — roll the code back only
if it's compatible with the schema, otherwise fix forward.

**Database (data loss/corruption):** Supabase → Database → **Backups** →
restore the daily backup (or PITR to a timestamp just before the incident).
A restore lands in a *new* database — update `DATABASE_URL`/`DIRECT_URL`
on Railway to the restored instance and redeploy. Expect to lose whatever
happened after the restore point; the economy ledger (`LedgerEvent`) is the
audit trail for reconciling disputes.

**Client:** Vercel → Deployments → promote a previous deployment (instant).

---

## Notes

- WebSockets: Railway passes them through on the generated domain; Vercel
  only hosts static files (no server code there).
- The Fortune Coil, Bonds, $AMP: no token/chain code ships in this topology
  at all (M4 gate) — nothing on-chain to configure.
- Local dev never needs any of this: `server/.env.example` +
  `client/.env.example` document the same contract for localhost.
