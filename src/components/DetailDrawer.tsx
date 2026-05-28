import { useEffect, useState } from "react";
import type { Host, Service, Category } from "../types";

interface Props {
  service: Service | null;
  host: Host | undefined;
  category: Category | undefined;
  onClose: () => void;
}

export function DetailDrawer({ service, host, category, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!service || !host) return null;
  const color = category?.color ?? "#9aa0a6";
  const url = service.url ?? `http://${host.ip}:${service.port}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-40 animate-[fadein_0.15s_ease-out]"
        onClick={onClose}
      />
      <aside
        className="surface fixed top-0 right-0 bottom-0 w-full sm:w-[440px] z-50
                   text-current border-l
                   animate-[slidein_0.2s_ease-out]
                   flex flex-col"
        style={{ ["--c" as string]: color }}
      >
        <div
          className="px-5 py-3 border-b border-current/25 dark:border-phos/30 flex items-center justify-between"
        >
          <span
            className="text-[10px] uppercase tracking-[0.28em] opacity-80"
            style={{ color }}
          >
            ┌── service · detail ──
          </span>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
          >
            [esc] close
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="px-5 pt-5">
            <div className="flex items-baseline gap-4">
              <span
                className="font-display text-[72px] leading-none tabular-nums"
                style={{ color }}
              >
                {service.port}
              </span>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.25em] opacity-60">
                  {category?.label ?? "uncat"}
                </div>
                <div className="text-2xl font-display leading-tight">
                  {service.name}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 mx-5 border-t border-dashed border-current/30" />

          <dl className="px-5 py-4 space-y-3 text-[13px]">
            <Row label="host">
              {host.name}{" "}
              <span className="opacity-50 tabular-nums">({host.ip})</span>
            </Row>
            <Row label="bind">
              <span className="font-display text-lg tabular-nums" style={{ color }}>
                {host.ip}:{service.port}
              </span>
              <span className="ml-2 opacity-60 uppercase tracking-widest text-[10px]">
                {service.protocol ?? "tcp"}
              </span>
            </Row>
            <Row label="status">
              <span
                className={`uppercase tracking-[0.2em] text-[11px] ${
                  service.status === "running" ? "animate-phos-pulse" : ""
                }`}
                style={{ color }}
              >
                ▸ {service.status ?? "unknown"}
              </span>
            </Row>
            <Row label="url">
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-2 truncate"
                  style={{ color }}
                >
                  {url}
                </a>
                <button
                  onClick={copy}
                  className="text-[10px] uppercase tracking-[0.18em] border border-current/30 px-1.5 py-0.5 hover:bg-phos/10"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            </Row>
            {service.description && (
              <Row label="info">
                <p className="opacity-80 leading-snug">{service.description}</p>
              </Row>
            )}
            {service.tags && service.tags.length > 0 && (
              <Row label="tags">
                <div className="flex flex-wrap gap-1">
                  {service.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 border border-current/25"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </Row>
            )}
          </dl>

          <div className="mx-5 mt-2 border-t border-dashed border-current/30" />

          <div className="px-5 py-4 text-[10px] uppercase tracking-[0.25em] opacity-60">
            id: <span className="opacity-90 normal-case tracking-normal">{service.id}</span>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-current/25 dark:border-phos/30 text-[10px] uppercase tracking-[0.25em] opacity-60">
          └──────────────────────
        </div>
      </aside>

      <style>{`
        @keyframes slidein { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 items-baseline">
      <dt className="text-[10px] uppercase tracking-[0.22em] opacity-50">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
