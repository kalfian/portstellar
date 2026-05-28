import { useCallback, useEffect, useState } from "react";

export interface Pos {
  x: number;
  y: number;
}
export type PosMap = Record<string, Pos>;

function makeStore(key: string) {
  function read(): PosMap {
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
  return function useStore() {
    const [positions, setPositions] = useState<PosMap>(read);
    useEffect(() => {
      localStorage.setItem(key, JSON.stringify(positions));
    }, [positions]);
    const set = useCallback((id: string, pos: Pos) => {
      setPositions((prev) => ({ ...prev, [id]: pos }));
    }, []);
    const reset = useCallback(() => setPositions({}), []);
    return { positions, set, reset };
  };
}

export const usePositions = makeStore("svcdisc.positions.v2");
export const useHostPositions = makeStore("svcdisc.hosts.v1");
