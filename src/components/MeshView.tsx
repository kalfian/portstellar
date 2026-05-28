import { useEffect, useMemo, useRef, useState } from "react";
import type { Host, Service, Category } from "../types";
import type { PosMap, Pos } from "../lib/positions";
import { pickColor } from "../lib/color";
import type { PingMap } from "../lib/ping";
import { latencyColor, latencyColorLight } from "./Sparkline";

interface Props {
  hosts: Host[];
  services: Service[];
  categories: Category[];
  positions: PosMap;
  hostPositions: PosMap;
  theme: "dark" | "light";
  pings: PingMap;
  onMove: (id: string, pos: Pos) => void;
  onMoveHost: (id: string, pos: Pos) => void;
  onPick: (s: Service) => void;
}


interface HostInfo {
  host: Host;
  index: number;
  services: Service[];
  rings: number;
  baseR: number;
  maxR: number;
  cx: number;
  cy: number;
  customCenter: boolean;
}

interface Placed {
  s: Service;
  hostInfo: HostInfo;
  x: number;
  y: number;
  custom: boolean;
}

const PADDING = 110;
const BASE_R = 200;
const PER_RING = 14;
const RING_STEP = 130;
const ZMIN = 0.2;
const ZMAX = 3;

function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 1600 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return vp;
}

function layoutHosts(
  hosts: Host[],
  services: Service[],
  hostPositions: PosMap,
  viewport: { w: number; h: number }
) {
  const infos = hosts.map((h, index) => {
    const svc = services
      .filter((s) => s.host === h.id)
      .sort((a, b) => a.port - b.port);
    const rings = Math.max(1, Math.ceil(svc.length / PER_RING));
    const maxR = BASE_R + (rings - 1) * RING_STEP;
    return { host: h, index, services: svc, rings, baseR: BASE_R, maxR };
  });

  const N = infos.length;
  if (N === 0) return { canvasW: viewport.w, canvasH: viewport.h, infos: [] as HostInfo[] };

  let baseW = 600;
  let baseH = 600;
  let defaults: { cx: number; cy: number }[] = [];

  if (N === 1) {
    const a = infos[0];
    baseW = (a.maxR + PADDING) * 2;
    baseH = baseW;
    defaults = [{ cx: baseW / 2, cy: baseH / 2 }];
  } else if (N === 2) {
    const [A, B] = infos;
    const chipClearance = 220;
    const gap = A.maxR + B.maxR + chipClearance;
    baseW = A.maxR + gap + B.maxR + PADDING * 2;
    baseH = Math.max(A.maxR, B.maxR) * 2 + PADDING * 2;
    defaults = [
      { cx: PADDING + A.maxR, cy: baseH / 2 },
      { cx: PADDING + A.maxR + gap, cy: baseH / 2 },
    ];
  } else if (N === 3) {
    const [top, left, right] = infos;
    const chipClearance = 220;
    const hGap =
      (left.maxR + right.maxR) * 0.78 + chipClearance * 0.25;
    const vGap =
      (top.maxR + Math.max(left.maxR, right.maxR)) * 0.74 +
      chipClearance * 0.2;

    const points = [
      { r: top.maxR, x: 0, y: -vGap / 2 },
      { r: left.maxR, x: -hGap / 2, y: vGap / 2 },
      { r: right.maxR, x: hGap / 2, y: vGap / 2 },
    ];

    const minX = Math.min(...points.map((p) => p.x - p.r));
    const maxX = Math.max(...points.map((p) => p.x + p.r));
    const minY = Math.min(...points.map((p) => p.y - p.r));
    const maxY = Math.max(...points.map((p) => p.y + p.r));

    baseW = maxX - minX + PADDING * 2;
    baseH = maxY - minY + PADDING * 2;

    defaults = points.map((p) => ({
      cx: p.x - minX + PADDING,
      cy: p.y - minY + PADDING,
    }));
  } else {
    const maxHostR = Math.max(...infos.map((h) => h.maxR));
    const chordPerHost = maxHostR * 2 + 220;
    const ringR = Math.max(maxHostR * 1.6, chordPerHost / (2 * Math.sin(Math.PI / N)));
    const size = (ringR + maxHostR + PADDING) * 2;
    baseW = size;
    baseH = size;
    defaults = infos.map((_, i) => {
      const ang = -Math.PI / 2 + (i / N) * Math.PI * 2;
      return {
        cx: size / 2 + ringR * Math.cos(ang),
        cy: size / 2 + ringR * Math.sin(ang),
      };
    });
  }

  // Expand canvas to be at least viewport-sized for free roaming
  const canvasW = Math.max(baseW, viewport.w);
  const canvasH = Math.max(baseH, viewport.h);
  const offsetX = (canvasW - baseW) / 2;
  const offsetY = (canvasH - baseH) / 2;
  defaults = defaults.map((d) => ({ cx: d.cx + offsetX, cy: d.cy + offsetY }));

  const finalInfos: HostInfo[] = infos.map((info, i) => {
    const custom = hostPositions[info.host.id];
    return {
      ...info,
      cx: custom ? custom.x : defaults[i].cx,
      cy: custom ? custom.y : defaults[i].cy,
      customCenter: !!custom,
    };
  });

  return { canvasW, canvasH, infos: finalInfos };
}

