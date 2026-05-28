/**
 * API helper — resolves paths against VITE_API_BASE.
 * In production (served by Go), VITE_API_BASE is "" → relative paths.
 * In dev, Vite proxy handles /api → localhost:8080.
 */
const BASE = import.meta.env.VITE_API_BASE ?? "";

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

export interface ApiPingState {
  serviceId: string;
  ok: boolean;
  latencyMs: number;
  errorMsg?: string;
  ts: number;
}

export interface MeshPositions {
  meshId: string;
  hosts: Record<string, { x: number; y: number }>;
  services: Record<string, { x: number; y: number }>;
}

export async function fetchMeshPositions(meshId: string): Promise<MeshPositions> {
  const r = await fetch(apiUrl(`/api/meshes/${encodeURIComponent(meshId)}/positions`), {
    cache: "no-store",
    signal: withTimeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function saveMeshPositions(
  token: string,
  meshId: string,
  payload: { hosts: Record<string, { x: number; y: number }>; services: Record<string, { x: number; y: number }> }
): Promise<MeshPositions> {
  const r = await fetch(apiUrl(`/api/meshes/${encodeURIComponent(meshId)}/positions`), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
    signal: withTimeout(5000),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface ApiHistoryPoint {
  ok: boolean;
  latencyMs: number;
  errorMsg?: string;
  ts: number;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Fetch latest ping states from backend. */
export async function fetchPingsLatest(): Promise<ApiPingState[]> {
  const r = await fetch(apiUrl("/api/pings/latest"), { cache: "no-store", signal: withTimeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Fetch ping history for a specific service. */
export async function fetchPingsHistory(serviceId: string, rangeHours = 24): Promise<ApiHistoryPoint[]> {
  const r = await fetch(
    apiUrl(`/api/pings/history?service=${encodeURIComponent(serviceId)}&range=${rangeHours}`),
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Fetch config from backend API. */
export async function fetchConfig(): Promise<unknown> {
  const r = await fetch(apiUrl("/api/config"), { cache: "no-store", signal: withTimeout(2000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Check if backend is reachable. */
export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(apiUrl("/api/health"), { cache: "no-store", signal: withTimeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function adminLogin(password: string): Promise<{ token: string; expiresAt: number }> {
  const r = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchAdminConfig(token: string): Promise<unknown> {
  const r = await fetch(apiUrl("/api/admin/config"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveAdminConfig(token: string, payload: unknown): Promise<void> {
  const r = await fetch(apiUrl("/api/admin/config"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const r = await fetch(apiUrl("/api/auth/change-password"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function authMe(token: string): Promise<boolean> {
  const r = await fetch(apiUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return r.ok;
}

// ── Service settings ──────────────────────────────────────────────────────────

export interface ServiceSetting {
  serviceId: string;
  heartbeatMs: number;
  maxRetries: number;
}

export interface Beat {
  ok: boolean;
  latencyMs: number;
  errorMsg?: string;
  ts: number;
}

export interface ServiceStats {
  uptime24h: number | null;
  uptime30d: number | null;
  avgLatency24h: number | null;
  recentBeats: Beat[];
}

export async function fetchServiceSetting(serviceId: string): Promise<ServiceSetting> {
  const r = await fetch(apiUrl(`/api/services/${encodeURIComponent(serviceId)}/settings`), {
    cache: "no-store",
    signal: withTimeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function saveServiceSetting(
  token: string,
  serviceId: string,
  setting: { heartbeatMs: number; maxRetries: number }
): Promise<void> {
  const r = await fetch(apiUrl(`/api/services/${encodeURIComponent(serviceId)}/settings`), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(setting),
    signal: withTimeout(5000),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fetchServiceStats(serviceId: string): Promise<ServiceStats> {
  const r = await fetch(apiUrl(`/api/services/${encodeURIComponent(serviceId)}/stats`), {
    cache: "no-store",
    signal: withTimeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
