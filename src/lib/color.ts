export function darken(hex: string, amount: number): string {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function pickColor(raw: string, theme: "dark" | "light"): string {
  return theme === "light" ? darken(raw, 0.42) : raw;
}
