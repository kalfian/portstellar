import { useCallback, useEffect, useRef, useState } from "react";

export type WsMessage =
  | { type: "ping_result"; serviceId: string; ok: boolean; latencyMs: number; errorMsg?: string; ts: number }
  | { type: "config_updated" }
  | { type: "connected" };

type Listener = (msg: WsMessage) => void;

export interface WsHandle {
  connected: boolean;
  subscribe: (fn: Listener) => () => void;
}

export function useWebSocket(enabled: boolean): WsHandle {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Respect VITE_API_BASE when set (e.g. in Docker) by swapping the scheme.
      const host = import.meta.env.VITE_API_BASE
        ? import.meta.env.VITE_API_BASE.replace(/^https?/, proto === "wss:" ? "wss" : "ws")
        : `${proto}//${window.location.host}`;
      const url = `${host}/api/ws`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as WsMessage;
          listenersRef.current.forEach((fn) => fn(msg));
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Exponential backoff: 1s, 2s, 4s, 8s … max 30s
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current++;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  return { connected, subscribe };
}
