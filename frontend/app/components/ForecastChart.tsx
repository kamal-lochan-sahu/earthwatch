"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function ForecastChart({ lat=28.61, lon=77.21, city="Delhi" }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/forecast?lat=${lat}&lon=${lon}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);
  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />;
  if (!data || data.error) return null;
  const forecast = data.forecast || [];
  const weatherEmoji = (desc: string) => {
    if (desc.includes("Clear")) return "☀️";
    if (desc.includes("cloud")) return "⛅";
    if (desc.includes("Rain")) return "🌧️";
    if (desc.includes("Thunder")) return "⛈️";
    if (desc.includes("Snow")) return "❄️";
    if (desc.includes("Fog")) return "🌫️";
    return "🌤️";
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">7-Day Forecast</h2>
      <p className="text-gray-500 text-xs mb-4">{city} — Open-Meteo weather forecast</p>
      <div className="grid grid-cols-7 gap-2">
        {forecast.map((f: any, i: number) => (
          <div key={i} className={`bg-gray-800 rounded-xl p-3 text-center ${i === 0 ? "border border-green-700" : ""}`}>
            <p className="text-gray-400 text-xs mb-1">{i === 0 ? "Today" : new Date(f.date).toLocaleDateString("en", {weekday:"short"})}</p>
            <p className="text-2xl mb-1">{weatherEmoji(f.weather_desc)}</p>
            <p className="text-red-400 font-bold text-sm">{f.max_temp}°</p>
            <p className="text-blue-400 text-xs">{f.min_temp}°</p>
            {f.precipitation_mm > 0 && <p className="text-blue-300 text-xs mt-1">{f.precipitation_mm}mm</p>}
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-3 text-center">Source: Open-Meteo 7-day forecast</p>
    </div>
  );
}
