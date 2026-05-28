# ── Stage 1: Build SPA ──────────────────────────────
FROM node:20-alpine AS spa
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2: Build Go binary ────────────────────────
FROM golang:1.23-alpine AS go
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/portstellar .

# ── Stage 3: Runtime ────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=go  /out/portstellar ./portstellar
COPY --from=spa /app/dist        ./dist

ENV PORTS_FILE=/data/ports.json \
    DB_FILE=/data/portstellar.db \
    STATIC_DIR=/app/dist \
    LISTEN_ADDR=:8080

EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["./portstellar"]
