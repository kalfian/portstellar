import { useEffect, useState } from "react";
import type { Host, Service } from "../types";

export type PingState = "idle" | "pinging" | "ok" | "fail";

export interface PingResult {
  state: PingState;
  lastChecked?: number;
  latencyMs?: number;
}

export type PingMap = Record<string, PingResult>;

function simulate(s: Service): boolean {
  if (s.status === "stopped") return false;
  if (s.status === "reserved") return Math.random() < 0.4;
  if (s.status === "unknown") return Math.random() < 0.6;
  // running: high success with occasional flap
  return Math.random() < 0.94;
}

function deriveUrl(s: Service, host: Host): string | null {
  if (s.url) return s.url;
  if (s.protocol && s.protocol !== "tcp") return null;
  return `http://${host.ip}:${s.port}`;
}

async function realPing(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
      method: "GET",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function usePings(
  services: Service[],
  hosts: Host[],
  intervalMs: number,
  options?: { real?: boolean }
) {
  const real = options?.real ?? false;
  const [pings, setPings] = useState<PingMap>({});

  useEffect(() => {
    let cancelled = false;
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    async function probe(s: Service): Promise<boolean> {
      const host = hostMap.get(s.host);
      if (!host) return false;
      const url = deriveUrl(s, host);
      if (real && url) return realPing(url, Math.min(intervalMs - 1000, 4000));
      // simulate with a small randomized delay
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
      return simulate(s);
    }

    async function tick() {
      // Mark all as pinging
      if (cancelled) return;
      setPings((prev) => {
        const next: PingMap = { ...prev };
        for (const s of services) {
          next[s.id] = { ...prev[s.id], state: "pinging" };
        }
        return next;
      });

      // Probe in parallel
      const started = Date.now();
      const results = await Promise.all(
        services.map(async (s) => {
          const t0 = performance.now();
          const ok = await probe(s);
          const latencyMs = Math.round(performance.now() - t0);
          return { id: s.id, ok, latencyMs };
        })
      );
      if (cancelled) return;
      setPings((prev) => {
        const next: PingMap = { ...prev };
        for (const r of results) {
          next[r.id] = {
            state: r.ok ? "ok" : "fail",
            lastChecked: started,
            latencyMs: r.latencyMs,
          };
        }
        return next;
      });
    }

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [services, hosts, intervalMs, real]);

  return pings;
}
