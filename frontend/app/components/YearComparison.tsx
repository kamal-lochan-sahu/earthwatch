"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function YearComparison() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/year-comparison`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-56" />;
  if (!data || data.error) return null;
  const chartData = (data.chart_data || []).filter((d: any) =>
    d["2024"] !== null || d["2025"] !== null || d["2026"] !== null
  );
  if (chartData.length === 0) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Year-over-Year Comparison</h2>
      <p className="text-gray-500 text-xs mb-4">2024 vs 2025 vs 2026 monthly average temperatures</p>
      <div className="text-center py-8">
        <p className="text-gray-400 text-sm mb-2">Loading NASA POWER data...</p>
        <p className="text-gray-600 text-xs">NASA API may take 30-60 seconds for first load</p>
        <button onClick={() => { setLoading(true); fetch(`${API}/api/year-comparison`).then(r=>r.json()).then(d=>{setData(d);setLoading(false);}); }}
          className="mt-3 bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded-lg border border-gray-700">
          Retry
        </button>
      </div>
    </div>
  );
  const colors: any = { "2024": "#60a5fa", "2025": "#4ade80", "2026": "#f87171" };
  const allVals = chartData.flatMap((d: any) => [d["2024"],d["2025"],d["2026"]]).filter((v:any) => v !== null);
  const maxTemp = allVals.length > 0 ? Math.max(...allVals) : 40;
  const minTemp = allVals.length > 0 ? Math.min(...allVals) : 10;
  const range = maxTemp - minTemp || 1;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Year-over-Year Comparison</h2>
      <p className="text-gray-500 text-xs mb-4">2024 vs 2025 vs 2026 — monthly average temperatures</p>
      <div className="flex gap-4 mb-4">
        {["2024","2025","2026"].map(y => (
          <div key={y} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[y] }} />
            <span className="text-gray-400 text-xs">{y}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
        {chartData.map((d: any, i: number) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-10">
            <div className="w-full flex gap-0.5 items-end" style={{ height: "120px" }}>
              {["2024","2025","2026"].map(y => (
                d[y] !== null ? (
                  <div key={y} className="flex-1 rounded-t transition-all" style={{
                    height: `${((d[y] - minTemp) / range) * 110 + 10}px`,
                    backgroundColor: colors[y], opacity: 0.85
                  }} title={`${d.month} ${y}: ${d[y]}°C`} />
                ) : <div key={y} className="flex-1" />
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-1">{d.month}</p>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2 text-center">Source: NASA POWER monthly reanalysis</p>
    </div>
  );
}
