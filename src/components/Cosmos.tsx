import { useMemo } from "react";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
  twinkle: boolean;
  delay: number;
}

interface ConstStar {
  x: number; // percent
  y: number; // percent
  r: number;
}

export function Cosmos() {
  const stars = useMemo<Star[]>(() => {
    const rnd = mulberry32(20260528);
    const arr: Star[] = [];
    for (let i = 0; i < 180; i++) {
      arr.push({
        x: rnd() * 100,
        y: rnd() * 100,
        r: 0.3 + rnd() * 0.8,
        o: 0.1 + rnd() * 0.35,
        twinkle: rnd() > 0.85,
        delay: rnd() * 4,
      });
    }
    return arr;
  }, []);

  // Constellations: positions are direct percentages
  const constellations = useMemo(() => {
    const rnd = mulberry32(424242);
    const centers = [
      { x: 12, y: 20 },
      { x: 82, y: 18 },
      { x: 18, y: 78 },
      { x: 74, y: 80 },
      { x: 50, y: 12 },
      { x: 92, y: 55 },
    ];
    return centers.map((c) => {
      const n = 4 + Math.floor(rnd() * 2);
      const points: ConstStar[] = [];
      for (let i = 0; i < n; i++) {
        points.push({
          x: c.x + (rnd() * 7 - 3.5),
          y: c.y + (rnd() * 5 - 2.5),
          r: 1 + rnd() * 1.4,
        });
      }
      const lines: { a: number; b: number }[] = [];
      for (let i = 0; i < n - 1; i++) lines.push({ a: i, b: i + 1 });
      return { points, lines };
    });
  }, []);

  return (
    <div className="cosmos pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* ───── DARK ───── */}
      <div
        className="cosmos-ambient absolute -top-40 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,102,204,0.10) 0%, rgba(0,102,204,0.04) 35%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <svg className="cosmos-stars absolute inset-0 w-full h-full">
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#aac4e6"
            opacity={s.o}
            className={s.twinkle ? "twinkle" : undefined}
            style={
              s.twinkle
                ? ({ animationDelay: `${s.delay}s` } as React.CSSProperties)
                : undefined
            }
          />
        ))}
      </svg>

      {/* ───── LIGHT ───── */}
      {/* Blueprint grid */}
      <div className="cosmos-grid absolute inset-0" aria-hidden />

      {/* Soft warm corner accent */}
      <div
        className="cosmos-corner absolute -top-32 -left-32 w-[520px] h-[520px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255, 200, 140, 0.18) 0%, rgba(255, 200, 140, 0.05) 40%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <div
        className="cosmos-corner absolute -bottom-40 -right-32 w-[540px] h-[540px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(120, 170, 230, 0.16) 0%, rgba(120, 170, 230, 0.05) 40%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Constellation map */}
      <svg className="cosmos-constellations absolute inset-0 w-full h-full">
        {constellations.map((g, gi) => (
          <g key={gi}>
            {g.lines.map((l, li) => {
              const a = g.points[l.a];
              const b = g.points[l.b];
              return (
                <line
                  key={li}
                  x1={`${a.x}%`}
                  y1={`${a.y}%`}
                  x2={`${b.x}%`}
                  y2={`${b.y}%`}
                  stroke="rgba(10, 22, 40, 0.18)"
                  strokeWidth={0.7}
                  strokeDasharray="2 4"
                />
              );
            })}
            {g.points.map((p, pi) => (
              <circle
                key={pi}
                cx={`${p.x}%`}
                cy={`${p.y}%`}
                r={p.r}
                fill="rgba(10, 22, 40, 0.42)"
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
