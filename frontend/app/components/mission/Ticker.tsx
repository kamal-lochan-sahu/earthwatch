"use client";
import { useMemo } from "react";
import { useAppState } from "../../context/AppState";
import { useLayerStore } from "../../context/LayerStore";
import { LAYER_BY_ID } from "../../layers";
import { useNow } from "../../hooks/usePrefs";
import { timeAgo } from "../../lib/format";

const MAX_ENTRIES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ENTRIES_TO_SCROLL = 5; // a marquee of one or two items would just be a big gap

interface Entry {
  key: string; // "layerId:itemId", also the selection key
  text: string;
  color: string;
  time: number;
}

/** True when at least one active layer can feed the ticker (used to reserve its space). */
export function layersHaveTicker(activeIds: string[]): boolean {
  return activeIds.some((id) => !!LAYER_BY_ID[id]?.ticker || !!LAYER_BY_ID[id]?.counter);
}

/**
 * Bottom strip of the Mission view: headline 24h counters on the left, a scrolling list of the
 * latest events on the right. Everything comes from the layers' own counter()/ticker() — this
 * component has no layer-specific code. Clicking an event selects it on the map.
 */
export default function Ticker() {
  const { t, activeLayers, select, convertTemp, tempUnit } = useAppState();
  const { states } = useLayerStore();
  const now = useNow(30_000);

  const counters = useMemo(
    () =>
      activeLayers
        .map((id) => states[id]?.counter)
        .filter((c): c is NonNullable<typeof c> => !!c),
    [activeLayers, states]
  );

  const entries = useMemo(() => {
    const out: Entry[] = [];
    const units = { convertTemp, tempUnit };
    for (const id of activeLayers) {
      const def = LAYER_BY_ID[id];
      const st = states[id];
      if (!def?.ticker || !st) continue;
      for (const item of st.items) {
        if (item.time === undefined || now - item.time > DAY_MS) continue;
        out.push({ key: `${def.id}:${item.id}`, text: def.ticker(item, units), color: item.color, time: item.time });
      }
    }
    return out.sort((a, b) => b.time - a.time).slice(0, MAX_ENTRIES);
  }, [activeLayers, states, now, convertTemp, tempUnit]);

  const animate = entries.length >= MIN_ENTRIES_TO_SCROLL;
  const seconds = Math.min(180, Math.max(30, Math.round(entries.length * 5.5)));

  const renderEntry = (e: Entry, hidden: boolean) => (
    <li key={(hidden ? "dup:" : "") + e.key} className={hidden ? "ew-ticker-dup" : undefined} aria-hidden={hidden || undefined}>
      <button
        type="button"
        tabIndex={hidden ? -1 : 0}
        onClick={() => select(e.key)}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1 text-gray-300 hover:text-white focus-visible:text-white"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
        <span>{e.text}</span>
        <span className="text-gray-500">{timeAgo(e.time, now)}</span>
      </button>
    </li>
  );

  return (
    <div
      role="region"
      aria-label={t.tickerLabel}
      className="ew-ticker absolute inset-x-0 bottom-0 z-10 flex h-8 items-center gap-2 border-t border-white/10 bg-[rgba(5,7,13,0.82)] px-3 text-xs backdrop-blur md:h-9"
    >
      {counters.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 font-mono">
          {counters.map((c) => (
            <span key={c.labelKey} className="whitespace-nowrap">
              <b className="text-sm text-white">{c.value}</b> <span className="text-gray-400">{t[c.labelKey]}</span>
            </span>
          ))}
        </div>
      )}
      <div className="ew-ticker-viewport relative min-w-0 flex-1 overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-3 text-gray-500">{t.tickerEmpty}</p>
        ) : (
          <ul
            className={`ew-ticker-track ${animate ? "ew-ticker-animate" : ""}`}
            style={animate ? ({ "--ew-ticker-dur": `${seconds}s` } as React.CSSProperties) : undefined}
          >
            {entries.map((e) => renderEntry(e, false))}
            {animate && entries.map((e) => renderEntry(e, true))}
          </ul>
        )}
      </div>
    </div>
  );
}
