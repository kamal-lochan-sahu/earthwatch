"use client";
import { useEffect, useState } from "react";

const API = "https://earthwatch.onrender.com";

export default function ArcticIce() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/arctic-ice`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />
  );
  if (!data || data.error) return null;

  const latest = data.latest;
  const maxExtent = 14;

  return (
    <div className="bg-gray-900 border border-blue-900 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">🧊 Arctic Ice Extent</h2>
      <p className="text-gray-500 text-xs mb-4">NSIDC — Daily Arctic sea ice coverage</p>

      <div className="flex items-center gap-4 mb-5">
        <div className="bg-blue-950 border border-blue-700 rounded-xl px-5 py-3">
          <p className="text-gray-400 text-xs mb-1">Current Extent</p>
          <p className="text-blue-300 text-3xl font-bold">{latest?.extent_million_km2}</p>
          <p className="text-gray-500 text-xs">million km² | {latest?.date}</p>
        </div>
        <div className="flex-1">
          <div className="bg-gray-800 rounded-full h-4 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
              style={{ width: `${(latest?.extent_million_km2 / maxExtent) * 100}%` }}
            />
          </div>
          <p className="text-gray-500 text-xs mt-1">vs max ~14 million km²</p>
        </div>
      </div>

      <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
        {data.monthly_summary?.map((m: any) => (
          <div key={m.month} className="text-center">
            <div
              className="mx-auto rounded mb-1"
              style={{
                height: `${(m.avg_extent / maxExtent) * 60 + 8}px`,
                width: "100%",
                backgroundColor: m.avg_extent > 10 ? "#93c5fd" : m.avg_extent > 6 ? "#60a5fa" : "#3b82f6"
              }}
            />
            <p className="text-gray-500 text-xs">
              {["J","F","M","A","M","J","J","A","S","O","N","D"][m.month - 1]}
            </p>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2 text-center">Monthly average ice extent (million km²)</p>
    </div>
  );
}
