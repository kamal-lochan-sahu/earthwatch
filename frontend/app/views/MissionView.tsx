"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAppState } from "../context/AppState";
import { LayerStoreProvider, useLayerStore } from "../context/LayerStore";
import { LAYER_BY_ID } from "../layers";
import { useReducedMotion } from "../hooks/usePrefs";
import { buildPoints } from "../components/mission/points";
import LayerPanel from "../components/mission/LayerPanel";
import DetailPanel from "../components/mission/DetailPanel";
import StatChips from "../components/mission/StatChips";
import Ticker, { layersHaveTicker } from "../components/mission/Ticker";

const stageLoading = () => (
  <div className="absolute inset-0 flex items-center justify-center">
    <p className="text-gray-400">🌍 Loading…</p>
  </div>
);
const GlobeStage = dynamic(() => import("../components/mission/GlobeStage"), { ssr: false, loading: stageLoading });
const FlatMap = dynamic(() => import("../components/mission/FlatMap"), { ssr: false, loading: stageLoading });

const GLASS = "border border-white/10 bg-[rgba(17,24,39,0.72)] backdrop-blur";

function Stage() {
  const {
    t, activeLayers, select, selection, mapMode, canWebGL, reportWebGLFailure,
    visitorGeo, geoSettled, convertTemp, tempUnit,
  } = useAppState();
  const { states, selected } = useLayerStore();
  const reduced = useReducedMotion();
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [layersHidden, setLayersHidden] = useState(false); // desktop collapse

  const units = useMemo(() => ({ convertTemp, tempUnit }), [convertTemp, tempUnit]);
  const hasTicker = layersHaveTicker(activeLayers);
  const selectedKey = selected ? `${selected.def.id}:${selected.item.id}` : "";
  const points = useMemo(
    () => buildPoints(activeLayers, states, selectedKey),
    [activeLayers, states, selectedKey]
  );

  const onSelect = (key: string | null) => {
    select(key ?? "");
    if (key) setMobileLayersOpen(false);
  };

  // One small status pill: what is loading / failing right now.
  const pill = (() => {
    for (const id of activeLayers) {
      const def = LAYER_BY_ID[id];
      const st = states[id];
      if (!def) continue;
      if (st?.status === "error") return `⚠️ ${t[def.labelKey]}: ${t.layerRetrying}`;
      if (!st || st.status === "idle" || (st.status === "loading" && !st.items.length))
        return `${t.layerLoading.replace("…", "")} ${t[def.labelKey]}…`;
    }
    return null;
  })();

  return (
    <section
      aria-label="Mission view"
      className="fixed inset-x-0 top-[var(--topbar-h,3.5rem)] bottom-[var(--bottomnav-h,0px)] overflow-hidden bg-[#05070d]"
    >
      {canWebGL !== null &&
        (mapMode === "3d" ? (
          <GlobeStage
            points={points}
            onSelect={onSelect}
            units={units}
            reducedMotion={reduced}
            geo={visitorGeo}
            geoSettled={geoSettled}
            onWebGLFailure={reportWebGLFailure}
          />
        ) : (
          <FlatMap
            points={points}
            onSelect={onSelect}
            units={units}
            reducedMotion={reduced}
            labels={{ zoomIn: t.zoomIn, zoomOut: t.zoomOut, zoomReset: t.zoomReset }}
          />
        ))}

      {/* Notices */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3">
        {canWebGL === false && (
          <p className={`${GLASS} rounded-full px-3 py-1 text-center text-xs text-yellow-200`}>{t.webglMissing}</p>
        )}
        {pill && (
          <p role="status" className={`${GLASS} rounded-full px-3 py-1 text-xs text-gray-300`}>{pill}</p>
        )}
      </div>

      {/* Layer panel: left column on desktop, bottom sheet on mobile */}
      <aside
        aria-label={t.layersTitle}
        className={`${GLASS} z-20 absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-2xl p-3
          md:inset-x-auto md:bottom-auto md:left-3 md:top-3 md:max-h-[calc(100%-4rem)] md:w-64 md:rounded-2xl
          ${mobileLayersOpen ? "block" : "hidden"} ${layersHidden ? "md:hidden" : "md:block"}`}
      >
        <button
          onClick={() => { setMobileLayersOpen(false); setLayersHidden(true); }}
          aria-label={t.close}
          className="absolute right-2 top-2 h-7 w-7 rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        <LayerPanel />
      </aside>
      <button
        onClick={() => setMobileLayersOpen(true)}
        className={`${GLASS} absolute ${hasTicker ? "bottom-11" : "bottom-3"} left-3 z-10 rounded-full px-4 py-2 text-sm font-semibold text-gray-100 md:hidden
          ${mobileLayersOpen || selected ? "hidden" : ""}`}
      >
        ☰ {t.layersTitle}
      </button>
      {layersHidden && (
        <button
          onClick={() => setLayersHidden(false)}
          className={`${GLASS} absolute left-3 top-3 z-10 hidden rounded-full px-4 py-2 text-sm font-semibold text-gray-100 md:block`}
        >
          ☰ {t.layersTitle}
        </button>
      )}

      {/* Detail panel: right column on desktop, bottom sheet on mobile */}
      {selected && (
        <aside className={`${GLASS} z-20 absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-2xl p-4
          md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-80 md:rounded-2xl`}>
          <DetailPanel />
        </aside>
      )}

      {/* Headline numbers: top strip on mobile, bottom-centre on desktop */}
      {!selected && (
        <div className={`absolute inset-x-3 top-12 z-10 md:inset-x-auto ${hasTicker ? "md:bottom-12" : "md:bottom-3"} md:left-1/2 md:top-auto md:-translate-x-1/2`}>
          <StatChips />
        </div>
      )}

      {hasTicker && <Ticker />}
    </section>
  );
}

export default function MissionView() {
  return (
    <LayerStoreProvider>
      <Stage />
    </LayerStoreProvider>
  );
}
