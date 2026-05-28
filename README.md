# Portstellar

> **Map your homelab like a star system.**

A JSON-first port discovery and uptime monitor for homelabs. Define your hosts and services in one file, and Portstellar plots each host as a **sun** with services **orbiting** as port chips — color-coded by category, connected by **live ping rays** that flow green when reachable, yellow when degraded, and snap red with a ✕ when unreachable. Drag, zoom, and arrange the universe to match your mental model.

---

## Quickstart

### Docker (recommended)

```bash
git clone git@github.com:kalfian/portstellar.git
cd portstellar

# Edit public/ports.json with your hosts and services, then:
docker compose up -d

# Open http://localhost:8080
```

That's it. The container builds the SPA and Go binary, starts probing, and serves everything on port 8080.

### Dev mode

```bash
# Terminal 1 — backend
cd backend
go run .
# Listens on :8080, starts probing immediately

# Terminal 2 — frontend
npm install
npm run dev
# Opens on :5173, proxies /api → :8080
```

The frontend auto-detects the backend. If the backend is down, it falls back to **simulated ping** with an amber "offline" badge.

---

## Features

- **Radial mesh** — hosts as suns, services as orbiting port chips with category-colored ray lines
- **Drag-to-arrange** — drag a sun and its services follow; nudge individual ports to override; layouts persist in `localStorage`
- **Pan & zoom** — drag empty canvas to pan, mouse wheel to zoom centered on cursor, `fit` button auto-centers everything
- **Live ping rays** — green flowing dashes on success, yellow for high-latency, red ✕ on failure, gray while probing
- **Multi-protocol probes** — HTTP, TCP, ICMP, auto-detected from your config
- **Uptime tracking** — 24h uptime %, sparkline latency chart in detail drawer
- **JSON-first config** — `ports.json` is the source of truth; no UI editor, no DB write path for topology
- **Dual-themed** — dark CRT vibes or paper blueprint vibes
- **Single binary, single container** — Go + embedded SPA + SQLite
- **Auto-fallback** — frontend works without backend (simulated mode) with live/offline indicator

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
| `pingIntervalMs` | number | `30000` | Probe interval in milliseconds. |
| `categories[]` | array | required | Color groups for services. |
| `hosts[]` | array | required | Hosts and their services. |

**Host**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique identifier. |
| `name` | yes | Display name (sun core label). |
| `ip` | yes | Used for probe target. |
| `note` | no | Free-text description. |
| `services[]` | yes (may be empty) | Nested services. |

**Service**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within host. Stored as `<hostId>-<id>`. |
| `name` | yes | Display label. |
| `port` | yes | TCP/UDP port number. |
| `protocol` | no | `tcp` (default) \| `udp`. |
| `category` | no | Match a `categories[].id`. |
| `url` | no | HTTP probe target and "open" link. |
| `description` | no | Shown in detail drawer. |
| `tags[]` | no | Free-form tags. |
| `status` | no | `running` \| `stopped` \| `reserved` \| `unknown`. |
| `probe` | no | `{ "type": "http" | "tcp" | "icmp" }` — override auto-detection. |

### Probe type auto-detection

If `probe` is not specified, the backend auto-detects:
1. **Explicit** `probe.type` → use that
2. **URL** set with `http(s)://...` → **HTTP** GET against `url` (success if status < 500)
3. **Protocol** is `udp` → **ICMP** ping against `host.ip`
4. **Default** → **TCP** dial against `host.ip:port`

Override anytime with an explicit `probe` block.

### Probe details

| Type | Method | Success criteria | Timeout |
|---|---|---|---|
| HTTP | `GET url` (skip TLS verify) | Status < 500 | 4s |
| TCP | `net.Dial("tcp", host:port)` | Connection opens | 4s |
| ICMP | pro-bing, 1 packet | Reply received | 4s |

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

### API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/config` | Raw `ports.json` contents |
| GET | `/api/pings/latest` | Current state per service |
| GET | `/api/pings/history?service=<id>&range=<hours>` | Time-series for sparkline (default 24h) |
| GET | `/api/health` | `{ status, uptime, lastTick }` |
| GET | `/*` | SPA fallback to `index.html` |

---

## Docker

### Build & run

```bash
docker compose up -d
# → UI on http://localhost:8080
```

### Volumes

| Mount | Purpose |
|---|---|
| `./public/ports.json:/data/ports.json:ro` | Your topology config (read-only) |
| `portstellar-data:/data` | SQLite database (persists across restarts) |

### ICMP

The container needs `NET_RAW` capability for privileged ICMP (already in `docker-compose.yml`). The prober tries unprivileged UDP-based ping first and falls back to privileged raw socket.

### Environment variables

| Var | Default | Notes |
|---|---|---|
| `PORTS_FILE` | `/data/ports.json` | Path to config file |
| `DB_FILE` | `/data/portstellar.db` | SQLite database path |
| `STATIC_DIR` | `/app/dist` | SPA build directory |
| `LISTEN_ADDR` | `:8080` | HTTP listen address |

---

## JSON-first principle

Portstellar treats `ports.json` as the **source of truth**. There's no in-app config editor and no database write path that mutates topology. You edit the file, Portstellar reads it. This makes your topology:

- **Version-controllable** — commit your homelab to Git
- **Backup-friendly** — it's one file
- **Scriptable** — generate it from `docker ps`, Ansible inventory, Terraform output, or `nmap`

The SQLite database stores **runtime data only** — ping history and latency samples. Blow it away whenever; the topology survives.

---

## Tech

| Layer | Stack |
|---|---|
| Frontend | Vite + React + TypeScript + TailwindCSS + IBM Plex Sans/Mono |
| Backend | Go 1.22+, stdlib `net/http` & `log/slog` |
| DB | SQLite via [`modernc.org/sqlite`](https://gitlab.com/cznic/sqlite) (pure Go, no CGO) |
| ICMP | [`prometheus-community/pro-bing`](https://github.com/prometheus-community/pro-bing) |
| Deploy | Docker multi-stage → single alpine image, single port |

---

## Contributing

Issues and pull requests welcome. Before submitting code:
- Run `npx tsc --noEmit` to ensure types check
- Run `cd backend && go build .` to ensure Go compiles
- Keep `ports.json` schema changes documented in this README

---

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0)

Portstellar is free to use, modify, and self-host. If you run a modified version on a server that others access (including SaaS), you must publish your modifications under the same license. See [LICENSE](./LICENSE) for full terms.
