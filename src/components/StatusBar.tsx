import { useClock, fmtDate, fmtTime } from "../lib/clock";
import type { PortsConfig } from "../types";
import type { PingMap } from "../lib/ping";
import { useWs } from "../lib/WsContext";

interface Props {
  data: PortsConfig | null;
  pings: PingMap;
  onToggleTheme: () => void;
  theme: "dark" | "light";
  onResetPositions: () => void;
  customCount: number;
  pingMode: "simulated" | "remote" | "live-ws";
  source: "api" | "static" | null;
}

export function StatusBar({
  data,
  pings,
  onToggleTheme,
  theme,
  onResetPositions,
  customCount,
  pingMode,
  source,
}: Props) {
  const now = useClock();
  const hosts = data?.hosts.length ?? 0;
  const services = data?.services.length ?? 0;

  // Count from live ping results — fall back to config status when no pings yet
  const pingValues = Object.values(pings);
const up = pingValues.filter((p) => p.state === "ok").length;
  const down = pingValues.filter((p) => p.state === "fail").length;

  return (
    <header className="border-b border-current/20 dark:border-phos/25 select-none">
      <div className="flex items-stretch text-[11px] uppercase tracking-[0.18em]">
        <div className="px-4 py-2.5 border-r border-current/20 dark:border-phos/25 flex items-center gap-3">
          <span className="font-display font-bold text-[18px] leading-none phos-glow tracking-[0.04em]">
            svc<span className="opacity-60">/</span>disc
          </span>
          {data?.name && (
            <span className="hidden md:inline text-[11px] tracking-[0.18em] opacity-85 normal-case">
              <span className="opacity-50">·</span>{" "}
              <span className="font-display font-medium tracking-tight normal-case">
                {data.name}
              </span>
            </span>
          )}
        </div>

        <Stat label="hosts" value={hosts} />
        <Stat label="svc" value={services} />
        <Stat label="up" value={up} color="phos-glow" />
        <Stat label="down" value={down} color="text-[#ff5757]" />

        <div className="ml-auto flex items-stretch">
          <ModeBadge pingMode={pingMode} source={source} />
          {customCount > 0 && (
            <button
              onClick={onResetPositions}
              className="px-3 border-l border-current/20 dark:border-phos/25 hover:bg-phos/10 transition-colors uppercase tracking-[0.18em] flex items-center gap-1.5"
              title="Reset all custom positions"
            >
              <span className="opacity-60">reset</span>
              <span className="font-display font-semibold phos-glow tabular-nums">
                {customCount}
              </span>
            </button>
          )}
          <div className="hidden sm:flex items-center px-4 border-l border-current/20 dark:border-phos/25 gap-3 tabular-nums">
            <span className="opacity-50">{fmtDate(now)}</span>
            <span className="phos-glow text-phos">{fmtTime(now)}</span>
            <span className="opacity-50 animate-blink">_</span>
          </div>
          <button
            onClick={onToggleTheme}
            className="px-4 border-l border-current/20 dark:border-phos/25 hover:bg-phos/10 transition-colors uppercase tracking-[0.18em]"
            title="Toggle theme"
          >
            <span className="opacity-60">[</span>
            {theme === "dark" ? "drk" : "lgt"}
            <span className="opacity-60">]</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="hidden md:flex items-center px-4 border-r border-current/20 dark:border-phos/25 gap-2">
      <span className="opacity-50">{label}</span>
      <span
        className={`font-display font-semibold text-[16px] leading-none tabular-nums ${
          color ?? ""
        }`}
      >
        {String(value).padStart(2, "0")}
      </span>
    </div>
  );
}

function ModeBadge({
  pingMode,
  source,
}: {
  pingMode: "simulated" | "remote" | "live-ws";
  source: "api" | "static" | null;
}) {
  const { connected: wsConnected } = useWs();
  const isWs = pingMode === "live-ws" && wsConnected;
  const isLive = isWs || (pingMode === "remote" && source === "api");

  let label: string;
  let title: string;
  if (isWs) {
    label = "live ws";
    title = "WebSocket connected — real-time push updates";
  } else if (isLive) {
    label = "live";
    title = "Connected to backend — real ping data (polling)";
  } else {
    label = "offline";
    title = "Offline mode — simulated ping data";
  }

  return (
    <div
      className="hidden sm:flex items-center px-3 border-l border-current/20 dark:border-phos/25 gap-1.5"
      title={title}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          isWs
            ? "bg-sky-400 shadow-[0_0_4px_theme(colors.sky.400)]"
            : isLive
            ? "bg-emerald-400 shadow-[0_0_4px_theme(colors.emerald.400)]"
            : "bg-amber-400 shadow-[0_0_4px_theme(colors.amber.400)]"
        }`}
      />
      <span className="opacity-70 text-[10px] tracking-[0.18em] uppercase">
        {label}
      </span>
    </div>
  );
}
