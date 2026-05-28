CREATE TABLE IF NOT EXISTS ping_results (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT    NOT NULL,
    ok         INTEGER NOT NULL,  -- 0 or 1
    latency_ms INTEGER NOT NULL,
    error_msg  TEXT    NOT NULL DEFAULT '',
    ts         INTEGER NOT NULL   -- unix millis
);

CREATE INDEX IF NOT EXISTS idx_ping_results_service_ts
    ON ping_results (service_id, ts);

CREATE INDEX IF NOT EXISTS idx_ping_results_ts
    ON ping_results (ts);

-- Latest state per service (upserted after each probe)
CREATE TABLE IF NOT EXISTS service_state (
    service_id TEXT    PRIMARY KEY,
    ok         INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    error_msg  TEXT    NOT NULL DEFAULT '',
    ts         INTEGER NOT NULL
);

-- Single admin auth row (password-only login)
CREATE TABLE IF NOT EXISTS admin_auth (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash    TEXT    NOT NULL,
    password_version INTEGER NOT NULL DEFAULT 1,
    updated_at       INTEGER NOT NULL
);

-- Per-service heartbeat and retry settings
CREATE TABLE IF NOT EXISTS service_settings (
    service_id   TEXT    PRIMARY KEY,
    heartbeat_ms INTEGER NOT NULL DEFAULT 30000,
    max_retries  INTEGER NOT NULL DEFAULT 1,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mesh_host_positions (
    mesh_id    TEXT NOT NULL,
    host_id    TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (mesh_id, host_id)
);

CREATE TABLE IF NOT EXISTS mesh_service_positions (
    mesh_id    TEXT NOT NULL,
    service_id TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (mesh_id, service_id)
);
