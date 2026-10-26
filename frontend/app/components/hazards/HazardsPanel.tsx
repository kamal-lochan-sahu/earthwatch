"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "../../context/AppState";
import { apiGetShared } from "../../hooks/useApi";
import { useNow } from "../../hooks/usePrefs";
import { formatValue } from "../../layers/hazardKit";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_ORDER, isSeverity, severityRank, type Severity } from "../../layers/severity";
import { timeAgo } from "../../lib/format";
import Skeleton from "../Skeleton";

const ENDPOINT = "/api/hazards?limit=500";
const REFRESH_MS = 300_000;
const PAGE_SIZE = 25;

const CATEGORIES = [
  { id: "wildfire", layer: "wildfires", icon: "🔥", label: "Wildfires" },
  { id: "storm", layer: "storms", icon: "🌀", label: "Cyclones & storms" },
  { id: "volcano", layer: "volcanoes", icon: "🌋", label: "Volcanoes" },
  { id: "iceberg", layer: "icebergs", icon: "🧊", label: "Icebergs" },
] as const;

interface Row {
  id: string;
  category: string;
  title: string;
  severity: Severity;
  value: number | null;
  unit: string | null;
  time: number | null;
  source: string;
  url: string | null;
}

const field = "rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 focus:border-green-500 focus:outline-none";

function parseRows(json: any): Row[] {
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((r) => typeof r?.id === "string" && typeof r?.category === "string")
    .map((r) => {
      const time = Date.parse(r.time);
      return {
        id: r.id,
        category: r.category,
        title: typeof r.title === "string" ? r.title : r.category,
        severity: isSeverity(r.severity) ? r.severity : "info",
        value: Number.isFinite(r.value) ? r.value : null,
        unit: typeof r.unit === "string" ? r.unit : null,
        time: Number.isFinite(time) ? time : null,
        source: typeof r.source === "string" ? r.source : "",
        url: typeof r.url === "string" && /^https:\/\//i.test(r.url) ? r.url : null,
      };
    });
}

/** Hazards tab: wildfires, storms, volcanoes and icebergs in one filterable list, most severe first. */
export default function HazardsPanel() {
  const { t, activeLayers, toggleLayer, select, setView } = useAppState();
  const now = useNow(60_000);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [stale, setStale] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [minSeverity, setMinSeverity] = useState<Severity>("info");
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const json = await apiGetShared(ENDPOINT, 60_000);
      setRows(parseRows(json));
      setStale(json?.stale === true || json?.partial === true);
      setStatus("ok");
    } catch (e) {
      console.error("Hazard list failed:", e);
      setStale(true);
      setStatus((s) => (s === "ok" ? "ok" : "error"));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const tally = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.category] = (m[r.category] ?? 0) + 1;
    return m;
  }, [rows]);

  const list = useMemo(
    () =>
      rows.filter(
        (r) => (!category || r.category === category) && severityRank(r.severity) >= severityRank(minSeverity)
      ),
    [rows, category, minSeverity]
  );

  useEffect(() => setShown(PAGE_SIZE), [category, minSeverity]);

  const showOnGlobe = (r: Row) => {
    const layer = CATEGORIES.find((c) => c.id === r.category)?.layer;
    if (!layer) return;
    if (!activeLayers.includes(layer)) toggleLayer(layer);
    select(`${layer}:${r.id}`);
    setView("mission");
  };

  if (status === "loading") return <Skeleton className="mb-8 h-64" />;

  return (
    <section aria-label={t.hazardsTitle} className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-1 text-xl font-bold text-white">⚠️ {t.hazardsTitle}</h2>
      <p className="mb-4 text-xs text-gray-500">{t.hazardsSource}</p>

      {status === "error" ? (
        <p className="py-6 text-center text-sm text-orange-300">{t.hazardsError}</p>
      ) : (
        <>
          {stale && <p className="mb-3 text-xs text-yellow-300">{t.hazardsStale}</p>}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={category === ""}
              onClick={() => setCategory("")}
              className={`rounded-full border px-3 py-1 text-xs ${category === "" ? "border-green-400 text-green-300" : "border-gray-700 text-gray-400 hover:text-white"}`}
            >
              {t.hazardsAll} · {rows.length}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(category === c.id ? "" : c.id)}
                className={`rounded-full border px-3 py-1 text-xs ${category === c.id ? "border-green-400 text-green-300" : "border-gray-700 text-gray-400 hover:text-white"}`}
              >
                {c.icon} {c.label} · {tally[c.id] ?? 0}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-gray-400">
              {t.hazardsMinSeverity}
              <select className={field} value={minSeverity} onChange={(e) => setMinSeverity(e.target.value as Severity)}>
                {SEVERITY_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}+
                  </option>
                ))}
              </select>
            </label>
          </div>

          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t.noEvents}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.slice(0, shown).map((r) => {
                const cat = CATEGORIES.find((c) => c.id === r.category);
                const v = formatValue(r.value, r.unit);
                return (
                  <li key={r.id} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-800/60 p-3">
                    <span className="text-xl" aria-hidden>{cat?.icon ?? "⚠️"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{r.title}</p>
                        <span
                          className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: SEVERITY_COLOR[r.severity], borderColor: SEVERITY_COLOR[r.severity] }}
                        >
                          {SEVERITY_LABEL[r.severity]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {cat?.label}
                        {v ? ` · ${v}` : ""}
                        {r.time ? ` · ${timeAgo(r.time, now)}` : ""}
                        {r.source ? ` · ${r.source}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      <button type="button" onClick={() => showOnGlobe(r)} className="text-green-300 hover:underline">
                        {t.hazardsShowOnGlobe}
                      </button>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
                          Source ↗
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="mt-3 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:text-white"
            >
              {t.hazardsMore} ({list.length - shown})
            </button>
          )}
        </>
      )}
    </section>
  );
}
