import { useEffect, useState } from "react";
import type { PortsConfig, RawConfig, Service } from "../types";

interface LoaderState {
  data: PortsConfig | null;
  error: string | null;
  loading: boolean;
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
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/ports.json", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        try {
          const data = validate(json);
          setState({ data, error: null, loading: false });
        } catch (e) {
          setState({
            data: null,
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          });
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState({ data: null, error: e.message, loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
