import { useEffect, useState } from "react";

export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}
export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
