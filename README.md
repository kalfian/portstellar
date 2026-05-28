# Portstellar

> **Map your homelab like a star system.**

A JSON-first port discovery and uptime monitor for homelabs. Define your hosts and services in one file — Portstellar plots each host as a **sun** with services **orbiting** as port chips, color-coded by category, connected by **live ping rays** that pulse green when reachable, yellow when degraded, and snap red on failure.

---

## Quickstart

### Docker (recommended)

```bash
# 1. Create your services.json (see Configuration below)
curl -o services.json https://raw.githubusercontent.com/kalfian/portstellar/master/public/services.json
# Edit services.json with your hosts and services

# 2. Run
docker run -d \
  --name portstellar \
  -p 8080:8080 \
  -v $(pwd)/services.json:/data/services.json \
  -v portstellar-data:/data \
  --cap-add NET_RAW \
  -e ADMIN_PASSWORD=yourpassword \
  --restart unless-stopped \
  ghcr.io/kalfian/portstellar:latest

# 3. Open
open http://localhost:8080          # public mesh
open http://localhost:8080/admin    # admin panel
```

> **`NET_RAW`** is only needed for ICMP probes. Remove `--cap-add NET_RAW` if you only use HTTP/TCP.

### Dev mode

```bash
./dev.sh
# backend → :8080   frontend → :1212
```

The frontend auto-detects the backend. If the backend is down it falls back to **simulated ping** with an amber "offline" badge.

---

## Features

- **Radial mesh** — hosts as suns, services as orbiting port chips with category-colored ray lines
- **Drag-to-arrange** — drag a sun and services follow; nudge individual chips; layouts persist in `localStorage`
- **Pan & zoom** — drag to pan, wheel to zoom centered on cursor, `fit` auto-centers everything
- **Live ping rays** — real-time via WebSocket push; green flowing dashes on success, yellow for high latency, red ✕ on failure
- **Multi-protocol probes** — HTTP, TCP, ICMP — auto-detected or explicit per service
- **Per-service heartbeat** — configure check interval and retries before down independently per service
- **Uptime detail** — Uptime Kuma-style beat bar (last 50 heartbeats), response time chart, uptime 24h/30d
- **Admin panel** — web UI to manage hosts, services, categories, and per-service probe settings
- **JSON-first config** — `services.json` is the source of truth for topology (hosts & services)
- **SQLite for runtime data** — ping history, uptime stats, per-service settings stored in SQLite
- **Dual-themed** — dark CRT vibes or paper blueprint vibes
- **Single binary, single container** — Go + embedded SPA + SQLite, one port

---

## Configuration: `services.json`

```json
{
  "name": "Home Server",
  "pingIntervalMs": 30000,

  "categories": [
    { "id": "media",  "label": "Media",  "color": "#ff5577" },
    { "id": "infra",  "label": "Infra",  "color": "#4d9bff" },
    { "id": "net",    "label": "Network","color": "#ffb454" }
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
| `name` | string | `"Home Server"` | Shown in header |
| `pingIntervalMs` | number | `30000` | Global probe interval (ms); overridable per service in admin |
| `categories[]` | array | required | Color groups for services |
| `hosts[]` | array | required | Hosts and their services |

**Host**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique identifier |
| `name` | yes | Display name (sun core label) |
| `ip` | yes | Used as probe target |
| `note` | no | Free-text description |
| `services[]` | yes (may be empty) | Nested services |

**Service**
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within host. Stored as `<hostId>-<serviceId>` in DB |
| `name` | yes | Display label |
| `port` | yes | TCP/UDP port number |
| `protocol` | no | `tcp` (default) \| `udp` |
| `category` | no | Must match a `categories[].id` |
| `url` | no | HTTP probe target and "open" link |
| `description` | no | Shown in detail drawer |
| `tags[]` | no | Free-form tags |
| `status` | no | `running` \| `stopped` \| `reserved` \| `unknown` |
| `probe` | no | `{ "type": "http" \| "tcp" \| "icmp" }` — override auto-detection |

### Probe auto-detection

Priority order:
1. Explicit `probe.type` → use that
2. `url` starts with `http://` or `https://` → **HTTP** GET (success if status < 500)
3. `protocol` is `udp` → **ICMP** ping against `host.ip`
4. Default → **TCP** dial against `host.ip:port`

