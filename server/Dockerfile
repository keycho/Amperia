# AMPERIA Colyseus server (workspace-aware build; run from repo root context).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY db/package.json db/
RUN npm ci --workspaces --include-workspace-root
COPY shared shared
COPY db db
COPY server server
RUN node db/node_modules/prisma/build/index.js generate --schema db/prisma/schema.prisma \
  && npm run build -w server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/db/prisma/generated db/prisma/generated
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/db/prisma/migrations db/prisma/migrations
COPY --from=build /app/db/prisma/schema.prisma db/prisma/schema.prisma
EXPOSE 2567
CMD ["node", "server/dist/index.mjs"]
