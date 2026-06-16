"use client";
import { useEffect, useState } from "react";

const API = "https://earthwatch.onrender.com";

export default function ClimateIndex() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/climate-index`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />
  );
  if (!data || data.error) return null;

  const latest = data.latest;
  const phaseColor =
    latest.phase === "El Nino" ? "text-red-400 border-red-800" :
    latest.phase === "La Nina" ? "text-blue-400 border-blue-800" :
    "text-green-400 border-green-800";

  const barColor = (phase: string) =>
    phase === "El Nino" ? "#f87171" :
    phase === "La Nina" ? "#60a5fa" : "#4ade80";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">🌊 El Nino / La Nina Tracker</h2>
      <p className="text-gray-500 text-xs mb-4">NOAA Oceanic Nino Index (ONI) — Pacific Ocean temperature anomaly</p>

      <div className={`inline-flex items-center gap-3 border rounded-xl px-5 py-3 mb-4 ${phaseColor}`}>
        <span className="text-3xl">
          {latest.phase === "El Nino" ? "🔴" : latest.phase === "La Nina" ? "🔵" : "🟢"}
        </span>
        <div>
          <p className="font-bold text-lg">{latest.phase}</p>
          <p className="text-xs opacity-70">ONI: {latest.oni} | {latest.season} {latest.year}</p>
        </div>
      </div>
      <p className="text-gray-400 text-sm mb-4">{data.description}</p>

      <div className="flex items-end gap-1 h-24 overflow-x-auto">
        {data.history.slice(-16).map((h: any, i: number) => (
          <div key={i} className="flex flex-col items-center flex-1 min-w-6">
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.abs(h.oni) * 30 + 10}px`,
                backgroundColor: barColor(h.phase),
                opacity: 0.85
              }}
            />
            <p className="text-gray-600 text-xs mt-1 rotate-0 truncate w-full text-center">{h.year}</p>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2">ONI &gt; +0.5 = El Nino | ONI &lt; -0.5 = La Nina</p>
    </div>
  );
}
