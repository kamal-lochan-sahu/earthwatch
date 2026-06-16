"use client";
import { useEffect, useState } from "react";

const API = "https://earthwatch.onrender.com";

export default function SeasonalChart() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<"observed"|"trend"|"seasonal"|"residual">("trend");

  useEffect(() => {
    fetch(`${API}/api/seasonal`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-56" />
  );
  if (!data || data.error) return null;

  const series = data[active] || [];
  const dates = data.dates || [];
  const valid = series.filter((v: any) => v !== null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const tabs = [
    { key: "observed", label: "Observed", color: "#60a5fa" },
    { key: "trend", label: "Trend", color: "#f87171" },
    { key: "seasonal", label: "Seasonal", color: "#4ade80" },
    { key: "residual", label: "Residual", color: "#facc15" },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">📈 Seasonal Decomposition</h2>
      <p className="text-gray-500 text-xs mb-4">Temperature broken into: Trend + Seasonality + Random noise</p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key as any)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              active === t.key
                ? "border-transparent text-black"
                : "border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
            style={active === t.key ? { backgroundColor: t.color } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-0.5 h-32 overflow-x-auto">
        {series.map((val: any, i: number) => {
          if (val === null) return <div key={i} className="flex-1 min-w-1" />;
          const h = ((val - min) / range) * 100;
          const color = tabs.find(t => t.key === active)?.color || "#60a5fa";
          return (
            <div key={i} className="flex-1 min-w-1 flex flex-col justify-end" title={`${dates[i]}: ${val}`}>
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max(h, 2)}%`, backgroundColor: color, opacity: 0.8 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-gray-600 text-xs mt-2 text-center">Last 90 days | Source: NASA POWER + Statsmodels</p>
    </div>
  );
}
