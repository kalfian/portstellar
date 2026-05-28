# Portstellar

> **Map your homelab like a star system.**

A JSON-first port discovery and uptime monitor for homelabs. Define your hosts and services in one file, and Portstellar plots each host as a **sun** with services **orbiting** as port chips — color-coded by category, connected by **live ping rays** that flow green when reachable and snap red with a ✕ when unreachable. Drag, zoom, and arrange the universe to match your mental model.

> ⚠️ **Status: Phase 1 (UI) shipped. Backend & Docker are next.** Right now the app runs on Vite dev server with simulated ping. See the [Status](#status) table below.

---

## Features

- **Radial mesh** — hosts as suns, services as orbiting port chips with category-colored ray lines
- **Drag-to-arrange** — drag a sun and its services follow; nudge individual ports to override; layouts persist in `localStorage`
- **Pan & zoom** — drag empty canvas to pan, mouse wheel to zoom centered on cursor, `fit` button auto-centers everything
- **Live ping rays** — green flowing dashes on success, red ✕ on failure, gray while probing *(simulated in Phase 1, real in Phase 2)*
- **Multi-protocol probes** — HTTP, TCP, ICMP, auto-detected from your config *(Phase 2)*
- **JSON-first config** — `ports.json` is the source of truth; no UI editor, no DB write path for topology
- **Uptime history** — append-only SQLite log per ping; sparkline & uptime % *(Phase 3)*
- **Dual-themed** — dark CRT vibes or paper blueprint vibes
- **Single binary, single container** — Go + embedded SPA + SQLite *(Phase 2/3)*

---

## Quickstart (now — UI only)

```bash
git clone git@github.com:kalfian/portstellar.git
cd portstellar
npm install
npm run dev
# open http://localhost:5173
```

Edit `public/ports.json` to define your topology. The UI hot-reloads.

In this phase, ping status is **simulated** based on each service's `status` field (`running` → green, `stopped` → red, etc). Real probes land in Phase 2.

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
| `pingIntervalMs` | number | `30000` | Probe interval per service (Phase 2). |
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
| `url` | no | Used for HTTP probe target and "open" link. |
| `description` | no | Shown in detail drawer. |
| `tags[]` | no | Free-form. |
| `status` | no | `running` \| `stopped` \| `reserved` \| `unknown`. Manual override marker. |
| `probe` | no | `{ type: "http"\|"tcp"\|"icmp", target?: string }`. |

### Auto-detected probe type *(Phase 2)*
If `probe` is not specified:
- `url` set with `http(s)://...` → **HTTP** GET against `url`
- `protocol === "udp"` → **ICMP** ping against `host.ip`
- Otherwise → **TCP** dial against `host.ip:port`

Override anytime with an explicit `probe` block.

---

## JSON-first principle

Portstellar treats `ports.json` as the **source of truth**. There's no in-app config editor and (planned) no database write path that mutates topology. You edit the file, Portstellar reads it. This makes your topology:

- **Version-controllable** — commit your homelab to Git
- **Backup-friendly** — it's one file
- **Scriptable** — generate it from `docker ps`, Ansible inventory, Terraform output, or `nmap`

The SQLite database (Phase 2) stores **runtime data only** — ping history and latency samples. Blow it away whenever; the topology survives.

---

## Status

| Phase | Scope | Status |
|---|---|---|
| **1** | UI MVP — radial mesh, drag/zoom/pan, themes, Cosmos ornament, simulated ping, layout persistence | ✅ Shipped |
| **2** | Backend — Go + SQLite + real HTTP/TCP/ICMP probes, `/api/*` endpoints, auto-fallback to simulated mode | 🚧 Next |
| **3** | Docker — multi-stage image, compose with `/data` volume, polish (sparkline, uptime % badge, "ping now") | ⏳ Planned |

---

## Architecture *(planned — Phase 2/3)*

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

### API surface *(Phase 2)*

| Method | Path | Notes |
|---|---|---|
| GET | `/api/config` | Raw `ports.json` |
| GET | `/api/pings/latest` | Current state per service |
| GET | `/api/pings/history?service=<id>&range=24h` | Time-series for sparkline |
| GET | `/api/health` | Liveness + last tick info |
| GET | `/*` | SPA fallback to `index.html` |

---

## Tech

| Layer | Stack |
|---|---|
| Frontend | Vite + React + TypeScript + TailwindCSS + IBM Plex Sans/Mono |
| Backend *(Phase 2)* | Go 1.22+, stdlib `net/http` & `log/slog` |
| DB *(Phase 2)* | SQLite via [`modernc.org/sqlite`](https://gitlab.com/cznic/sqlite) (pure Go, no CGO) |
| ICMP *(Phase 2)* | [`prometheus-community/pro-bing`](https://github.com/prometheus-community/pro-bing) |
| Deploy *(Phase 3)* | Docker multi-stage → single image, single port |

---

## Contributing

Issues and pull requests welcome. Before submitting code:
- Run `npx tsc -b` to ensure types check
- Keep `ports.json` schema changes documented in this README

---

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0)

Portstellar is free to use, modify, and self-host. If you run a modified version on a server that others access (including SaaS), you must publish your modifications under the same license. See [LICENSE](./LICENSE) for full terms.
