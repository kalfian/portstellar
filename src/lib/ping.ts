import { useEffect, useState, useRef, useCallback } from "react";
import type { Host, Service } from "../types";
import { fetchPingsLatest, type ApiPingState } from "./api";
import type { WsMessage } from "./ws";

export type PingState = "idle" | "pinging" | "ok" | "fail";
export type PingMode = "simulated" | "remote" | "live-ws";

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

/** Convert backend API response to PingMap */
function apiToPingMap(states: ApiPingState[]): PingMap {
  const map: PingMap = {};
  for (const s of states) {
    map[s.serviceId] = {
      state: s.ok ? "ok" : "fail",
      lastChecked: s.ts,
      latencyMs: s.latencyMs,
    };
  }
  return map;
}

export function usePings(
  services: Service[],
  hosts: Host[],
  intervalMs: number,
  options?: {
    real?: boolean;
    source?: "api" | "static" | null;
    wsConnected?: boolean;
    subscribe?: (fn: (msg: WsMessage) => void) => () => void;
  }
) {
  const real = options?.real ?? false;
  const source = options?.source ?? null;
  const wsConnected = options?.wsConnected ?? false;
  const subscribe = options?.subscribe;
  const [pings, setPings] = useState<PingMap>({});
  const [mode, setMode] = useState<PingMode>("simulated");
  const modeRef = useRef<PingMode>("simulated");

  // Remote polling mode (backend available)
  const pollRemote = useCallback(async () => {
    try {
      const states = await fetchPingsLatest();
      setPings(apiToPingMap(states));
      if (modeRef.current !== "remote") {
        modeRef.current = "remote";
        setMode("remote");
      }
    } catch {
      // API unreachable — will stay on simulated or switch to it
      if (modeRef.current !== "simulated") {
        modeRef.current = "simulated";
        setMode("simulated");
      }
      return false;
    }
    return true;
  }, []);

  // WebSocket live mode: subscribe to ping_result events
  useEffect(() => {
    if (source !== "api" || !wsConnected || !subscribe) return;

    // Transition mode to live-ws
    if (modeRef.current !== "live-ws") {
      modeRef.current = "live-ws";
      setMode("live-ws");
    }

    const unsub = subscribe((msg) => {
      if (msg.type !== "ping_result") return;
      setPings((prev) => ({
        ...prev,
        [msg.serviceId]: {
          state: msg.ok ? "ok" : "fail",
          latencyMs: msg.latencyMs,
          lastChecked: msg.ts,
        },
      }));
    });

    return unsub;
  }, [source, wsConnected, subscribe]);

  // When WS drops, revert to polling mode label
  useEffect(() => {
    if (source !== "api") return;
    if (!wsConnected && modeRef.current === "live-ws") {
      modeRef.current = "remote";
      setMode("remote");
    }
  }, [source, wsConnected]);

  useEffect(() => {
    let cancelled = false;
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    // If source is "api", do initial fetch then conditionally poll
    if (source === "api") {
      // Always do an initial fetch to populate state
      pollRemote();

      // Only poll when WS is not connected
      if (wsConnected) {
        return () => { cancelled = true; };
      }

      // Poll at intervalMs/3 but min 5s
      const pollInterval = Math.max(5000, Math.floor(intervalMs / 3));
      const id = setInterval(() => {
        if (!cancelled) pollRemote();
      }, pollInterval);

      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    // Simulated mode (no backend)
    modeRef.current = "simulated";
    setMode("simulated");

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
  }, [services, hosts, intervalMs, real, source, wsConnected, pollRemote]);

  return { pings, mode };
}
