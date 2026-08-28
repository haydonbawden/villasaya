# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile the server and bundle the web client.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile first so the dependency layer is reused whenever
# only application code changes.
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies from the tree the runtime image will copy.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime stage: only what is needed to run the compiled server.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# No package installs: the healthcheck uses the wget busybox already provides,
# and PID-1 signal handling comes from Docker's own init (`init: true` in the
# compose file), so the runtime layer needs nothing from the network.
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/villa.sqlite \
    UPLOAD_DIR=/data/uploads \
    WEB_DIST=/app/web/dist

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# The SQLite database and uploaded receipts live on a mounted volume, so they
# survive an image replacement.
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
