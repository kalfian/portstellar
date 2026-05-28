import { useCallback, useEffect, useState } from "react";
import { fetchMeshPositions } from "./api";

export interface Pos {
  x: number;
  y: number;
}
export type PosMap = Record<string, Pos>;

function readLocal(key: string): PosMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PosMap) : {};
  } catch {
    return {};
  }
}

function makeStore(key: string, pickRemote: (r: { hosts: PosMap; services: PosMap }) => PosMap) {
  return function useStore(meshId = "default") {
    const [positions, setPositions] = useState<PosMap>(() => readLocal(key));

    useEffect(() => {
      let cancelled = false;
      fetchMeshPositions(meshId)
        .then((remote) => {
          if (cancelled) return;
          const next = pickRemote({ hosts: remote.hosts, services: remote.services }) ?? {};
          setPositions(next);
        })
        .catch(() => {
          if (cancelled) return;
          setPositions(readLocal(key));
        });
      return () => {
        cancelled = true;
      };
    }, [meshId]);

    useEffect(() => {
      localStorage.setItem(key, JSON.stringify(positions));
    }, [positions]);

    const set = useCallback((id: string, pos: Pos) => {
      setPositions((prev) => ({ ...prev, [id]: pos }));
    }, []);
    const replace = useCallback((next: PosMap) => setPositions(next), []);
    const reset = useCallback(() => setPositions({}), []);
    return { positions, set, replace, reset };
  };
}

export const usePositions = makeStore("svcdisc.positions.v2", (r) => r.services);
export const useHostPositions = makeStore("svcdisc.hosts.v1", (r) => r.hosts);
