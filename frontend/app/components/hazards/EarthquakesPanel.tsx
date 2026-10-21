"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "../../context/AppState";
import { apiGetShared } from "../../hooks/useApi";
import { useNow } from "../../hooks/usePrefs";
import { formatMag, isRecent, parseQuakes } from "../../layers/earthquakes";
import type { LayerItem } from "../../layers/types";
import { timeAgo } from "../../lib/format";
import Skeleton from "../Skeleton";

const ENDPOINT = "/api/earthquakes?window=7d";
const REFRESH_MS = 120_000;
const PAGE_SIZE = 25;
const MAX_REGIONS = 25;
const MIN_MAGS = [2.5, 4, 4.5, 5, 6];
const DAY_MS = 24 * 60 * 60 * 1000;

type Win = "24h" | "7d";
type Sort = "time" | "mag";
interface Counts {
  last_hour: number;
  last_24h: number;
  m4_5_24h: number;
  m6_24h: number;
  strongest_24h: { mag: number; place: string } | null;
}

const field = "w-full max-w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 focus:border-green-500 focus:outline-none";

/** Hazards tab: filterable list of the last 7 days of earthquakes (USGS) with the 24h headline numbers. */
export default function EarthquakesPanel() {
  const { t, activeLayers, toggleLayer, select, setView } = useAppState();
  const now = useNow(60_000);

  const [items, setItems] = useState<LayerItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [refreshFailed, setRefreshFailed] = useState(false);

  const [win, setWin] = useState<Win>("24h");
  const [minMag, setMinMag] = useState(2.5);
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState<Sort>("time");
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const json = await apiGetShared(ENDPOINT, 60_000);
      setItems(parseQuakes(json));
      setCounts(json?.counts ?? null);
      setRefreshFailed(json?.stale === true);
      setStatus("ok");
    } catch (e) {
      console.error("Earthquake list failed:", e);
      // Keep whatever we already show; only a first load with nothing to show is an error.
      setRefreshFailed(true);
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

  const inWindow = useMemo(() => {
    const cutoff = now - (win === "24h" ? DAY_MS : 7 * DAY_MS);
    return items.filter((i) => (i.time ?? 0) >= cutoff && i.raw.value >= minMag);
  }, [items, win, minMag, now]);

  const regions = useMemo(() => {
    const tally = new Map<string, number>();
    for (const i of inWindow) tally.set(i.raw.region, (tally.get(i.raw.region) ?? 0) + 1);
    return Array.from(tally, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_REGIONS);
  }, [inWindow]);

  // A chosen region can disappear when the other filters change; fall back to "all".
  const activeRegion = regions.some((r) => r.name === region) ? region : "";

  const rows = useMemo(() => {
    const list = activeRegion ? inWindow.filter((i) => i.raw.region === activeRegion) : inWindow;
    return [...list].sort((a, b) =>
      sort === "mag" ? b.raw.value - a.raw.value || (b.time ?? 0) - (a.time ?? 0) : (b.time ?? 0) - (a.time ?? 0)
    );
  }, [inWindow, activeRegion, sort]);

  // Any filter change starts the list from the top again.
  useEffect(() => setShown(PAGE_SIZE), [win, minMag, activeRegion, sort]);

  const showOnGlobe = (id: string) => {
    if (!activeLayers.includes("earthquakes")) toggleLayer("earthquakes");
    select(`earthquakes:${id}`);
    setView("mission");
  };

  const chip = "min-w-[7rem] rounded-xl border border-gray-800 bg-gray-800/60 px-3 py-2";
  const seg = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-green-400/20 text-green-400" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`;

  if (status === "loading") return <Skeleton className="mb-8 h-64" />;

  return (
    <section aria-label={t.quakesTitle} className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-1 text-xl font-bold text-white">🫨 {t.quakesTitle}</h2>
      <p className="mb-4 text-xs text-gray-500">{t.quakesSource}</p>

      {status === "error" ? (
        <div className="py-6 text-center">
          <p className="mb-3 text-sm text-gray-400">{t.quakesUnavailable}</p>
          <button
            onClick={() => { setStatus("loading"); load(); }}
            className="rounded-full bg-green-400/15 px-4 py-2 text-sm font-semibold text-green-400 hover:bg-green-400/25"
          >
            {t.quakesRetry}
          </button>
        </div>
      ) : (
        <>
          {counts && (
            <div className="mb-4 flex flex-wrap gap-2 font-mono" role="list">
              {[
                { v: counts.last_hour, l: t.statLastHour },
                { v: counts.last_24h, l: t.statLast24h },
                { v: counts.m4_5_24h, l: t.statM45 },
                { v: counts.m6_24h, l: t.statM6 },
              ].map((c) => (
                <div key={c.l} role="listitem" className={chip}>
                  <p className="text-xl font-bold text-white">{c.v}</p>
                  <p className="text-[11px] text-gray-400">{c.l}</p>
                </div>
              ))}
              {counts.strongest_24h && (
                <div role="listitem" className={`${chip} min-w-0 flex-1`}>
                  <p className="text-xl font-bold text-orange-400">{formatMag(counts.strongest_24h.mag)}</p>
                  <p className="truncate text-[11px] text-gray-400">
                    {t.statStrongest} · {counts.strongest_24h.place}
                  </p>
                </div>
              )}
            </div>
          )}

          {refreshFailed && <p role="status" className="mb-3 text-xs text-yellow-300">⚠️ {t.quakesStaleNote}</p>}

          <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex gap-2" role="group" aria-label="Time window">
              <button aria-pressed={win === "24h"} onClick={() => setWin("24h")} className={seg(win === "24h")}>{t.quakesLast24h}</button>
              <button aria-pressed={win === "7d"} onClick={() => setWin("7d")} className={seg(win === "7d")}>{t.quakesLast7d}</button>
            </div>
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-gray-400">
              {t.quakesMinMag}
              <select className={field} value={minMag} onChange={(e) => setMinMag(Number(e.target.value))}>
                {MIN_MAGS.map((m) => (
                  <option key={m} value={m}>M {m.toFixed(1)}+</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-gray-400">
              {t.quakesRegion}
              <select className={field} value={activeRegion} onChange={(e) => setRegion(e.target.value)}>
                <option value="">{t.quakesAllRegions}</option>
                {regions.map((r) => (
                  <option key={r.name} value={r.name}>{r.name} ({r.count})</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-gray-400">
              {t.quakesSort}
              <select className={field} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="time">{t.quakesSortNewest}</option>
                <option value="mag">{t.quakesSortStrongest}</option>
              </select>
            </label>
            <p className="ml-auto self-center font-mono text-xs text-gray-500" aria-live="polite">{rows.length}</p>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t.quakesNone}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {rows.slice(0, shown).map((q) => {
                  const r = q.raw;
                  const depth = Number.isFinite(r.depth_km) ? `↧ ${Math.round(r.depth_km)} km` : null;
                  return (
                    <li key={q.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800 p-3">
                      <span
                        className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg border font-mono leading-tight"
                        style={{ color: q.color, borderColor: `${q.color}66` }}
                        aria-label={formatMag(r.value)}
                      >
                        <span className="text-[10px] opacity-70">M</span>
                        <span className="text-base font-bold">{r.value.toFixed(1)}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-white">{r.place}</p>
                        <p className="text-xs text-gray-400">
                          {[r.region !== r.place ? r.region : null, depth, q.time ? `🕐 ${timeAgo(q.time, now)}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        {isRecent(q, now) && (
                          <button onClick={() => showOnGlobe(q.id)} className="font-semibold text-green-400 hover:underline">
                            {t.quakesOnGlobe}
                          </button>
                        )}
                        {typeof r.url === "string" && /^https:\/\//i.test(r.url) && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
                            USGS ↗
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {rows.length > shown && (
                <button
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="mx-auto mt-4 block rounded-full bg-gray-800 px-5 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
                >
                  {t.quakesShowMore} ({rows.length - shown})
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
