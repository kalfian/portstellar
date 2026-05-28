import { useEffect, useRef, useState } from "react";
import type { Host, Service, Category } from "../types";
import type { PingResult } from "../lib/ping";
import { useServiceStats } from "../lib/uptime";
import { useWs } from "../lib/WsContext";
import { latencyColor } from "./Sparkline";
import type { Beat } from "../lib/api";

interface Props {
  service: Service | null;
  host: Host | undefined;
  category: Category | undefined;
  ping: PingResult | undefined;
  source: "api" | "static" | null;
  theme: "dark" | "light";
  onClose: () => void;
}

export function DetailDrawer({ service, host, category, ping, source, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const { subscribe } = useWs();
  const { stats, loading: statsLoading, refresh } = useServiceStats(service?.id ?? null, source, subscribe);

  // Auto-refresh stats every 30s while drawer is open
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (source !== "api" || !service?.id) return;
    const id = setInterval(() => refreshRef.current?.(), 30_000);
    return () => clearInterval(id);
  }, [service?.id, source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!service || !host) return null;

  const color = category?.color ?? "#9aa0a6";
  const url = service.url ?? `http://${host.ip}:${service.port}`;
  const pingOk = ping?.state === "ok";
  const pingFail = ping?.state === "fail";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  // Status display
  const statusLabel = pingOk ? "UP" : pingFail ? "DOWN" : "PENDING";
  const statusBg = pingOk
    ? "bg-green-500/15 text-green-400 border-green-500/30"
    : pingFail
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-white/8 text-white/40 border-white/15";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-40 animate-[fadein_0.15s_ease-out]"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] z-50
                   bg-[#0b0e18] border-l border-white/10 text-white
                   animate-[slidein_0.2s_ease-out]
                   flex flex-col overflow-hidden"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/30">
            Service Detail
          </span>
          <button
            onClick={onClose}
            className="text-xs text-white/30 hover:text-white/70 uppercase tracking-[0.18em] transition-colors"
          >
            [esc] close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Header section ── */}
          <div className="px-5 pt-5 pb-4 border-b border-white/6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-white leading-tight truncate">
                  {service.name}
                </h2>
                <p className="text-sm text-white/40 mt-0.5 truncate">
                  {host.name}
                  <span className="text-white/25 font-mono"> ({host.ip})</span>
                </p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border tracking-wide ${statusBg}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          {/* ── Beat bar section ── */}
          <div className="px-5 py-4 border-b border-white/6">
            {source !== "api" ? (
              <p className="text-xs text-white/25 italic">Connect to backend to see live heartbeat history</p>
            ) : (
              <>
                <BeatBar beats={stats?.recentBeats ?? []} loading={statsLoading} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-white/30">Last 50 heartbeats</span>
                  {ping?.lastChecked && (
                    <span className="text-[11px] text-white/25">Last checked {timeAgo(ping.lastChecked)}</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Stats grid ── */}
          {source === "api" && stats && (
            <div className="px-5 py-4 border-b border-white/6">
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Current Response"
                  sublabel="latest"
                  value={ping?.latencyMs !== undefined && pingOk ? `${ping.latencyMs}ms` : "N/A"}
                  valueColor={ping?.latencyMs !== undefined && pingOk
                    ? latencyColor(ping.latencyMs, true)
                    : undefined}
                />
                <StatCard
                  label="Avg Response"
                  sublabel="24h"
                  value={stats.avgLatency24h !== null ? `${stats.avgLatency24h}ms` : "N/A"}
                />
                <StatCard
                  label="Uptime"
                  sublabel="24h"
                  value={stats.uptime24h !== null ? `${stats.uptime24h.toFixed(1)}%` : "N/A"}
                  valueColor={uptimeColor(stats.uptime24h)}
                />
                <StatCard
                  label="Uptime"
                  sublabel="30d"
                  value={stats.uptime30d !== null ? `${stats.uptime30d.toFixed(1)}%` : "N/A"}
                  valueColor={uptimeColor(stats.uptime30d)}
                />
              </div>
            </div>
          )}

          {/* ── Response time chart ── */}
          {source === "api" && (
            <div className="px-5 py-4 border-b border-white/6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/30">Response Time</p>
                {stats && stats.recentBeats.length > 0 && (
                  <div className="flex items-center gap-3 text-[10px] text-white/25 font-mono">
                    <span>
                      avg <span className="text-white/50">{stats.avgLatency24h ?? "—"}ms</span>
                    </span>
                    <span>
                      min <span className="text-white/50">{Math.min(...stats.recentBeats.filter(b=>b.ok).map(b=>b.latencyMs))}ms</span>
                    </span>
                    <span>
                      max <span className="text-white/50">{Math.max(...stats.recentBeats.filter(b=>b.ok).map(b=>b.latencyMs))}ms</span>
                    </span>
                  </div>
                )}
              </div>
              <ResponseChart beats={stats?.recentBeats ?? []} loading={statsLoading} />
            </div>
          )}

          {/* ── Footer: host info + URL ── */}
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-sm">
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-center">Protocol</span>
              <span className="text-white/60 font-mono uppercase text-xs">
                {service.protocol ?? "tcp"}
              </span>

              <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-center">Bind</span>
              <span className="text-white/80 font-mono text-sm tabular-nums">
                {host.ip}
                <span className="text-white/40">:</span>
                <span style={{ color }}>{service.port}</span>
              </span>

              {service.status && (
                <>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-center">Status</span>
                  <span className="text-white/60 text-xs uppercase tracking-wide">{service.status}</span>
                </>
              )}

              <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-start pt-0.5">URL</span>
              <div className="flex items-center gap-2 min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm truncate underline decoration-dotted underline-offset-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {url}
                </a>
                <button
                  onClick={copy}
                  className="shrink-0 text-[10px] uppercase tracking-[0.15em] border border-white/15 px-1.5 py-0.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>

              {service.description && (
                <>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-start pt-0.5">Info</span>
                  <p className="text-sm text-white/55 leading-snug">{service.description}</p>
                </>
              )}

              {service.tags && service.tags.length > 0 && (
                <>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 self-start pt-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {service.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 border border-white/12 rounded text-white/40"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 text-[10px] text-white/20 font-mono border-t border-white/6">
              id: {service.id}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-5 py-3 border-t border-white/8 text-[10px] text-white/20 uppercase tracking-[0.22em]">
          {category?.label ?? "uncategorized"} · {host.name}
        </div>
      </aside>

      <style>{`
        @keyframes slidein { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </>
  );
}

// ── Beat bar ──────────────────────────────────────────────────────────────────

function BeatBar({ beats, loading }: { beats: Beat[]; loading?: boolean }) {
  const slots = 50;
  const empty = Math.max(0, slots - beats.length);

  return (
    <div className="flex gap-px items-end">
      {/* Leading gray placeholder slots */}
      {Array.from({ length: empty }).map((_, i) => (
        <div
          key={`e-${i}`}
          className={`w-[6px] h-[28px] rounded-sm ${loading ? "animate-pulse bg-white/6" : "bg-white/8"}`}
        />
      ))}
      {/* Actual beats oldest→newest */}
      {beats.map((beat, i) => (
        <BeatBlock key={i} beat={beat} />
      ))}
    </div>
  );
}

function BeatBlock({ beat }: { beat: Beat }) {
  const [showTip, setShowTip] = useState(false);
  const bg = beat.ok ? "bg-green-500" : "bg-red-500";
  const tipText = `${new Date(beat.ts).toLocaleTimeString()} · ${beat.latencyMs}ms${beat.errorMsg ? ` · ${beat.errorMsg}` : ""}`;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div
        className={`w-[6px] h-[28px] rounded-sm cursor-default transition-opacity hover:opacity-80 ${bg}`}
      />
      {showTip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 pointer-events-none">
          <div className="bg-[#1a1d2e] border border-white/15 rounded-md px-2 py-1 text-[10px] text-white/80 whitespace-nowrap shadow-xl">
            {tipText}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Response time chart ───────────────────────────────────────────────────────

function ResponseChart({ beats, loading }: { beats: Beat[]; loading?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const okBeats = beats.filter(b => b.ok && b.latencyMs > 0);

  if (loading && beats.length === 0) {
    return <div className="h-20 bg-white/3 rounded-lg animate-pulse" />;
  }

  if (beats.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center bg-white/3 rounded-lg">
        <p className="text-xs text-white/25">No data yet</p>
      </div>
    );
  }

  const chartH = 72;
  const yLabels = 4;
  const maxMs = okBeats.length > 0 ? Math.max(...okBeats.map(b => b.latencyMs), 10) : 100;
  // Round up to a clean ceiling
  const ceilMs = Math.ceil(maxMs / 10) * 10;
  const barW = Math.max(3, Math.floor((100 / beats.length)));

  function barColor(b: Beat): string {
    if (!b.ok) return "#ef4444";
    if (b.latencyMs < 100) return "#22c55e";
    if (b.latencyMs < 500) return "#f59e0b";
    return "#ef4444";
  }

  function barHeight(b: Beat): number {
    if (!b.ok) return chartH * 0.15;
    return Math.max(2, (b.latencyMs / ceilMs) * chartH);
  }

  const yTicks = Array.from({ length: yLabels }, (_, i) =>
    Math.round((ceilMs / (yLabels - 1)) * (yLabels - 1 - i))
  );

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between shrink-0 w-10 text-right" style={{ height: chartH }}>
          {yTicks.map(v => (
            <span key={v} className="text-[9px] text-white/25 font-mono leading-none">{v}ms</span>
          ))}
        </div>

        {/* Chart area */}
        <div
          className="flex-1 relative bg-white/3 rounded-md overflow-hidden border border-white/6"
          style={{ height: chartH }}
        >
          {/* Grid lines */}
          {yTicks.map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-white/6"
              style={{ bottom: `${(i / (yLabels - 1)) * 100}%` }}
            />
          ))}

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-px px-1">
            {beats.map((b, i) => (
              <div
                key={i}
                className="flex-1 relative flex items-end cursor-default"
                style={{ height: "100%" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div
                  className="w-full rounded-sm transition-opacity"
                  style={{
                    height: barHeight(b),
                    backgroundColor: barColor(b),
                    opacity: hovered === i ? 1 : 0.65,
                    minWidth: barW,
                  }}
                />
                {/* Tooltip */}
                {hovered === i && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 pointer-events-none">
                    <div className="bg-[#1a1d2e] border border-white/15 rounded-md px-2 py-1.5 text-[10px] text-white/80 whitespace-nowrap shadow-xl">
                      <div className="font-medium" style={{ color: barColor(b) }}>
                        {b.ok ? `${b.latencyMs}ms` : "FAIL"}
                      </div>
                      <div className="text-white/40 mt-0.5">{new Date(b.ts).toLocaleTimeString()}</div>
                      {b.errorMsg && <div className="text-red-400/70 mt-0.5 max-w-[160px] truncate">{b.errorMsg}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* X-axis: time range */}
      {beats.length > 0 && (
        <div className="flex justify-between pl-12 text-[9px] text-white/20 font-mono">
          <span>{formatTs(beats[0].ts)}</span>
          <span>{formatTs(beats[beats.length - 1].ts)}</span>
        </div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  sublabel,
  value,
  valueColor,
}: {
  label: string;
  sublabel: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="text-[10px] text-white/20 mt-0.5">{sublabel}</p>
      <p
        className="text-xl font-bold tabular-nums mt-1.5"
        style={{ color: valueColor ?? "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uptimeColor(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  if (pct >= 99) return "#4ade80";
  if (pct >= 95) return "#fbbf24";
  return "#f87171";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
