"use client";
import { useEffect, useState } from "react";

const API = "https://earthwatch.onrender.com";

interface AQIProps {
  lat?: number;
  lon?: number;
  cityName?: string;
}

export default function AirQuality({ lat = 28.61, lon = 77.21, cityName = "Delhi" }: AQIProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/air-quality?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-40" />
  );
  if (!data || data.error) return null;

  const aqiColor = (label: string) => {
    if (label === "Good") return "text-green-400";
    if (label === "Fair") return "text-yellow-400";
    if (label === "Moderate") return "text-orange-400";
    if (label === "Poor" || label === "Very Poor") return "text-red-400";
    return "text-red-600";
  };

  const aqiBg = (label: string) => {
    if (label === "Good") return "border-green-800";
    if (label === "Fair") return "border-yellow-800";
    if (label === "Moderate") return "border-orange-800";
    return "border-red-800";
  };

  return (
    <div className={`bg-gray-900 border rounded-xl p-6 mb-8 ${aqiBg(data.aqi_label)}`}>
      <h2 className="text-xl font-bold text-white mb-1">💨 Air Quality Index</h2>
      <p className="text-gray-500 text-xs mb-4">{cityName} — European AQI | Source: Open-Meteo</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-gray-400 text-xs mb-1">AQI Score</p>
          <p className={`text-4xl font-bold ${aqiColor(data.aqi_label)}`}>{data.current_aqi ?? "--"}</p>
          <p className={`text-sm font-semibold mt-1 ${aqiColor(data.aqi_label)}`}>{data.aqi_label}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">PM2.5</p>
          <p className="text-white font-bold text-2xl">{data.pm2_5 ?? "--"}</p>
          <p className="text-gray-500 text-xs">ug/m3</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">PM10</p>
          <p className="text-white font-bold text-2xl">{data.pm10 ?? "--"}</p>
          <p className="text-gray-500 text-xs">ug/m3</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">Health Advice</p>
          <p className="text-gray-300 text-xs leading-relaxed">
            {data.aqi_label === "Good" ? "Air quality is satisfactory. Outdoor activities safe." :
             data.aqi_label === "Fair" ? "Acceptable quality. Sensitive groups take care." :
             data.aqi_label === "Moderate" ? "Sensitive groups may experience effects." :
             "Avoid prolonged outdoor exertion."}
          </p>
        </div>
      </div>

      {data.hourly_aqi?.length > 0 && (
        <div className="flex items-end gap-1 h-12 mt-4 overflow-x-auto">
          {data.hourly_aqi.map((h: any, i: number) => (
            <div key={i} className="flex-1 min-w-4" title={`${h.time}: ${h.aqi}`}>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${((h.aqi || 0) / 100) * 40 + 5}px`,
                  backgroundColor: h.aqi <= 40 ? "#4ade80" : h.aqi <= 70 ? "#fb923c" : "#f87171"
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
