import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchConfig, fetchPingsLatest } from "../lib/api";

const STAT_CONFIG = [
  { key: "hosts",    label: "Hosts",    color: "#60a5fa", bg: "bg-blue-500/10",  border: "border-blue-500/20"  },
  { key: "services", label: "Services", color: "#a78bfa", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  { key: "up",       label: "Online",   color: "#34d399", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { key: "down",     label: "Offline",  color: "#f87171", bg: "bg-red-500/10",   border: "border-red-500/20"   },
] as const;

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ hosts: 0, services: 0, up: 0, down: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchConfig(), fetchPingsLatest()]).then(([cfg, pings]) => {
      const c = cfg as any;
      const hosts = c.hosts?.length ?? 0;
      const services = (c.hosts ?? []).reduce((n: number, h: any) => n + (h.services?.length ?? 0), 0);
      const up = (pings ?? []).filter((p: any) => p.ok).length;
      const down = (pings ?? []).length - up;
      setStats({ hosts, services, up, down });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const uptime = stats.services > 0 ? Math.round((stats.up / stats.services) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">Overview of your homelab infrastructure</p>
        </div>
        <Link
          to="/admin/config"
          className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-lg px-3 py-1.5 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          Edit Config
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_CONFIG.map(({ key, label, color, bg, border }) => (
          <div key={key} className={`${bg} border ${border} rounded-xl p-4 space-y-2`}>
            <p className="text-xs font-medium text-white/40">{label}</p>
            <p
              className="text-3xl font-bold tabular-nums tracking-tight"
              style={{ color }}
            >
              {loading ? <span className="opacity-30">—</span> : stats[key]}
            </p>
          </div>
        ))}
      </div>

      {/* Status banner */}
      {!loading && stats.services > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-5 flex items-center gap-5">
          {/* Uptime ring */}
          <div className="relative w-16 h-16 shrink-0">
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke={uptime !== null && uptime >= 90 ? "#34d399" : uptime !== null && uptime >= 70 ? "#fbbf24" : "#f87171"}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - (uptime ?? 0) / 100)}`}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-white">{uptime}%</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">
              {stats.up} of {stats.services} services online
            </p>
            <p className="text-xs text-white/40 mt-1">
              {stats.down === 0
                ? "All services are reachable"
                : `${stats.down} service${stats.down > 1 ? "s" : ""} unreachable — check your config`
              }
            </p>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickLink to="/admin/config" icon="⚙" title="Config Editor" desc="Add or edit hosts and services" />
        <QuickLink to="/admin/settings" icon="🔑" title="Security" desc="Change admin password" />
      </div>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 bg-white/3 hover:bg-white/5 border border-white/8 hover:border-white/14 rounded-xl p-4 transition-colors group"
    >
      <span className="text-2xl opacity-60 group-hover:opacity-80 transition-opacity">{icon}</span>
      <div>
        <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{title}</p>
        <p className="text-xs text-white/30 mt-0.5">{desc}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto text-white/20 group-hover:text-white/50 transition-colors shrink-0">
        <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  );
}
