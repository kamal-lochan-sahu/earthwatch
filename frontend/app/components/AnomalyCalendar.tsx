"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function AnomalyCalendar() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/anomaly-calendar`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />;
  if (!data || data.error) return null;
  const levelColor = (l: number) => {
    if (l === 4) return "#f87171";
    if (l === 3) return "#fb923c";
    if (l === 2) return "#fbbf24";
    if (l === 1) return "#86efac";
    return "#1f2937";
  };
  const calendar = data.calendar || [];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Anomaly Heatmap Calendar</h2>
      <p className="text-gray-500 text-xs mb-1">GitHub-style — last 365 days temperature anomalies</p>
      <p className="text-gray-600 text-xs mb-4">{data.anomaly_count} anomaly days detected | Mean: {data.stats?.mean}°C | Std: {data.stats?.std}°C</p>
      <div className="flex flex-wrap gap-0.5 overflow-hidden">
        {calendar.map((c: any, i: number) => (
          <div key={i} className="w-3 h-3 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: levelColor(c.anomaly_level) }}
            title={`${c.date}: ${c.temp}°C (z=${c.z_score})`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-gray-500 text-xs">Less</span>
        {[0,1,2,3,4].map(l => <div key={l} className="w-3 h-3 rounded-sm" style={{ backgroundColor: levelColor(l) }} />)}
        <span className="text-gray-500 text-xs">More anomalous</span>
      </div>
    </div>
  );
}