function placeServices(info: HostInfo): { s: Service; x: number; y: number }[] {
  const n = info.services.length;
  if (n === 0) return [];
  const out: { s: Service; x: number; y: number }[] = [];
  let idx = 0;
  for (let r = 0; r < info.rings; r++) {
    const ringR = info.baseR + r * RING_STEP;
    const ringCount = Math.min(PER_RING, n - idx);
    const offset = r % 2 === 1 ? Math.PI / ringCount : 0;
    for (let i = 0; i < ringCount; i++) {
      const angle = -Math.PI / 2 + offset + (i / ringCount) * Math.PI * 2;
      out.push({
        s: info.services[idx++],
        x: info.cx + ringR * Math.cos(angle),
        y: info.cy + ringR * Math.sin(angle),
      });
    }
  }
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function MeshView({
  hosts,
  services,
  categories,
  positions,
  hostPositions,
  theme,
  pings,
  onMove,
  onMoveHost,
  onPick,
}: Props) {
  const catById = useMemo(
    () =>
      new Map(
        categories.map((c) => [
          c.id,
          { ...c, color: pickColor(c.color, theme) },
        ])
      ),
    [categories, theme]
  );
  const vp = useViewport();
  const { canvasW, canvasH, infos } = useMemo(
    () => layoutHosts(hosts, services, hostPositions, vp),
    [hosts, services, hostPositions, vp]
  );

  const placed: Placed[] = useMemo(
    () =>
      infos.flatMap((info) =>
        placeServices(info).map((p) => {
          const custom = positions[p.s.id];
          return custom
            ? { s: p.s, hostInfo: info, x: custom.x, y: custom.y, custom: true }
            : { s: p.s, hostInfo: info, x: p.x, y: p.y, custom: false };
        })
      ),
    [infos, positions]
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingHostId, setDraggingHostId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Fit on first load
  useEffect(() => {
    if (didInitFit.current || infos.length === 0) return;
    requestAnimationFrame(() => {
      fitToScreen();
      didInitFit.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infos.length]);

  // Wheel zoom centered on cursor (no modifier required)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = zoomRef.current;
      // Smooth step, normalize across mice & trackpads
      const intensity = Math.min(Math.abs(e.deltaY), 80) / 80;
      const step = 0.08 * intensity;
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
      const nz = clamp(z * factor, ZMIN, ZMAX);
      if (nz === z) return;

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const sx = el.scrollLeft;
      const sy = el.scrollTop;
      const px = (sx + cx) / z;
      const py = (sy + cy) / z;

      setZoom(nz);
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollLeft = px * nz - cx;
        el.scrollTop = py * nz - cy;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag-to-pan on empty canvas (chip/sun stopPropagation so they're excluded)
  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startSL = el.scrollLeft;
    const startST = el.scrollTop;
    let moved = false;

    const onMoveEv = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setPanning(true);
      el.scrollLeft = startSL - dx;
      el.scrollTop = startST - dy;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setPanning(false);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startDragChip = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = placed.find((p) => p.s.id === id);
    if (!cur) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = cur.x;
    const baseY = cur.y;
    let moved = false;

    const onMoveEv = (me: PointerEvent) => {
      const z = zoomRef.current;
      const dx = (me.clientX - startX) / z;
      const dy = (me.clientY - startY) / z;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDraggingId(id);
      onMove(id, { x: baseX + dx, y: baseY + dy });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!moved) {
        const svc = services.find((s) => s.id === id);
        if (svc) onPick(svc);
      }
      setDraggingId(null);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startDragHost = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = infos.find((i) => i.host.id === id);
    if (!cur) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseHostX = cur.cx;
    const baseHostY = cur.cy;

    // Capture base positions of services with custom positions belonging to this host
    const baseSvcCustom: { id: string; x: number; y: number }[] = [];
    for (const p of placed) {
      if (p.hostInfo.host.id === id && p.custom) {
        baseSvcCustom.push({ id: p.s.id, x: p.x, y: p.y });
      }
    }

    const onMoveEv = (me: PointerEvent) => {
      const z = zoomRef.current;
      const dx = (me.clientX - startX) / z;
      const dy = (me.clientY - startY) / z;
      setDraggingHostId(id);
      const newX = baseHostX + dx;
      const newY = baseHostY + dy;
      onMoveHost(id, { x: newX, y: newY });
      // Move custom-positioned services by the same delta
      for (const s of baseSvcCustom) {
        onMove(s.id, { x: s.x + dx, y: s.y + dy });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDraggingHostId(null);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const setZoomAround = (nz: number) => {
    const el = scrollRef.current;
    const z = zoomRef.current;
    const clamped = clamp(nz, ZMIN, ZMAX);
    if (!el) {
      setZoom(clamped);
      return;
    }
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    const px = (el.scrollLeft + cx) / z;
    const py = (el.scrollTop + cy) / z;
    setZoom(clamped);
    requestAnimationFrame(() => {
      el.scrollLeft = px * clamped - cx;
      el.scrollTop = py * clamped - cy;
    });
  };

  const didInitFit = useRef(false);

  const fitToScreen = () => {
    const el = scrollRef.current;
    if (!el || infos.length === 0) return;
    const pad = 60;
    const CHIP_HW = 80; // chip half-width (incl. label overflow)
    const CHIP_HH = 32;
    const SUN_HW = 90; // sun core glow extent
    const SUN_HH = 70;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const i of infos) {
      minX = Math.min(minX, i.cx - SUN_HW);
      minY = Math.min(minY, i.cy - SUN_HH);
      maxX = Math.max(maxX, i.cx + SUN_HW);
      maxY = Math.max(maxY, i.cy + SUN_HH);
    }
    for (const p of placed) {
      minX = Math.min(minX, p.x - CHIP_HW);
      minY = Math.min(minY, p.y - CHIP_HH);
      maxX = Math.max(maxX, p.x + CHIP_HW);
      maxY = Math.max(maxY, p.y + CHIP_HH);
    }

    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const zX = (el.clientWidth - pad * 2) / bboxW;
    const zY = (el.clientHeight - pad * 2) / bboxH;
    const nz = clamp(Math.min(zX, zY), ZMIN, ZMAX);
    const bcx = (minX + maxX) / 2;
    const bcy = (minY + maxY) / 2;
    setZoom(nz);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = bcx * nz - el.clientWidth / 2;
      scrollRef.current.scrollTop = bcy * nz - el.clientHeight / 2;
    });
  };

  return (
    <div className="flex-1 relative overflow-hidden">
      <ZoomControls
        zoom={zoom}
        onIn={() => setZoomAround(zoom * 1.2)}
        onOut={() => setZoomAround(zoom / 1.2)}
        onReset={() => setZoomAround(1)}
        onFit={fitToScreen}
      />

      <div
        ref={scrollRef}
        onPointerDown={startPan}
        className="absolute inset-0 overflow-auto overscroll-contain no-scrollbar"
        style={{
          cursor: panning || draggingHostId ? "grabbing" : "grab",
        }}
      >
        <div
          style={{
            width: canvasW * zoom,
            height: canvasH * zoom,
          }}
        >
          <div
            className="relative origin-top-left"
            style={{
              width: canvasW,
              height: canvasH,
              transform: `scale(${zoom})`,
            }}
          >
            {/* Per-host radial backdrop */}
            {infos.map((info) => (
              <div
                key={`bg-${info.host.id}`}
                className="absolute pointer-events-none host-backdrop"
                style={{
                  left: info.cx - info.maxR - 60,
                  top: info.cy - info.maxR - 60,
                  width: (info.maxR + 60) * 2,
                  height: (info.maxR + 60) * 2,
                }}
              />
            ))}

            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasW}
              height={canvasH}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              aria-hidden
            >
              {infos.length >= 2 &&
                infos.map((a, i) =>
                  infos.slice(i + 1).map((b) => (
                    <line
                      key={`link-${a.host.id}-${b.host.id}`}
                      x1={a.cx}
                      y1={a.cy}
                      x2={b.cx}
                      y2={b.cy}
                      stroke="#5fa8ff"
                      strokeOpacity={0.22}
                      strokeWidth={1}
                      strokeDasharray="2 8"
                    />
                  ))
                )}

              {infos.map((info) => (
                <g key={`rings-${info.host.id}`}>
                  {Array.from({ length: info.rings }).map((_, r) => (
                    <circle
                      key={`r-${r}`}
                      cx={info.cx}
                      cy={info.cy}
                      r={info.baseR + r * RING_STEP}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={0.2}
                      strokeDasharray="2 6"
                      className="orbit-ring"
                    />
                  ))}
                  <circle
                    cx={info.cx}
                    cy={info.cy}
                    r={info.baseR - 60}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.14}
                    strokeDasharray="1 4"
                  />
                  {[0, 90, 180, 270].map((deg) => {
                    const a = (deg - 90) * (Math.PI / 180);
                    const r1 = info.maxR + 10;
                    const r2 = r1 + 14;
                    return (
                      <line
                        key={deg}
                        x1={info.cx + r1 * Math.cos(a)}
                        y1={info.cy + r1 * Math.sin(a)}
                        x2={info.cx + r2 * Math.cos(a)}
                        y2={info.cy + r2 * Math.sin(a)}
                        stroke="currentColor"
                        strokeOpacity={0.4}
                      />
                    );
                  })}
                  <circle
                    cx={info.cx}
                    cy={info.cy}
                    r={70}
                    fill="none"
                    stroke="#5fa8ff"
                    strokeOpacity={info.customCenter ? 0.6 : 0.4}
                  />
                  <circle
                    cx={info.cx}
                    cy={info.cy}
                    r={86}
                    fill="none"
                    stroke="#5fa8ff"
                    strokeOpacity={0.2}
                  />
                </g>
              ))}

              {placed.map(({ s, hostInfo, x, y, custom }) => {
                const cat = s.category ? catById.get(s.category) : undefined;
                const baseColor = cat?.color ?? "#9aa0a6";
                const ping = pings[s.id];
                const dx = x - hostInfo.cx;
                const dy = y - hostInfo.cy;
                const len = Math.hypot(dx, dy) || 1;
                const startR = Math.min(56, len * 0.25);
                const endR = Math.max(len - 50, len * 0.6);
                const sx = hostInfo.cx + (dx / len) * startR;
                const sy = hostInfo.cy + (dy / len) * startR;
                const ex = hostInfo.cx + (dx / len) * endR;
                const ey = hostInfo.cy + (dy / len) * endR;

                const isOk = ping?.state === "ok";
                const isFail = ping?.state === "fail";
                const isPinging = ping?.state === "pinging";

                const okColor = theme === "light"
                  ? latencyColorLight(ping?.latencyMs, true)
                  : latencyColor(ping?.latencyMs, true);
                const failColor = theme === "light" ? "#b91c1c" : "#f87171";
                const probColor = theme === "light" ? "#64748b" : "#94a3b8";

                const stroke = isOk
                  ? okColor
                  : isFail
                    ? failColor
                    : isPinging
                      ? probColor
                      : baseColor;

                const dasharray = isOk
                  ? "5 5"
                  : isPinging
                    ? "3 5"
                    : isFail
                      ? "2 4"
                      : undefined;

                const animClass = isOk
                  ? "ray-flow"
                  : isPinging
                    ? "ray-flow-fast"
                    : undefined;

                return (
                  <g key={`ray-${s.id}`}>
                    <line
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke={stroke}
                      strokeOpacity={
                        isFail
                          ? 0.9
                          : isOk
                            ? 0.85
                            : custom
                              ? 0.75
                              : 0.55
                      }
                      strokeWidth={isOk || isFail ? 1.4 : custom ? 1.4 : 1}
                      strokeDasharray={dasharray}
                      className={animClass}
                    />
                    {/* Endpoint dot or X marker */}
                    {isFail ? (
                      <g
                        transform={`translate(${ex} ${ey})`}
                        className="ping-x"
                      >
                        <circle r={6.5} fill={failColor} fillOpacity={0.12} />
                        <line
                          x1={-3.5}
                          y1={-3.5}
                          x2={3.5}
                          y2={3.5}
                          stroke={failColor}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                        />
                        <line
                          x1={-3.5}
                          y1={3.5}
                          x2={3.5}
                          y2={-3.5}
                          stroke={failColor}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                        />
                      </g>
                    ) : (
                      <circle
                        cx={ex}
                        cy={ey}
                        r={isOk ? 3 : 2.5}
                        fill={stroke}
                        fillOpacity={0.95}
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Sun cores — draggable */}
            {infos.map((info) => {
              const okCount = info.services.filter(
                (s) => pings[s.id]?.state === "ok"
              ).length;
              const hasAnyPing = info.services.some((s) => pings[s.id]);
              const dragging = draggingHostId === info.host.id;
              return (
                <div
                  key={`core-${info.host.id}`}
                  onPointerDown={(e) => startDragHost(info.host.id, e)}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 select-none text-center touch-none z-30 transition-transform ${
                    dragging
                      ? "cursor-grabbing scale-105"
                      : "cursor-grab hover:scale-[1.03]"
                  }`}
                  style={{ left: info.cx, top: info.cy }}
                  title={`drag to move ${info.host.name}`}
                >
                  <div
                    className="absolute -inset-12 rounded-full host-backdrop"
                    style={{ pointerEvents: "none" }}
                  />
                  <div
                    className="host-name relative font-display leading-none"
                    style={{ fontSize: 44 }}
                  >
                    {info.host.name}
                    {info.customCenter && (
                      <span
                        className="absolute -top-2 -right-3 text-[10px] opacity-70"
                        title="custom position"
                      >
                        ✦
                      </span>
                    )}
                  </div>
                  <div className="relative text-[11px] font-mono opacity-90 tabular-nums mt-1.5">
                    {info.host.ip}
                  </div>
                  <div className="relative text-[10px] uppercase tracking-[0.22em] opacity-90 mt-1 tabular-nums">
                    {hasAnyPing ? (
                      <>
                        <span className="phos-glow">
                          {String(okCount).padStart(2, "0")}
                        </span>
                        <span className="opacity-60">
                          /{String(info.services.length).padStart(2, "0")}
                        </span>{" "}
                        up
                      </>
                    ) : (
                      <span className="opacity-40">
                        {String(info.services.length).padStart(2, "0")} svc
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Service chips */}
            {placed.map((p) => {
              const cat = p.s.category ? catById.get(p.s.category) : undefined;
              return (
                <OrbitChip
                  key={p.s.id}
                  x={p.x}
                  y={p.y}
                  service={p.s}
                  category={cat}
                  custom={p.custom}
                  dragging={draggingId === p.s.id}
                  onPointerDown={(e) => startDragChip(p.s.id, e)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  onIn,
  onOut,
  onReset,
  onFit,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div className="surface absolute bottom-4 right-4 z-40 flex border">
      <button
        onClick={onOut}
        className="px-3 py-2 text-[14px] font-mono hover:bg-phos/15 transition-colors border-r border-current/25 dark:border-phos/30"
        title="zoom out"
      >
        −
      </button>
      <button
        onClick={onReset}
        className="px-3 py-2 text-[11px] font-mono uppercase tracking-[0.15em] hover:bg-phos/15 transition-colors border-r border-current/25 dark:border-phos/30 tabular-nums min-w-[70px]"
        title="reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onIn}
        className="px-3 py-2 text-[14px] font-mono hover:bg-phos/15 transition-colors border-r border-current/25 dark:border-phos/30"
        title="zoom in"
      >
        +
      </button>
      <button
        onClick={onFit}
        className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] hover:bg-phos/15 transition-colors"
        title="fit to screen"
      >
        fit
      </button>
    </div>
  );
}

function OrbitChip({
  x,
  y,
  service,
  category,
  custom,
  dragging,
  onPointerDown,
}: {
  x: number;
  y: number;
  service: Service;
  category?: Category;
  custom: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const color = category?.color ?? "#9aa0a6";

  return (
    <div
      onPointerDown={onPointerDown}
      role="button"
      tabIndex={0}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none transition-transform ${
        dragging
          ? "cursor-grabbing scale-105 z-20"
          : "cursor-grab hover:scale-105 focus:scale-105 z-10"
      }`}
      style={{ left: x, top: y, ["--c" as string]: color }}
    >
      <div
        className="chip border px-2.5 py-1.5 min-w-[96px] backdrop-blur-[1px] transition-colors shadow-[0_0_18px_-6px_var(--c)]"
        style={{
          boxShadow: dragging ? `0 0 24px -2px ${color}` : undefined,
        }}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-display font-bold text-[20px] leading-none tabular-nums"
            style={{ color }}
          >
            {service.port}
          </span>
          {service.protocol === "udp" && (
            <span className="text-[9px] uppercase tracking-widest opacity-70">
              udp
            </span>
          )}
          {custom && (
            <span
              className="ml-auto text-[9px] opacity-60"
              title="custom position"
            >
              ✦
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="text-[9px] leading-none opacity-80"
            style={{ color }}
            aria-hidden
          >
            ●
          </span>
          <span
            className="text-[11px] tracking-tight opacity-95 truncate max-w-[140px] font-mono font-medium"
            title={service.name}
          >
            {service.name}
          </span>
        </div>
      </div>
    </div>
  );
}
