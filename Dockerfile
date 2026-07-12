# Production image for Transcend (issue #238).
# Multi-stage: build the browser bundle with esbuild, then ship a slim runtime that
# runs the TypeScript server via Node 24 native type stripping (no tsc emit).

# --- build: full deps + minified browser bundle ---------------------------------
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY build.ts tsconfig.json ./
COPY browser ./browser
COPY shared ./shared
COPY public ./public

RUN npm run build-prod

# --- runtime: production deps + source + built assets ---------------------------
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Default listen port; override with PORT at runtime.
ENV PORT=1337

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

# Server + DB stack (executed as TypeScript by Node 24).
COPY server ./server
COPY db ./db
COPY shared ./shared
COPY migrations ./migrations
# SPA shell (static sendFile) and static assets (images, fonts, CSS).
COPY browser/app.html ./browser/app.html
COPY public ./public
# Overlay the production bundle from the build stage (public/ also has source assets).
COPY --from=build /app/public/bundle.js /app/public/bundle.js.map ./public/

EXPOSE 1337

# Wire to the existing /healthz readiness probe (DB-backed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1337)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Required at runtime (compose / orchestrator must set these):
#   DATABASE_URL    postgres://user:pass@host:5432/dbname
#   SESSION_SECRET  long random string (server exits if missing in production)
# Optional: CLIENT_ID / CLIENT_SECRET (Google OAuth), APP_ORIGIN, PORT, etc.
CMD ["node", "server/index.ts"]
