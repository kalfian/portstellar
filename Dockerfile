# ── Stage 1: Build SPA ──────────────────────────────────────────────────────
FROM node:22-alpine AS spa
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

# Only copy what Vite needs — skip backend/, .git, docs, etc.
COPY index.html vite.config.ts tsconfig*.json tailwind.config.js postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ── Stage 2: Build Go binary ─────────────────────────────────────────────────
FROM golang:1.22-alpine AS go
WORKDIR /src

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/portstellar .

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=go  /out/portstellar ./portstellar
COPY --from=spa /app/dist        ./dist

# All config via environment variables.
# Mount your services.json at $SERVICES_FILE (default /data/services.json).
# SQLite DB is persisted in /data volume.
ENV SERVICES_FILE=/data/services.json \
    DB_FILE=/data/portstellar.db \
    STATIC_DIR=/app/dist \
    LISTEN_ADDR=:8080 \
    ADMIN_PASSWORD=""

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["./portstellar"]
