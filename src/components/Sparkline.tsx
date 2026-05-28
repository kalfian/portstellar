import type { ApiHistoryPoint } from "../lib/api";

interface Props {
  points: ApiHistoryPoint[];
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Mini SVG sparkline showing latency over time.
 * Green dots = ok, red dots = fail. Line shows latency trend.
 */
export function Sparkline({ points, width = 320, height = 48, color = "#4ade80" }: Props) {
  if (points.length < 2) return null;

  const maxLatency = Math.max(...points.map((p) => p.latencyMs), 1);
  const padY = 4;
  const usableH = height - padY * 2;

  // Map points to x,y coordinates
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: padY + usableH - (Math.min(p.latencyMs, maxLatency) / maxLatency) * usableH,
    ok: p.ok,
    latency: p.latencyMs,
  }));

  // Build SVG path for the line
  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  // Gradient fill path (area under curve)
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill="url(#spark-fill)" />

      {/* Latency line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Failure markers */}
      {coords
        .filter((c) => !c.ok)
        .map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={padY + usableH / 2}
            r={2}
            fill="#f87171"
            opacity={0.9}
          />
        ))}
    </svg>
  );
}

/**
 * Returns a color based on latency value:
 * - Green: < 100ms (healthy)
 * - Yellow: 100-500ms (degraded)
 * - Red: > 500ms or fail (bad)
 */
export function latencyColor(latencyMs: number | undefined, ok: boolean): string {
  if (!ok) return "#f87171";
  if (latencyMs === undefined) return "#4ade80";
  if (latencyMs < 100) return "#4ade80";
  if (latencyMs < 500) return "#fbbf24";
  return "#f87171";
}

export function latencyColorLight(latencyMs: number | undefined, ok: boolean): string {
  if (!ok) return "#b91c1c";
  if (latencyMs === undefined) return "#15803d";
  if (latencyMs < 100) return "#15803d";
  if (latencyMs < 500) return "#a16207";
  return "#b91c1c";
}
