import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchAdminConfig, saveAdminConfig, fetchServiceSetting, saveServiceSetting } from "../lib/api";

type Category = { id: string; label: string; color: string };
type Service = { id: string; name: string; port: number; protocol?: string; category?: string; url?: string; description?: string; tags?: string[] };
type Host = { id: string; name: string; ip: string; note?: string; services: Service[] };
type Cfg = { name: string; pingIntervalMs: number; categories: Category[]; hosts: Host[] };
type Tab = "hosts" | "categories" | "global";


const inp = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-colors";
const inpSm = "w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 transition-colors";
const sel = "w-full bg-[#1a1d2e] border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 transition-colors";

export default function AdminConfigEditorPage() {
  const { token } = useAuth();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [tab, setTab] = useState<Tab>("hosts");
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectedSvcIdx, setSelectedSvcIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminConfig(token!).then((c: any) => {
      setCfg(c);
      setSelectedHostId(c.hosts?.[0]?.id ?? null);
    }).catch((e) => { setErrMsg(e.message); setSaveState("err"); });
  }, [token]);

  const currentHost = useMemo(
    () => cfg?.hosts.find(h => h.id === selectedHostId) ?? null,
    [cfg, selectedHostId]
  );

  // ── Mutations ──────────────────────────────────────────────────────

  function addHost() {
    if (!cfg) return;
    const id = `host-${Date.now()}`;
    setCfg({ ...cfg, hosts: [...cfg.hosts, { id, name: "new-host", ip: "0.0.0.0", services: [] }] });
    setSelectedHostId(id);
    setSelectedSvcIdx(null);
  }

  function deleteHost(id: string) {
    if (!cfg) return;
    const next = cfg.hosts.filter(h => h.id !== id);
    setCfg({ ...cfg, hosts: next });
    setSelectedHostId(next[0]?.id ?? null);
    setSelectedSvcIdx(null);
  }

  function patchHost(id: string, patch: Partial<Host>) {
    if (!cfg) return;
    setCfg({ ...cfg, hosts: cfg.hosts.map(h => h.id !== id ? h : { ...h, ...patch }) });
  }

  function addService() {
    if (!cfg || !currentHost) return;
    const svc: Service = { id: `svc-${Date.now()}`, name: "New Service", port: 80, protocol: "tcp" };
    patchHost(currentHost.id, { services: [...currentHost.services, svc] });
    setSelectedSvcIdx(currentHost.services.length);
  }

  function deleteService(idx: number) {
    if (!cfg || !currentHost) return;
    patchHost(currentHost.id, { services: currentHost.services.filter((_, i) => i !== idx) });
    setSelectedSvcIdx(prev => {
      if (prev === null) return null;
      if (prev === idx) return null;
      return prev > idx ? prev - 1 : prev;
    });
  }

  function patchService(idx: number, patch: Partial<Service>) {
    if (!cfg || !currentHost) return;
    patchHost(currentHost.id, {
      services: currentHost.services.map((s, i) => i !== idx ? s : { ...s, ...patch }),
    });
  }

  function addCategory() {
    if (!cfg) return;
    setCfg({ ...cfg, categories: [...cfg.categories, { id: `cat-${Date.now()}`, label: "New Category", color: "#4d9bff" }] });
  }

  function patchCategory(idx: number, patch: Partial<Category>) {
    if (!cfg) return;
    setCfg({ ...cfg, categories: cfg.categories.map((c, i) => i !== idx ? c : { ...c, ...patch }) });
  }

  function deleteCategory(idx: number) {
    if (!cfg) return;
    setCfg({ ...cfg, categories: cfg.categories.filter((_, i) => i !== idx) });
  }

  async function save() {
    if (!cfg) return;
    setSaving(true); setSaveState("idle"); setErrMsg(null);
    try {
      await saveAdminConfig(token!, cfg);
      setSaveState("ok");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setSaveState("err");
      setErrMsg(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (!cfg) return (
    <div className="flex items-center gap-2.5 text-white/30 text-sm py-12">
      <span className="w-4 h-4 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
      Loading configuration…
    </div>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "hosts", label: "Hosts", count: cfg.hosts.length },
    { id: "categories", label: "Categories", count: cfg.categories.length },
    { id: "global", label: "Global" },
  ];

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Config Editor</h1>
          <p className="text-sm text-white/40 mt-0.5">Manage hosts, services, and global settings</p>
        </div>
        <div className="flex items-center gap-3">
          {saveState === "err" && errMsg && (
            <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-1.5">{errMsg}</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-40 ${
              saveState === "ok"
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : saveState === "err"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
            }`}
          >
            {saving ? <><Spin /> Saving…</> : saveState === "ok" ? <><Check /> Saved</> : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/8">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all ${
              tab === t.id ? "border-blue-400 text-white" : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-blue-500/20 text-blue-300" : "bg-white/8 text-white/30"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── GLOBAL ── */}
      {tab === "global" && (
        <div className="max-w-lg space-y-5">
          <FormGroup label="Mesh Name" hint="Shown in the header of the public view">
            <input value={cfg.name} onChange={e => setCfg({ ...cfg, name: e.target.value })} className={inp} placeholder="Home Server" />
          </FormGroup>
          <FormGroup label="Ping Interval" hint={`Probe each service every ${(cfg.pingIntervalMs / 1000).toFixed(0)}s — minimum 5000ms`}>
            <div className="flex items-center gap-3">
              <input type="number" value={cfg.pingIntervalMs} onChange={e => setCfg({ ...cfg, pingIntervalMs: Math.max(5000, Number(e.target.value)) })} className={inp} min={5000} step={1000} />
              <span className="text-sm text-white/30 shrink-0">ms</span>
            </div>
          </FormGroup>
        </div>
      )}

      {/* ── CATEGORIES ── */}
      {tab === "categories" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/40">Color groups that organize services in the mesh view</p>
            <button onClick={addCategory} className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 transition-colors">
              + Add Category
            </button>
          </div>

          {cfg.categories.length === 0 && <Empty icon="🎨" text="No categories yet" sub="Categories group services by color in the mesh view" />}

          <div className="space-y-2">
            {cfg.categories.map((cat, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 group hover:border-white/14 transition-colors">
                <div className="relative shrink-0 w-9 h-9 rounded-lg cursor-pointer overflow-hidden border-2" style={{ borderColor: `${cat.color}50`, backgroundColor: cat.color }}>
                  <input type="color" value={cat.color} onChange={e => patchCategory(i, { color: e.target.value })} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                </div>
                <div className="flex-1 grid grid-cols-[1fr_1fr_100px] gap-2.5">
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">ID</p>
                    <input value={cat.id} onChange={e => patchCategory(i, { id: e.target.value })} className={inpSm} placeholder="category-id" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Label</p>
                    <input value={cat.label} onChange={e => patchCategory(i, { label: e.target.value })} className={inpSm} placeholder="Category Name" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Hex</p>
                    <input value={cat.color} onChange={e => patchCategory(i, { color: e.target.value })} className={inpSm + " font-mono"} placeholder="#4d9bff" />
                  </div>
                </div>
                <button onClick={() => deleteCategory(i)} className="shrink-0 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1">
                  <Trash />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HOSTS ── */}
      {tab === "hosts" && (
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Host sidebar */}
          <div className="w-52 shrink-0 flex flex-col gap-2">
            <button onClick={addHost} className="flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/8 border border-blue-500/20 border-dashed rounded-xl py-2.5 transition-colors">
              + Add Host
            </button>
            <div className="space-y-1 overflow-y-auto">
              {cfg.hosts.map(h => (
                <div
                  key={h.id}
                  onClick={() => { setSelectedHostId(h.id); setSelectedSvcIdx(null); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer group transition-all ${
                    selectedHostId === h.id
                      ? "bg-blue-600/15 border border-blue-500/30"
                      : "border border-transparent hover:bg-white/5 hover:border-white/10"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${selectedHostId === h.id ? "bg-blue-400" : "bg-white/20"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${selectedHostId === h.id ? "text-white" : "text-white/60"}`}>{h.name}</p>
                    <p className="text-[10px] text-white/30 font-mono truncate mt-0.5">{h.ip}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {h.services.length > 0 && (
                      <span className="text-[9px] text-white/25 bg-white/8 px-1.5 py-0.5 rounded-full">{h.services.length}</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deleteHost(h.id); }}
                      className="text-transparent group-hover:text-white/30 hover:!text-red-400 transition-colors p-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Host detail panel */}
          {!currentHost ? (
            <div className="flex-1 flex items-center justify-center">
              <Empty icon="🖥" text="Select a host" sub="Choose a host from the sidebar to edit" />
            </div>
          ) : (
            <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
              {/* Host identity */}
              <section className="bg-white/3 border border-white/8 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white/70 mb-4">Host Identity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Hostname">
                    <input value={currentHost.name} onChange={e => patchHost(currentHost.id, { name: e.target.value })} className={inp} placeholder="my-server" />
                  </FormGroup>
                  <FormGroup label="IP Address">
                    <input value={currentHost.ip} onChange={e => patchHost(currentHost.id, { ip: e.target.value })} className={inp} placeholder="10.0.0.1" />
                  </FormGroup>
                  <div className="col-span-2">
                    <FormGroup label="Note">
                      <input value={currentHost.note ?? ""} onChange={e => patchHost(currentHost.id, { note: e.target.value })} className={inp} placeholder="Optional description" />
                    </FormGroup>
                  </div>
                </div>
              </section>

              {/* Services */}
              <section className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
                  <div>
                    <h3 className="text-sm font-semibold text-white/70">Services</h3>
                    <p className="text-xs text-white/30 mt-0.5">
                      {currentHost.services.length} port{currentHost.services.length !== 1 ? "s" : ""} — click a row to edit
                    </p>
                  </div>
                  <button onClick={addService} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 transition-colors">
                    + Add Service
                  </button>
                </div>

                {/* List */}
                {currentHost.services.length === 0 && (
                  <Empty icon="🔌" text="No services yet" sub="Add a service to monitor ports on this host" />
                )}

                {currentHost.services.map((s, i) => {
                  const cat = cfg.categories.find(c => c.id === s.category);
                  const isSelected = selectedSvcIdx === i;
                  return (
                    <div key={i}>
                      {/* Row — click to select/close */}
                      <button
                        onClick={() => setSelectedSvcIdx(isSelected ? null : i)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-white/5 last:border-0 group ${
                          isSelected
                            ? "bg-blue-500/8 border-l-2 border-l-blue-500/50"
                            : "hover:bg-white/4"
                        }`}
                      >
                        {/* Category bar */}
                        <div
                          className="w-0.5 h-7 rounded-full shrink-0 transition-opacity"
                          style={{ backgroundColor: cat?.color ?? "#374151", opacity: isSelected ? 1 : 0.5 }}
                        />

                        {/* Name + ID */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate transition-colors ${isSelected ? "text-white" : "text-white/75"}`}>
                            {s.name || <span className="italic text-white/25">unnamed</span>}
                          </p>
                          <p className="text-[10px] text-white/30 font-mono truncate mt-0.5">{s.id}</p>
                        </div>

                        {/* Port badge */}
                        <span
                          className="shrink-0 text-xs font-mono font-semibold px-2 py-0.5 rounded border tabular-nums"
                          style={{
                            color: cat?.color ?? "#60a5fa",
                            borderColor: `${cat?.color ?? "#3b8bff"}30`,
                            backgroundColor: `${cat?.color ?? "#3b8bff"}12`,
                          }}
                        >
                          {s.port}
                        </span>

                        {/* Chevron */}
                        <div className="flex items-center gap-2 shrink-0">
                          <svg
                            width="12" height="12" viewBox="0 0 12 12" fill="none"
                            className={`text-white/25 transition-transform duration-150 ${isSelected ? "rotate-180 text-blue-400" : ""}`}
                          >
                            <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </button>

                      {/* Inline edit panel — expands below the row */}
                      {isSelected && (
                        <ServiceEditPanel
                          key={i}
                          svc={s}
                          categories={cfg.categories}
                          token={token ?? null}
                          onChange={patch => patchService(i, patch)}
                          onClose={() => setSelectedSvcIdx(null)}
                          onDelete={() => deleteService(i)}
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Service edit panel ────────────────────────────────────────────────────────

function ServiceEditPanel({
  svc,
  categories,
  token,
  onChange,
  onClose,
  onDelete,
}: {
  svc: Service;
  categories: Category[];
  token: string | null;
  onChange: (p: Partial<Service>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Heartbeat / retry settings (stored separately in SQLite)
  const [heartbeatMs, setHeartbeatMs] = useState(30000);
  const [maxRetries, setMaxRetries] = useState(1);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    fetchServiceSetting(svc.id)
      .then((s) => {
        setHeartbeatMs(s.heartbeatMs);
        setMaxRetries(s.maxRetries);
      })
      .catch(() => {
        // backend not connected — keep defaults
      });
  }, [svc.id]);

  async function applySettings() {
    if (!token) return;
    setSettingsSaveState("saving");
    try {
      await saveServiceSetting(token, svc.id, { heartbeatMs, maxRetries });
      setSettingsSaveState("ok");
      setTimeout(() => setSettingsSaveState("idle"), 2000);
    } catch {
      setSettingsSaveState("err");
      setTimeout(() => setSettingsSaveState("idle"), 3000);
    }
  }

  return (
    <div className="border-t border-white/8 bg-[#0f1120]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6">
        <p className="text-xs font-medium text-white/40">Editing: <span className="text-white/70">{svc.name || svc.id}</span></p>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/70 transition-colors px-2 py-1 rounded hover:bg-white/5"
          title="Close editor"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Close
        </button>
      </div>

      {/* Fields */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <FormGroup label="Service ID">
          <input
            value={svc.id}
            onChange={e => onChange({ id: e.target.value })}
            className={inpSm + " font-mono"}
            placeholder="service-id"
            autoComplete="off"
            spellCheck={false}
          />
        </FormGroup>
        <FormGroup label="Name">
          <input
            value={svc.name}
            onChange={e => onChange({ name: e.target.value })}
            className={inpSm}
            placeholder="Service Name"
            autoFocus
          />
        </FormGroup>
        <FormGroup label="Port">
          <input
            type="number"
            value={svc.port}
            onChange={e => onChange({ port: Number(e.target.value) })}
            className={inpSm + " font-mono tabular-nums"}
            min={1} max={65535}
            placeholder="8080"
          />
        </FormGroup>
        <FormGroup label="Category">
          <select value={svc.category ?? ""} onChange={e => onChange({ category: e.target.value || undefined })} className={sel}>
            <option value="">— None —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Protocol">
          <select value={svc.protocol ?? "tcp"} onChange={e => onChange({ protocol: e.target.value })} className={sel}>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
        </FormGroup>
        <div className="col-span-2">
          <FormGroup label="URL">
            <input value={svc.url ?? ""} onChange={e => onChange({ url: e.target.value || undefined })} className={inpSm} placeholder="https://10.0.0.1:8080" autoComplete="off" />
          </FormGroup>
        </div>
        <div className="col-span-2">
          <FormGroup label="Description">
            <input value={svc.description ?? ""} onChange={e => onChange({ description: e.target.value || undefined })} className={inpSm} placeholder="What does this service do?" />
          </FormGroup>
        </div>
        <div className="col-span-2">
          <FormGroup label="Tags" hint="comma-separated">
            <input
              value={svc.tags?.join(", ") ?? ""}
              onChange={e => onChange({ tags: e.target.value ? e.target.value.split(",").map(t => t.trim()).filter(Boolean) : undefined })}
              className={inpSm}
              placeholder="tag1, tag2"
            />
          </FormGroup>
        </div>
      </div>

      {/* Heartbeat + retry settings */}
      <div className="mx-4 mb-4 p-3 bg-white/3 border border-white/8 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-white/50">Probe Settings</p>
          <button
            onClick={applySettings}
            disabled={settingsSaveState === "saving" || !token}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
              settingsSaveState === "ok"
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : settingsSaveState === "err"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
            }`}
          >
            {settingsSaveState === "saving" ? (
              <><Spin /> Saving…</>
            ) : settingsSaveState === "ok" ? (
              <><Check /> Applied</>
            ) : settingsSaveState === "err" ? (
              "Failed"
            ) : (
              "Apply"
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Heartbeat Interval" hint="ms, min 5000">
            <input
              type="number"
              value={heartbeatMs}
              onChange={e => setHeartbeatMs(Math.max(5000, Number(e.target.value)))}
              onBlur={applySettings}
              className={inpSm + " font-mono tabular-nums"}
              min={5000}
              step={1000}
              disabled={!token}
            />
          </FormGroup>
          <FormGroup label="Retries before down" hint="0–10">
            <input
              type="number"
              value={maxRetries}
              onChange={e => setMaxRetries(Math.min(10, Math.max(0, Number(e.target.value))))}
              onBlur={applySettings}
              className={inpSm + " font-mono tabular-nums"}
              min={0}
              max={10}
              disabled={!token}
            />
          </FormGroup>
        </div>
        {!token && (
          <p className="text-[10px] text-white/25 italic">Backend not connected — probe settings unavailable</p>
        )}
      </div>

      {/* Footer — delete action */}
      <div className="px-4 pb-4 flex justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <span className="text-xs text-red-300">Delete this service?</span>
            <button
              onClick={onDelete}
              className="text-xs font-medium text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-white/25 hover:text-red-400 transition-colors px-2 py-1.5 rounded hover:bg-red-500/8"
          >
            <Trash />
            Delete service
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function FormGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-medium text-white/50">{label}</p>
        {hint && <p className="text-[10px] text-white/25">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <span className="text-3xl opacity-30">{icon}</span>
      <p className="text-sm font-medium text-white/35">{text}</p>
      <p className="text-xs text-white/20 max-w-xs">{sub}</p>
    </div>
  );
}

function Spin() {
  return <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />;
}

function Check() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Trash() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 3.5h10M4 3.5V2.5a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1M5.5 6v4M7.5 6v4M2.5 3.5l.75 7.5a.5.5 0 00.5.5h6.5a.5.5 0 00.5-.5l.75-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
