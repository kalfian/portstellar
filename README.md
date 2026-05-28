# Portstellar

> **Map your homelab like a star system.**

Stellar port discovery & uptime monitor for your homelab — JSON-first, single binary.

Portstellar turns your home server inventory into a navigable star map. Define your hosts and services in a single `ports.json`, and Portstellar plots each host as a **sun** with its services **orbiting** around it as port chips — color-coded by category, connected by **live ping rays** that flow green when reachable and snap red with a ✕ when unreachable. Drag, zoom, and arrange the universe to match your mental model.

One Go binary. One SQLite file. One Docker container.

---

## Features

- **Radial mesh** — hosts as suns, services as orbiting port chips with category-colored ray lines
- **Drag-to-arrange** — drag a sun and its services follow; nudge individual ports to override; layouts persist
- **Live ping rays** — green flowing dashes on success, red ✕ on failure, gray while probing
- **Multi-protocol probes** — HTTP, TCP, ICMP, auto-detected from your config (override per service if needed)
- **JSON-first config** — `ports.json` is the source of truth; no UI editor, no DB write path for topology
- **Uptime history** — append-only SQLite log of every ping; sparkline & uptime % *(roadmap)*
- **Dual-themed** — dark CRT vibes or paper blueprint vibes
- **Single binary, single container** — Go + embedded SPA + SQLite; mount config, you're done

---

## Quickstart

### Docker (recommended)

```bash
# 1. Create your topology
cat > ports.json <<EOF
{
  "name": "Home Server",
  "pingIntervalMs": 30000,
  "categories": [
    { "id": "infra", "label": "Infra", "color": "#4d9bff" }
  ],
  "hosts": [
    {
      "id": "homeserver",
      "name": "homeserver",
      "ip": "10.20.30.100",
      "services": [
        { "id": "ssh",   "name": "SSH",   "port": 22,  "category": "infra" },
        { "id": "nginx", "name": "nginx", "port": 443, "category": "infra", "url": "https://10.20.30.100" }
      ]
    }
  ]
}
EOF

# 2. Run
docker compose up -d

# 3. Open http://localhost:8080
```

Compose file:
```yaml
services:
  portstellar:
    image: ghcr.io/kalfian/portstellar:latest
    ports: ["8080:8080"]
    volumes:
      - ./ports.json:/data/ports.json:ro
      - portstellar-data:/data
    cap_add: ["NET_RAW"]   # for ICMP ping
    restart: unless-stopped
volumes:
  portstellar-data:
```

### Local dev

```bash
# Frontend (port 5173, hot reload)
npm install
npm run dev

# Backend (port 8080) — once Phase 2 lands
cd backend
PORTS_FILE=../public/ports.json DB_FILE=./portstellar.db go run .
```

Vite proxies `/api` → `http://localhost:8080`, so the SPA always talks through the backend. With no backend running, the frontend falls back to **simulated ping mode** so the UI still works for design tweaks.

---

## Configuration: `ports.json`

```json
{
  "name": "Home Server",
  "pingIntervalMs": 30000,

  "categories": [
    { "id": "media", "label": "Media", "color": "#ff5577" },
    { "id": "infra", "label": "Infra", "color": "#4d9bff" }
  ],

  "hosts": [
    {
      "id": "palkia",
      "name": "palkia",
      "ip": "10.20.30.100",
      "note": "primary docker host",
      "services": [
        {
          "id": "plex",
          "name": "Plex",
          "port": 32400,
          "protocol": "tcp",
          "category": "media",
          "url": "http://10.20.30.100:32400/web",
          "status": "running",
          "tags": ["streaming"],
          "probe": { "type": "http" }
        }
      ]
    }
  ]
}
```

### Field reference

**Root**
| Field | Type | Default | Notes |
|---|---|---|---|
| `name` | string | `"Home Server"` | Shown in header. |
| `pingIntervalMs` | number | `30000` | Probe interval per service. |
| `categories[]` | array | required | Color groups. |
| `hosts[]` | array | required | Hosts and their services. |

**Host**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique. |
| `name` | yes | Display name (sun core). |
| `ip` | yes | Used for default probe target. |
| `note` | no | Free-text. |
| `services[]` | yes (may be empty) | Nested services. |

**Service**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within host. Stored as `<hostId>-<id>`. |
| `name` | yes | Display label. |
| `port` | yes | TCP/UDP port number. |
| `protocol` | no | `tcp` (default) \| `udp`. |
| `category` | no | Match a `categories[].id`. |
| `url` | no | Used for HTTP probe target & "open" link. |
| `description` | no | Shown in detail drawer. |
| `tags[]` | no | Free-form. |
| `status` | no | `running` \| `stopped` \| `reserved` \| `unknown`. Manual override marker. |
| `probe` | no | `{ type: "http"\|"tcp"\|"icmp", target?: string }`. |

### Auto-detected probe type
If `probe` is not specified, Portstellar picks based on:
- `url` field set with `http(s)://...` → **HTTP** GET against `url`
- `protocol === "udp"` → **ICMP** ping against `host.ip`
- Otherwise → **TCP** dial against `host.ip:port`

Override anytime with an explicit `probe` block.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Single container: portstellar                        │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ HTTP Server │   │  Dispatcher  │   │  SQLite   │ │
│  │  :8080      │   │  N-second    │   │ /data/db  │ │
│  │             │──▶│  ticker      │──▶│           │ │
│  │  /api/*     │   │  ┌─────────┐ │   │ append    │ │
│  │  static SPA │   │  │HTTP TCP │ │   │ -only log │ │
│  └─────────────┘   │  │ ICMP    │ │   │           │ │
│         ▲          │  └─────────┘ │   └───────────┘ │
│         │          └──────────────┘                  │
└─────────┼──────────────────▲─────────────────────────┘
          │                  │
       Browser         ports.json (mounted RO)
```

### JSON-first principle

Portstellar treats `ports.json` as the **source of truth**. There's no in-app config editor and no database write path that mutates topology. You edit the file, Portstellar reads it. This makes the topology:

- **Version-controllable** — commit your homelab to Git
- **Backupable** — it's one file
- **Scriptable** — generate it from `docker ps`, Ansible inventory, Terraform output, or `nmap`

The SQLite database stores **runtime data only** — ping history and latency samples. Blow it away whenever; the topology survives.

### API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/config` | Raw `ports.json` |
| GET | `/api/pings/latest` | Current state per service |
| GET | `/api/pings/history?service=<id>&range=24h` | Time-series for sparkline |
| GET | `/api/health` | Liveness + last tick info |
| GET | `/*` | SPA fallback to `index.html` |

---

## Status

Phase 1 — **UI MVP** ✅ — radial mesh, drag/zoom/pan, themes, ornament, simulated ping
Phase 2 — **Backend** 🚧 — Go + SQLite + real probes (HTTP/TCP/ICMP), live ping API
Phase 3 — **Docker** ⏳ — multi-stage image, compose, polish (sparkline, uptime %)

See [PLAN.md](./PLAN.md) for full roadmap and [SPECS.md](./SPECS.md) for design details.

---

## Tech

- **Frontend**: Vite + React + TypeScript + TailwindCSS + IBM Plex Sans/Mono
- **Backend**: Go 1.22+ (stdlib `net/http`, `log/slog`)
- **DB**: SQLite via [`modernc.org/sqlite`](https://gitlab.com/cznic/sqlite) (pure Go, no CGO)
- **ICMP**: [`prometheus-community/pro-bing`](https://github.com/prometheus-community/pro-bing)

---

## License

MIT