| Type | Method | Success | Timeout |
|---|---|---|---|
| HTTP | GET (skip TLS verify) | Status < 500 | 4s |
| TCP | `net.Dial("tcp", host:port)` | Connection opens | 4s |
| ICMP | pro-bing, 1 packet | Reply received | 4s |

---

## Admin Panel

Visit `/admin` to access the admin panel (default password: `123456` — change via `ADMIN_PASSWORD` env or Settings page).

- **Config Editor** — add/edit/delete hosts, services, and categories; topology is saved back to `services.json`
- **Per-service settings** — set heartbeat interval and retry count per service (stored in SQLite, independent of `services.json`)
- **Dashboard** — live service counts and uptime ring
- **Settings** — change admin password

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Container: portstellar                                  │
│                                                         │
│  ┌──────────────┐   ┌───────────────┐   ┌───────────┐  │
│  │ HTTP + WS    │   │  Dispatcher   │   │  SQLite   │  │
│  │ :8080        │   │  5s tick      │   │ /data/    │  │
│  │              │◀──│  per-service  │──▶│           │  │
│  │  /api/*      │   │  heartbeat    │   │ ping_log  │  │
│  │  /api/ws     │   │  + retries    │   │ settings  │  │
│  │  static SPA  │   └───────────────┘   └───────────┘  │
│  └──────────────┘                                       │
│         ▲  WebSocket push on each probe result          │
└─────────┼───────────────────────────────────────────────┘
          │
       Browser         services.json (mounted writable, source of truth)
```

### API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/config` | — | Raw `services.json` |
| GET | `/api/pings/latest` | — | Latest state per service |
| GET | `/api/pings/history` | — | `?service=<id>&range=<hours>` |
| GET | `/api/services/{id}/stats` | — | Uptime %, avg latency, last 50 beats |
| GET | `/api/services/{id}/settings` | — | Heartbeat interval + retry config |
| PUT | `/api/services/{id}/settings` | ✓ | Update probe settings |
| GET | `/api/health` | — | `{ status, uptime, lastTick }` |
| GET | `/api/ws` | — | WebSocket — push `ping_result` events |
| POST | `/api/auth/login` | — | Returns JWT token |
| GET | `/api/admin/config` | ✓ | Config for admin editor |
| PUT | `/api/admin/config` | ✓ | Save topology to `services.json` |

---

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `SERVICES_FILE` | `/data/services.json` | Path to topology config |
| `DB_FILE` | `/data/portstellar.db` | SQLite database path |
| `STATIC_DIR` | `/app/dist` | SPA build directory |
| `LISTEN_ADDR` | `:8080` | HTTP listen address |
| `PING_RETENTION_DAYS` | `35` | Retention window for `ping_results`; old ping history is pruned hourly |
| `ADMIN_PASSWORD` | `""` | If set, enforced on every startup. If empty, uses stored password (default `123456` on first run) |

---

## Tech

| Layer | Stack |
|---|---|
| Frontend | Vite + React + TypeScript + TailwindCSS + IBM Plex Mono |
| Backend | Go 1.22+, `net/http`, `log/slog`, gorilla/websocket |
| Database | SQLite via [`modernc.org/sqlite`](https://gitlab.com/cznic/sqlite) (pure Go, no CGO) |
| ICMP | [`prometheus-community/pro-bing`](https://github.com/prometheus-community/pro-bing) |
| Deploy | Docker multi-stage → single alpine image (amd64 + arm64) |

---

## Contributing

Issues and pull requests welcome. Before submitting:
- `npx tsc --noEmit` — TypeScript must pass
- `cd backend && go build .` — Go must compile
- Document any `services.json` schema changes in this README

---

## License

[AGPL-3.0](./LICENSE) — free to use, modify, and self-host. If you run a modified version on a server others access, publish your modifications under the same license.
