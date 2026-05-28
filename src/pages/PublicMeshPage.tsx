import { useState } from "react";
import { usePorts } from "../data/loader";
import { useTheme } from "../lib/useTheme";
import { usePositions, useHostPositions } from "../lib/positions";
import { usePings } from "../lib/ping";
import { WsProvider, useWs } from "../lib/WsContext";
import { StatusBar } from "../components/StatusBar";
import { MeshView } from "../components/MeshView";
import { DetailDrawer } from "../components/DetailDrawer";
import { Cosmos } from "../components/Cosmos";
import type { Service, PortsConfig } from "../types";

export default function PublicMeshPage() {
  const { data, error, loading, source } = usePorts();
  return (
    <WsProvider enabled={source === "api"}>
      <PublicMeshPageInner data={data} error={error} loading={loading} source={source} />
    </WsProvider>
  );
}

interface InnerProps {
  data: PortsConfig | null;
  error: string | null;
  loading: boolean;
  source: "api" | "static" | null;
}

function PublicMeshPageInner({ data, error, loading, source }: InnerProps) {
  const [theme, toggleTheme] = useTheme();
  const { positions, set: setPosition, reset: resetPositions } = usePositions();
  const {
    positions: hostPositions,
    set: setHostPosition,
    reset: resetHostPositions,
  } = useHostPositions();
  const [picked, setPicked] = useState<Service | null>(null);
  const { connected: wsConnected, subscribe: wsSubscribe } = useWs();

  const { pings, mode: pingMode } = usePings(
    data?.services ?? [],
    data?.hosts ?? [],
    data?.pingIntervalMs ?? 30000,
    { source, wsConnected, subscribe: wsSubscribe }
  );

  const customCount =
    Object.keys(positions).length + Object.keys(hostPositions).length;
  const resetAll = () => {
    resetPositions();
    resetHostPositions();
  };

  return (
    <div className="min-h-screen flex flex-col font-mono animate-flicker relative">
      <Cosmos />
      <div className="crt-scan" aria-hidden />
      <div className="crt-sweep" aria-hidden />
      <div className="crt-vignette" aria-hidden />
      <div className="paper-grain" aria-hidden />

      <StatusBar
        data={data}
        onToggleTheme={toggleTheme}
        theme={theme}
        onResetPositions={resetAll}
        customCount={customCount}
        pingMode={pingMode}
        source={source}
      />

      {error && (
        <div className="m-4 border border-[#ff5757] text-[#ff5757] px-4 py-3 text-sm">
          <div className="text-[10px] uppercase tracking-[0.28em] opacity-80 mb-1">
            ports.json · parse error
          </div>
          {error}
        </div>
      )}

      {data && (
        <MeshView
          hosts={data.hosts}
          services={data.services}
          categories={data.categories}
          positions={positions}
          hostPositions={hostPositions}
          theme={theme}
          pings={pings}
          onMove={setPosition}
          onMoveHost={setHostPosition}
          onPick={setPicked}
        />
      )}

      {loading && !data && !error && (
        <div className="flex-1 flex items-center justify-center text-phos dark:phos-glow font-display text-2xl">
          loading mesh<span className="animate-blink">_</span>
        </div>
      )}

      <DetailDrawer
        service={picked}
        host={picked ? data?.hosts.find((h) => h.id === picked.host) : undefined}
        category={
          picked
            ? data?.categories.find((c) => c.id === picked.category)
            : undefined
        }
        ping={picked ? pings[picked.id] : undefined}
        source={source}
        theme={theme}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}
