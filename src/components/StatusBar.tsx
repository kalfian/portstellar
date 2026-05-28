import { useClock, fmtDate, fmtTime } from "../lib/clock";
import type { PortsConfig } from "../types";

interface Props {
  data: PortsConfig | null;
  onToggleTheme: () => void;
  theme: "dark" | "light";
  onResetPositions: () => void;
  customCount: number;
}

export function StatusBar({
  data,
  onToggleTheme,
  theme,
  onResetPositions,
  customCount,
}: Props) {
  const now = useClock();
  const hosts = data?.hosts.length ?? 0;
  const services = data?.services.length ?? 0;
  const running = data?.services.filter((s) => s.status === "running").length ?? 0;
  const stopped = data?.services.filter((s) => s.status === "stopped").length ?? 0;

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
        <Stat label="up" value={running} color="phos-glow" />
        <Stat label="down" value={stopped} color="text-[#ff5757]" />

        <div className="ml-auto flex items-stretch">
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
