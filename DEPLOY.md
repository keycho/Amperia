# AMPERIA — Deploy Runbook (prep only; needs Rusty's accounts)

Target shape (CLAUDE.md D1): client → Vercel · Colyseus server → Fly.io or
Railway · Postgres → Neon · (Redis later). Nothing here has been provisioned —
the configs below are ready so the live deploy is ~15 minutes of account work.

## 1. Postgres (Neon)

1. Create a Neon project → copy the pooled connection string.
2. `DATABASE_URL="postgresql://…?sslmode=require"` goes into the server env.
3. Run migrations from a checkout:
   `DATABASE_URL=… node db/node_modules/prisma/build/index.js migrate deploy --schema db/prisma/schema.prisma`

## 2. Server (Fly.io — fly.toml at repo root)

1. `fly launch --no-deploy` (uses the provided `fly.toml` + `server/Dockerfile`).
2. Secrets: `fly secrets set DATABASE_URL=… JWT_SECRET=$(openssl rand -hex 32)`
3. `fly deploy`. Health check: `GET /health` → `{"ok":true,"city":"AMPERIA"}`.

Railway alternative: create a service from the repo, set the same env vars,
start command `npm run start -w server` after `npm ci && npm run db:generate
&& npm run build -w server`.

## 3. Client (Vercel)

1. Import the repo; framework = Vite; root directory `client/`.
2. Env: `VITE_SERVER_URL=https://<fly-app>.fly.dev` (build-time).
3. Build command `npm run build` (workspace-aware from repo root:
   `npm ci && npm run db:generate && npm run build -w client`), output
   `client/dist`.

## 4. Post-deploy checklist

- `curl https://<server>/health`
- Register an email account; relog; verify the Spark, pack, and Mastery
  persist (Neon row visible in `Character`).
- Two browsers: presence chip = 2, chat round-trips, both see movement.
- `select type, count(*) from "LedgerEvent" group by 1;` — gather events
  accumulate (the economy ledger is the source of truth; golden rule 9).
- Watch server logs for `[ledger]` lines and glint reaction entropy entries.

## Notes / constraints

- WebSockets: Fly + Railway pass them through; Vercel only hosts the static
  client (no server code there).
- CORS is open (`cors()`) for the skeleton — tighten `origin` to the Vercel
  domain at deploy time.
- JWT_SECRET must be a real secret in prod (dev default is a placeholder).
- The token layer (M4) is entirely absent by design — nothing on-chain
  deploys with this.
