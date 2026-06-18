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
  const chartData = data.chart_data || [];
  const colors: any = { "2024": "#60a5fa", "2025": "#4ade80", "2026": "#f87171" };
  const maxTemp = Math.max(...chartData.flatMap((d: any) => [d["2024"]||0, d["2025"]||0, d["2026"]||0]));
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
      <div className="flex items-end gap-1 h-40 overflow-x-auto">
        {chartData.map((d: any, i: number) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-8">
            {["2024","2025","2026"].map(y => (
              <div key={y} className="w-full rounded-t" style={{ height: `${((d[y]||0)/maxTemp)*100}px`, backgroundColor: colors[y], opacity: 0.85 }} title={`${d.month} ${y}: ${d[y]}°C`} />
            ))}
            <p className="text-gray-500 text-xs mt-1">{d.month}</p>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2 text-center">Source: NASA POWER monthly reanalysis</p>
    </div>
  );
}
