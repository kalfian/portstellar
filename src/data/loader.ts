import { useEffect, useRef, useState } from "react";
import type { PortsConfig, RawConfig, Service } from "../types";
import { fetchConfig } from "../lib/api";

interface LoaderState {
  data: PortsConfig | null;
  error: string | null;
  loading: boolean;
  source: "api" | "static" | null;
}

function flatten(raw: RawConfig): PortsConfig {
  const services: Service[] = [];
  for (const h of raw.hosts) {
    for (const s of h.services ?? []) {
      services.push({
        ...s,
        id: `${h.id}-${s.id}`,
        host: h.id,
      });
    }
  }
  return {
    name: raw.name ?? "Home Server",
    pingIntervalMs: raw.pingIntervalMs ?? 30000,
    hosts: raw.hosts.map(({ services: _s, ...rest }) => rest),
    categories: raw.categories,
    services,
  };
}

function validate(raw: unknown): PortsConfig {
  if (!raw || typeof raw !== "object") throw new Error("config is not an object");
  const cfg = raw as Partial<RawConfig>;
  if (!Array.isArray(cfg.hosts)) throw new Error("`hosts` must be an array");
  if (!Array.isArray(cfg.categories))
    throw new Error("`categories` must be an array");
  for (const h of cfg.hosts) {
    if (!h.id || !h.name || !h.ip)
      throw new Error(`host missing id/name/ip: ${JSON.stringify(h)}`);
    if (h.services && !Array.isArray(h.services))
      throw new Error(`host "${h.id}" services must be an array`);
  }
  return flatten(cfg as RawConfig);
}

export function usePorts(): LoaderState {
  const [state, setState] = useState<LoaderState>({
    data: null,
    error: null,
    loading: true,
    source: null,
  });

  // Guard against StrictMode double-invoke: only run once per mount.
  const didFetch = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;

    async function load() {
      // Try API first
      try {
        const json = await fetchConfig();
        const data = validate(json);
        setState({ data, error: null, loading: false, source: "api" });
        return;
      } catch {
        // API unavailable or invalid — fall through to static
      }

      // Fallback: static /ports.json
      try {
        const r = await fetch("/ports.json", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        const data = validate(json);
        setState({ data, error: null, loading: false, source: "static" });
      } catch (e) {
        setState({
          data: null,
          error: e instanceof Error ? e.message : String(e),
          loading: false,
          source: null,
        });
      }
    }

    load();
  }, []);

  return state;
}
