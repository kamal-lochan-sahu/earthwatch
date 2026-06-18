"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function TippingPoints() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/tipping-points`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />;
  if (!data || data.error) return null;
  const alertColor = data.alert_level === "critical" ? "border-red-800" : data.alert_level === "warning" ? "border-orange-800" : "border-green-800";
  return (
    <div className={`bg-gray-900 border rounded-xl p-6 mb-8 ${alertColor}`}>
      <h2 className="text-xl font-bold text-white mb-1">Climate Tipping Points</h2>
      <p className="text-gray-500 text-xs mb-4">IPCC critical thresholds — {data.exceeded_count}/{data.total} exceeded</p>
      <div className="flex flex-col gap-3">
        {data.tipping_points?.map((tp: any, i: number) => {
          const pct = Math.min((tp.current / tp.threshold) * 100, 120);
          const exceeded = tp.status === "exceeded" || tp.status === "critical";
          return (
            <div key={i} className="bg-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-white font-bold text-sm">{tp.name}</p>
                  <p className="text-gray-500 text-xs">{tp.description}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${exceeded ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}`}>
                  {exceeded ? "EXCEEDED" : "SAFE"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-700 rounded-full h-2">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: exceeded ? "#f87171" : "#4ade80" }} />
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap">{tp.current} / {tp.threshold} {tp.unit}</p>
              </div>
              {tp.exceeded_by > 0 && <p className="text-red-400 text-xs mt-1">+{tp.exceeded_by} above threshold</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
