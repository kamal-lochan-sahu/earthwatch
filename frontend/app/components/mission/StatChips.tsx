"use client";
import { useAppState } from "../../context/AppState";
import { useData } from "../../context/DataContext";

/** The four headline numbers (formerly big cards), as a compact glass strip over the map. */
export default function StatChips() {
  const { t, convertTemp, tempUnit } = useAppState();
  const { temperature, anomaly, trends, co2, loadingTemp, loadingTrends, loadingCo2 } = useData();

  const chip = "min-w-[8.5rem] shrink-0 rounded-xl border border-white/10 bg-[rgba(17,24,39,0.72)] px-3 py-2 backdrop-blur";
  const label = "text-[11px] leading-4 text-gray-400";
  const value = "font-mono text-lg font-bold leading-6";
  const sub = "text-[10px] leading-4 text-gray-500";
  const dash = <span className="text-gray-600">…</span>;

  const isAnomaly = anomaly?.anomaly_result?.is_anomaly;
  const warming = trends?.trend?.trend === "warming";

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Headline numbers">
      <div role="listitem" className={chip}>
        <p className={label}>🌡️ {t.liveTemp}</p>
        <p className={`${value} text-green-400`}>
          {loadingTemp || !temperature?.current_temperature ? dash : `${convertTemp(temperature.current_temperature)}${tempUnit}`}
        </p>
        <p className={sub}>Delhi, India</p>
      </div>
      <div role="listitem" className={chip}>
        <p className={label}>🤖 {t.mlAnomaly}</p>
        <p className={`${value} ${isAnomaly ? "text-red-400" : "text-green-400"}`}>
          {loadingTemp ? dash : isAnomaly ? t.anomaly : t.normal}
        </p>
        <p className={sub}>Z: {anomaly?.anomaly_result?.z_score ?? "—"}</p>
      </div>
      <div role="listitem" className={chip}>
        <p className={label}>📈 {t.climateTrend}</p>
        <p className={`${value} ${warming ? "text-red-400" : "text-blue-400"}`}>
          {loadingTrends ? dash : warming ? t.warming : t.cooling}
        </p>
        <p className={sub}>{trends?.trend?.slope_per_year ?? "—"}°C/year</p>
      </div>
      <div role="listitem" className={chip}>
        <p className={label}>🏭 {t.co2Level}</p>
        <p className={`${value} text-red-400`}>{loadingCo2 ? dash : `${co2?.latest_co2_ppm ?? "—"} ppm`}</p>
        <p className={sub}>{co2?.current_status ?? ""}</p>
      </div>
    </div>
  );
}
