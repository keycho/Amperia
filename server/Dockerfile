# AMPERIA game server — production image (deploy prep D7).
# Railway can usually build the repo with Nixpacks; this Dockerfile is the
# documented, reproducible fallback (monorepo workspaces sometimes confuse
# auto-builders). Build context = REPO ROOT:
#   docker build -f server/Dockerfile -t amperia-server .

# ── build stage: all deps, Prisma client, server + seed bundles ─────────────
FROM node:20-alpine AS build
WORKDIR /app
# Manifests first so the npm ci layer caches until a dependency changes.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY db/package.json db/
# Server + db workspaces only — the client is built on Vercel, not here.
RUN npm ci -w server -w db --include-workspace-root
COPY shared shared
COPY db db
COPY server server
# Prisma client (into db/prisma/generated), then typecheck + bundle
# (server/dist/index.mjs and seed.mjs).
RUN node db/node_modules/prisma/build/index.js generate --schema db/prisma/schema.prisma \
  && npm run build -w server

# ── runtime stage: production deps only, non-root ───────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
# (Prisma's musl query engine needs libssl3 — already in node:20-alpine.)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY db/package.json db/
# Includes the prisma CLI (a runtime dep of @amperia/db) so
# `npm run db:deploy` / the seed can run from the Railway service shell.
RUN npm ci -w server -w db --include-workspace-root --omit=dev \
  && npm cache clean --force
# Schema + migrations + generated client (for db:deploy), server + seed bundles.
COPY --from=build --chown=node:node /app/db/prisma db/prisma
COPY --from=build --chown=node:node /app/server/dist server/dist
# Rotating JSON logs default to ./logs (LOG_DIR) — writable by the app user.
RUN mkdir -p logs && chown node:node logs
USER node
# Railway injects PORT and routes to it; the server binds 0.0.0.0:$PORT.
# 2567 is only the local default.
EXPOSE 2567
CMD ["node", "server/dist/index.mjs"]
