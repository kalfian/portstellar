import { useEffect, useState } from "react";
import { fetchServiceStats, fetchPingsHistory, type ServiceStats, type ApiHistoryPoint } from "./api";
import type { WsMessage } from "./ws";
import type { Beat } from "./api";

// ── useServiceStats ───────────────────────────────────────────────────────────

export interface ServiceStatsResult {
  stats: ServiceStats | null;
  loading: boolean;
  refresh: () => void;
}

export function useServiceStats(
  serviceId: string | null,
  source: "api" | "static" | null,
  subscribe?: (fn: (msg: WsMessage) => void) => () => void,
): ServiceStatsResult {
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    if (!serviceId || source !== "api") {
      setStats(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchServiceStats(serviceId)
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [serviceId, source, tick]);

  // Subscribe to real-time ping_result events for this service's beat bar
  useEffect(() => {
    if (!serviceId || source !== "api" || !subscribe) return;

    const unsub = subscribe((msg) => {
      if (msg.type !== "ping_result") return;
      if (msg.serviceId !== serviceId) return;

      const newBeat: Beat = {
        ok: msg.ok,
        latencyMs: msg.latencyMs,
        ts: msg.ts,
        errorMsg: msg.errorMsg ?? "",
      };

      setStats((prev) => {
        if (!prev) return prev;
        // Prepend new beat and keep last 50
        const recentBeats = [newBeat, ...prev.recentBeats].slice(0, 50);
        return { ...prev, recentBeats };
      });
    });

    return unsub;
  }, [serviceId, source, subscribe]);

  return { stats, loading, refresh };
}

// ── useUptime (backward-compat wrapper) ──────────────────────────────────────

export interface UptimeData {
  uptimePercent: number | null;
  history: ApiHistoryPoint[];
  loading: boolean;
}

/**
 * Backward-compatible hook. Internally uses useServiceStats for uptime%,
 * but still fetches history for the sparkline (old callers expect ApiHistoryPoint[]).
 */
export function useUptime(serviceId: string | null, source: "api" | "static" | null): UptimeData {
  const { stats, loading: statsLoading } = useServiceStats(serviceId, source);
  const [history, setHistory] = useState<ApiHistoryPoint[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (!serviceId || source !== "api") {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setHistLoading(true);

    fetchPingsHistory(serviceId, 24)
      .then((pts) => {
        if (!cancelled) setHistory(pts);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serviceId, source]);

  return {
    uptimePercent: stats?.uptime24h ?? null,
    history,
    loading: statsLoading || histLoading,
  };
}
