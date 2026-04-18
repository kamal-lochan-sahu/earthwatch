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

const API = "https://earthwatch.onrender.com";

export default function Home() {
  const [temperature, setTemperature] = useState<any>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [co2, setCo2] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tempRes, anomalyRes, trendsRes, citiesRes, co2Res] = await Promise.all([
          fetch(`${API}/api/temperature`),
          fetch(`${API}/api/anomalies`),
          fetch(`${API}/api/trends`),
          fetch(`${API}/api/temperature/global`),
          fetch(`${API}/api/co2`),
        ]);
        setTemperature(await tempRes.json());
        setAnomaly(await anomalyRes.json());
        setTrends(await trendsRes.json());
        const citiesData = await citiesRes.json();
        setCities(citiesData.cities || []);
        setCo2(await co2Res.json());
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
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">🌡️ Live Temperature</p>
                <p className="text-green-400 text-3xl font-bold">
                  {temperature?.current_temperature}°C
                </p>
                <p className="text-gray-500 text-xs mt-1">Berhampur, Odisha</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">🤖 ML Anomaly</p>
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

              {/* CO2 Card */}
              <div className="bg-gray-900 border border-red-900 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-1">🏭 CO2 Level</p>
                <p className="text-red-400 text-3xl font-bold">
                  {co2?.latest_co2_ppm} ppm
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Safe: 350 ppm | Status: {co2?.current_status}
                </p>
              </div>
            </div>

            {/* CO2 Monthly Chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
              <h2 className="text-xl font-bold text-white mb-4">🏭 CO2 Concentration — Last 12 Months (Mauna Loa)</h2>
              <div className="flex items-end gap-2 h-32">
                {co2?.monthly_data?.map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <p className="text-red-400 text-xs font-bold">{m.co2_ppm}</p>
                    <div
                      className="w-full rounded-t-sm bg-red-500 opacity-80"
                      style={{ height: `${((m.co2_ppm - 420) / 15) * 80 + 20}px` }}
                    />
                    <p className="text-gray-500 text-xs">{m.month}/{String(m.year).slice(2)}</p>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs mt-3 text-center">
                Pre-industrial level: 280 ppm | Safe level: 350 ppm | Current: {co2?.latest_co2_ppm} ppm
              </p>
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

            {/* Bottom Stats */}
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
                <p className="text-gray-400 text-xs mb-1">CO2 Increase/Year</p>
                <p className="text-red-400 font-bold text-xl">+{co2?.annual_increase} ppm</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}