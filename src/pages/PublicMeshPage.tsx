import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { saveMeshPositions } from "../lib/api";
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
  const { token } = useAuth();
  const meshId = "default";
  const { positions, set: setPosition, replace: replacePositions, reset: resetPositions } = usePositions(meshId);
  const {
    positions: hostPositions,
    set: setHostPosition,
    replace: replaceHostPositions,
    reset: resetHostPositions,
  } = useHostPositions(meshId);
  const [picked, setPicked] = useState<Service | null>(null);
  const [savePending, setSavePending] = useState(false);
  const { connected: wsConnected, subscribe: wsSubscribe } = useWs();

  const { pings, mode: pingMode } = usePings(
    data?.services ?? [],
    data?.hosts ?? [],
    data?.pingIntervalMs ?? 30000,
    { source, wsConnected, subscribe: wsSubscribe }
  );

  const customCount =
    Object.keys(positions).length + Object.keys(hostPositions).length;

  const savePositions = async () => {
    if (!token) {
      alert("Login admin dulu untuk save posisi");
      return;
    }
    setSavePending(true);
    try {
      const saved = await saveMeshPositions(token, meshId, {
        hosts: hostPositions,
        services: positions,
      });
      replacePositions(saved.services ?? {});
      replaceHostPositions(saved.hosts ?? {});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal save posisi");
    } finally {
      setSavePending(false);
    }
  };

  const resetAll = () => {
    resetPositions();
    resetHostPositions();
  };

  const resetAndSave = async () => {
    resetAll();
    if (!token) return;
    setSavePending(true);
    try {
      await saveMeshPositions(token, meshId, { hosts: {}, services: {} });
    } catch {
    } finally {
      setSavePending(false);
    }
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
        pings={pings}
        onToggleTheme={toggleTheme}
        theme={theme}
        onResetPositions={resetAndSave}
        onSavePositions={savePositions}
        savePending={savePending}
        canSavePositions={!!token}
        customCount={customCount}
        pingMode={pingMode}
        source={source}
      />

      {error && (
        <div className="m-4 border border-[#ff5757] text-[#ff5757] px-4 py-3 text-sm">
          <div className="text-[10px] uppercase tracking-[0.28em] opacity-80 mb-1">
            services.json · parse error
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
