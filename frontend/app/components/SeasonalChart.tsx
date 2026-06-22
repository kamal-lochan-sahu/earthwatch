"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function SeasonalChart() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<"observed"|"trend"|"seasonal"|"residual">("trend");
  useEffect(() => {
    fetch(`${API}/api/seasonal`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-56" />;
  if (!data || data.error) return null;
  const tabs = [
    { key: "observed", label: "Observed", color: "#60a5fa" },
    { key: "trend", label: "Trend", color: "#f87171" },
    { key: "seasonal", label: "Seasonal", color: "#4ade80" },
    { key: "residual", label: "Residual", color: "#facc15" },
  ];
  // const series: number[] = (data[active] || []).filter((v: any) => v !== null);
  const dates = data.dates || [];
  const allSeries: number[] = (data[active] || []).map((v: any) => v ?? 0);
  const validVals = allSeries.filter(v => v !== 0);
  const min = validVals.length > 0 ? Math.min(...validVals) : 0;
  const max = validVals.length > 0 ? Math.max(...validVals) : 40;
  const range = max - min || 1;
  const activeColor = tabs.find(t => t.key === active)?.color || "#60a5fa";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Seasonal Decomposition</h2>
      <p className="text-gray-500 text-xs mb-4">Temperature broken into: Trend + Seasonality + Random noise</p>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActive(t.key as any)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              active === t.key ? "border-transparent text-black" : "border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
            style={active === t.key ? { backgroundColor: t.color } : {}}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative h-36 flex items-end gap-px overflow-x-auto">
        {(data[active] || []).map((val: any, i: number) => {
          if (val === null || val === undefined) return <div key={i} className="flex-1 min-w-px" />;
          const h = Math.max(((val - min) / range) * 130, 2);
          return (
            <div key={i} className="flex-1 min-w-px flex flex-col justify-end h-full" title={`${dates[i]}: ${val}`}>
              <div className="w-full rounded-t" style={{ height: `${h}px`, backgroundColor: activeColor, opacity: 0.8 }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        <p className="text-gray-600 text-xs">{dates[0]}</p>
        <p className="text-gray-600 text-xs">Last 90 days | NASA POWER + Statsmodels</p>
        <p className="text-gray-600 text-xs">{dates[dates.length-1]}</p>
      </div>
    </div>
  );
}
