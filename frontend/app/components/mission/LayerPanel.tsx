"use client";
import { GROUPS, LAYERS } from "../../layers";
import type { LayerDef } from "../../layers/types";
import { useAppState } from "../../context/AppState";
import { useLayerStore, type LayerState } from "../../context/LayerStore";
import { useNow } from "../../hooks/usePrefs";
import { timeAgo } from "../../lib/format";

function Status({ st, t, now }: { st: LayerState | undefined; t: Record<string, string>; now: number }) {
  if (!st || st.status === "idle" || (st.status === "loading" && !st.items.length))
    return <span className="text-gray-500">{t.layerLoading}</span>;
  if (st.status === "error") return <span className="text-orange-300">{t.layerRetrying}</span>;
  if (st.stale && st.updatedAt)
    return <span className="text-yellow-300">{t.layerStale} {timeAgo(st.updatedAt, now)}</span>;
  return (
    <span className="text-gray-500">
      {st.items.length} {t.pointsCount}
      {st.updatedAt ? ` · ${t.layerUpdated} ${timeAgo(st.updatedAt, now)}` : ""}
    </span>
  );
}

function LayerRow({ def }: { def: LayerDef }) {
  const { t, activeLayers, toggleLayer, convertTemp, tempUnit } = useAppState();
  const { states } = useLayerStore();
  const now = useNow();
  const on = activeLayers.includes(def.id);
  const st = states[def.id];

  return (
    <li className="rounded-lg">
      <button
        role="switch"
        aria-checked={on}
        onClick={() => toggleLayer(def.id)}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5"
      >
        <span
          aria-hidden
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${on ? "" : "opacity-30"}`}
          style={{ background: def.color }}
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${on ? "text-white" : "text-gray-400"}`}>
            {t[def.labelKey]}
          </span>
          {on && (
            <span className="block text-[11px] leading-4" aria-live="polite">
              <Status st={st} t={t} now={now} />
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-green-400/80" : "bg-gray-700"}`}
        >
          <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
        </span>
      </button>
      {on && (
        <ul className="mb-1 ml-8 flex flex-wrap gap-x-3 gap-y-1 pb-1 text-[11px] text-gray-400">
          {def.legend({ convertTemp, tempUnit }).map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Grouped layer toggles. Only groups that have at least one registered layer are shown. */
export default function LayerPanel() {
  const { t } = useAppState();
  return (
    <div>
      <h2 className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-gray-400">{t.layersTitle}</h2>
      {GROUPS.map((g) => {
        const defs = LAYERS.filter((l) => l.group === g.id);
        if (!defs.length) return null;
        return (
          <section key={g.id} className="mb-1">
            <h3 className="px-2 pt-2 text-[11px] font-semibold text-gray-500">{t[g.labelKey]}</h3>
            <ul>
              {defs.map((d) => (
                <LayerRow key={d.id} def={d} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
