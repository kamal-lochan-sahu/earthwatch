"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const GlobeView = dynamic(() => import("./components/GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 h-64 flex items-center justify-center">
      <p className="text-gray-400">🌍 Loading Globe...</p>
    </div>
  ),
});

const API = "http://127.0.0.1:8000";

export default function Home() {
  const [temperature, setTemperature] = useState<any>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tempRes, anomalyRes, trendsRes, citiesRes] = await Promise.all([
          fetch(`${API}/api/temperature`),
          fetch(`${API}/api/anomalies`),
          fetch(`${API}/api/trends`),
          fetch(`${API}/api/temperature/global`),
        ]);
        setTemperature(await tempRes.json());
        setAnomaly(await anomalyRes.json());
        setTrends(await trendsRes.json());
        const citiesData = await citiesRes.json();
        setCities(citiesData.cities || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getTempColor = (temp: number) => {
    if (temp >= 30) return "text-red-400";
    if (temp >= 20) return "text-orange-400";
    if (temp >= 10) return "text-yellow-400";
    return "text-blue-400";
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-green-400 mb-3">
            🌍 EarthWatch
          </h1>
          <p className="text-gray-400 text-lg">
            Real-Time Climate Anomaly Detection & Environmental Intelligence
          </p>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 text-xl py-20">
            ⏳ Loading live data from NASA & Open-Meteo...
          </div>
        ) : (
          <>
            {/* Live Temperature */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">🌡️ Live Temperature</p>
                <p className="text-green-400 text-3xl font-bold">
                  {temperature?.current_temperature}°C
                </p>
                <p className="text-gray-500 text-xs mt-1">Berhampur, Odisha</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">🤖 ML Anomaly Status</p>
                <p className={`text-3xl font-bold ${anomaly?.anomaly_result?.is_anomaly ? "text-red-400" : "text-green-400"}`}>
                  {anomaly?.anomaly_result?.is_anomaly ? "⚠️ Anomaly!" : "✅ Normal"}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Z-Score: {anomaly?.anomaly_result?.z_score} | {anomaly?.anomaly_result?.severity}
                </p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">📈 Climate Trend</p>
                <p className={`text-3xl font-bold ${trends?.trend?.trend === "warming" ? "text-red-400" : "text-blue-400"}`}>
                  {trends?.trend?.trend === "warming" ? "🔥 Warming" : "❄️ Cooling"}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  {trends?.trend?.slope_per_year}°C/year
                </p>
              </div>
            </div>

            {/* 3D Globe */}
            {cities.length > 0 && <GlobeView cities={cities} />}

            {/* Global Cities */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
              <h2 className="text-xl font-bold text-white mb-4">🌐 Global Cities — Live Temperature</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {cities.map((city: any) => (
                  <div key={city.city} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="text-white font-bold">{city.city}</p>
                      <p className="text-gray-500 text-xs">💧 {city.humidity}% | 💨 {city.wind_speed} km/h</p>
                    </div>
                    <p className={`text-2xl font-bold ${getTempColor(city.temperature)}`}>
                      {city.temperature}°
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Averages */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
              <h2 className="text-xl font-bold text-white mb-4">📅 Monthly Temperature Averages</h2>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                {trends?.monthly_averages?.map((m: any) => (
                  <div key={m.month} className="text-center">
                    <div
                      className="rounded-lg mb-1 mx-auto"
                      style={{
                        height: `${(m.avg_temp / 40) * 80}px`,
                        width: "100%",
                        backgroundColor: m.avg_temp > 30 ? "#f87171" : m.avg_temp > 25 ? "#fb923c" : "#60a5fa",
                      }}
                    />
                    <p className="text-gray-400 text-xs">
                      {["J","F","M","A","M","J","J","A","S","O","N","D"][m.month - 1]}
                    </p>
                    <p className="text-white text-xs font-bold">{m.avg_temp}°</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-xs mb-1">Trained On</p>
                <p className="text-white font-bold text-xl">{anomaly?.trained_on} days</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-xs mb-1">Hottest Day</p>
                <p className="text-red-400 font-bold">{trends?.hottest_day?.temp}°C</p>
                <p className="text-gray-500 text-xs">{trends?.hottest_day?.date}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-xs mb-1">Coldest Day</p>
                <p className="text-blue-400 font-bold">{trends?.coldest_day?.temp}°C</p>
                <p className="text-gray-500 text-xs">{trends?.coldest_day?.date}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-xs mb-1">Humidity</p>
                <p className="text-purple-400 font-bold text-xl">{temperature?.current_humidity}%</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}