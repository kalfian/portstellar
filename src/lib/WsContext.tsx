import { createContext, useContext } from "react";
import { useWebSocket, type WsHandle, type WsMessage } from "./ws";

type Listener = (msg: WsMessage) => void;

const noopUnsubscribe = () => {};
const noopSubscribe = (_fn: Listener) => noopUnsubscribe;

const defaultHandle: WsHandle = {
  connected: false,
  subscribe: noopSubscribe,
};

const WsContext = createContext<WsHandle>(defaultHandle);

export function WsProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const ws = useWebSocket(enabled);
  return <WsContext.Provider value={ws}>{children}</WsContext.Provider>;
}

/** Access the shared WebSocket handle from any component in the tree. */
export function useWs(): WsHandle {
  return useContext(WsContext);
}
