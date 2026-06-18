"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function HeatIndex({ lat=28.61, lon=77.21, city="Delhi" }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/heat-index?lat=${lat}&lon=${lon}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />;
  if (!data || data.error) return null;
  const colorMap: any = { red: "text-red-400 border-red-800", orange: "text-orange-400 border-orange-800", yellow: "text-yellow-400 border-yellow-800", green: "text-green-400 border-green-800", blue: "text-blue-400 border-blue-800", purple: "text-purple-400 border-purple-800" };
  const c = colorMap[data.heat_color] || "text-gray-400 border-gray-800";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">🌡️ Heat Index & UV</h2>
      <p className="text-gray-500 text-xs mb-4">{city} — Feels-like temperature + UV radiation</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className={`border rounded-xl p-4 ${c}`}>
          <p className="text-gray-400 text-xs mb-1">Heat Index</p>
          <p className={`text-3xl font-bold ${c.split(" ")[0]}`}>{data.heat_index}°C</p>
          <p className="text-xs mt-1 opacity-80">{data.heat_label}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Actual Temp</p>
          <p className="text-white text-3xl font-bold">{data.temperature}°C</p>
          <p className="text-gray-500 text-xs mt-1">Humidity: {data.humidity}%</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">UV Index</p>
          <p className="text-yellow-400 text-3xl font-bold">{data.uv_index}</p>
          <p className="text-gray-500 text-xs mt-1">{data.uv_label}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Thunder Risk</p>
          <p className={`text-2xl font-bold ${data.thunder_risk ? "text-red-400" : "text-green-400"}`}>{data.thunder_risk ? "HIGH" : "LOW"}</p>
          <p className="text-gray-500 text-xs mt-1">Precip: {data.precipitation_probability}%</p>
        </div>
      </div>
      <div className="flex items-end gap-1 h-16 overflow-x-auto">
        {data.hourly_forecast?.slice(0,24).map((h: any, i: number) => (
          <div key={i} className="flex-1 min-w-1" title={`${h.time}: ${h.temp}°C`}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(((h.temp+10)/60)*60, 4)}px`, backgroundColor: h.temp > 40 ? "#f87171" : h.temp > 30 ? "#fb923c" : "#60a5fa" }} />
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-1 text-center">24-hour temperature forecast | Source: Open-Meteo</p>
    </div>
  );
}
