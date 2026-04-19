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

interface WeatherEvent {
  title: string;
  type: any;
  severity: any;
  date: string;
  location?: string;
  description?: string;
}

export default function Home() {
  const [temperature, setTemperature] = useState<any>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [co2, setCo2] = useState<any>(null);
  const [events, setEvents] = useState<WeatherEvent[]>([]);

  // Har cheez ka alag loading state
  const [loadingTemp, setLoadingTemp] = useState(true);
  const [loadingCo2, setLoadingCo2] = useState(true);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    // 1. PEHLE — Temperature aur Anomaly (sabse zaroori)
    async function fetchTemp() {
      try {
        const [tempRes, anomalyRes] = await Promise.all([
          fetch(`${API}/api/temperature`),
          fetch(`${API}/api/anomalies`),
        ]);
        setTemperature(await tempRes.json());
        setAnomaly(await anomalyRes.json());
      } catch (e) {
        console.error("Temp error:", e);
      } finally {
        setLoadingTemp(false);
      }
    }

    // 2. PHIR — CO2
    async function fetchCo2() {
      try {
        const res = await fetch(`${API}/api/co2`);
        setCo2(await res.json());
      } catch (e) {
        console.error("CO2 error:", e);
      } finally {
        setLoadingCo2(false);
      }
    }

    // 3. PHIR — Cities (Globe ke liye)
    async function fetchCities() {
      try {
        const res = await fetch(`${API}/api/temperature/global`);
        const data = await res.json();
        setCities(data.cities || []);
      } catch (e) {
        console.error("Cities error:", e);
      } finally {
        setLoadingCities(false);
      }
    }

    // 4. PHIR — Events
    async function fetchEvents() {
      try {
        const res = await fetch(`${API}/api/events`);
        const data = await res.json();
        setEvents(data.events || []);
      } catch (e) {
        console.error("Events error:", e);
      } finally {
        setLoadingEvents(false);
      }
    }

    // 5. SABSE BAAD — Trends (heavy calculation)
    async function fetchTrends() {
      try {
        const res = await fetch(`${API}/api/trends`);
        setTrends(await res.json());
      } catch (e) {
        console.error("Trends error:", e);
      } finally {
        setLoadingTrends(false);
      }
    }

    // Pehle temp shuru karo
    fetchTemp();
    // Thodi der baad baaki sab
    setTimeout(() => fetchCo2(), 100);
    setTimeout(() => fetchCities(), 200);
    setTimeout(() => fetchEvents(), 300);
    setTimeout(() => fetchTrends(), 400);
  }, []);

  const getTempColor = (temp: number) => {
    if (temp >= 30) return "text-red-400";
    if (temp >= 20) return "text-orange-400";
    if (temp >= 10) return "text-yellow-400";
    return "text-blue-400";
  };

  const getSeverityColor = (severity: any) => {
    const s = String(severity ?? "").toLowerCase();
    if (s === "red" || s === "extreme" || s === "high") return "text-red-400 border-red-800";
    if (s === "orange" || s === "moderate" || s === "medium") return "text-orange-400 border-orange-800";
    if (s === "green" || s === "low" || s === "minor") return "text-green-400 border-green-800";
    return "text-yellow-400 border-yellow-800";
  };

  const getEventIcon = (type: any) => {
    const t = String(type ?? "").toLowerCase();
    if (t.includes("flood")) return "🌊";
    if (t.includes("storm") || t.includes("cyclone") || t.includes("hurricane")) return "🌀";
    if (t.includes("earthquake") || t.includes("quake")) return "🫨";
    if (t.includes("fire") || t.includes("wildfire")) return "🔥";
    if (t.includes("drought")) return "☀️";
    if (t.includes("volcano")) return "🌋";
    if (t.includes("snow") || t.includes("blizzard")) return "❄️";
    return "⚠️";
  };

  // Skeleton shimmer component
  const Skeleton = ({ className }: { className: string }) => (
    <div className={`animate-pulse bg-gray-800 rounded-xl ${className}`} />
  );

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

        {/* Top Stats — Pehle Dikhta Hai */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Temperature Card */}
          {loadingTemp ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🌡️ Live Temperature</p>
              <p className="text-green-400 text-3xl font-bold">
                {temperature?.current_temperature}°C
              </p>
              <p className="text-gray-500 text-xs mt-1">Berhampur, Odisha</p>
            </div>
          )}

          {/* Anomaly Card */}
          {loadingTemp ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🤖 ML Anomaly</p>
              <p className={`text-3xl font-bold ${anomaly?.anomaly_result?.is_anomaly ? "text-red-400" : "text-green-400"}`}>
                {anomaly?.anomaly_result?.is_anomaly ? "⚠️ Anomaly!" : "✅ Normal"}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Z-Score: {anomaly?.anomaly_result?.z_score} | {anomaly?.anomaly_result?.severity}
              </p>
            </div>
          )}

          {/* Trends Card */}
          {loadingTrends ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">📈 Climate Trend</p>
              <p className={`text-3xl font-bold ${trends?.trend?.trend === "warming" ? "text-red-400" : "text-blue-400"}`}>
                {trends?.trend?.trend === "warming" ? "🔥 Warming" : "❄️ Cooling"}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {trends?.trend?.slope_per_year}°C/year
              </p>
            </div>
          )}

          {/* CO2 Card */}
          {loadingCo2 ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="bg-gray-900 border border-red-900 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🏭 CO2 Level</p>
              <p className="text-red-400 text-3xl font-bold">
                {co2?.latest_co2_ppm} ppm
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Safe: 350 ppm | Status: {co2?.current_status}
              </p>
            </div>
          )}
        </div>

        {/* CO2 Chart */}
        {loadingCo2 ? (
          <Skeleton className="h-48 mb-8" />
        ) : (
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
        )}

        {/* Globe */}
        {!loadingCities && cities.length > 0 && <GlobeView cities={cities} />}

        {/* Global Cities */}
        {loadingCities ? (
          <Skeleton className="h-64 mb-8" />
        ) : (
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
        )}

        {/* Events */}
        {loadingEvents ? (
          <Skeleton className="h-48 mb-8" />
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-1">
              🚨 Live Weather & Disaster Events
            </h2>
            <p className="text-gray-500 text-xs mb-4">Source: GDACS</p>
            {events.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">No active events reported.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {events.map((event, i) => (
                  <div key={i} className={`bg-gray-800 border rounded-lg p-4 flex items-start gap-4 ${getSeverityColor(event.severity)}`}>
                    <span className="text-2xl mt-0.5">{getEventIcon(event.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-white font-bold text-sm">{event.title}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getSeverityColor(event.severity)}`}>
                          {String(event.severity ?? "").toUpperCase()}
                        </span>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        {event.type && <p className="text-gray-400 text-xs">📌 {event.type}</p>}
                        {event.location && <p className="text-gray-400 text-xs">📍 {event.location}</p>}
                        {event.date && <p className="text-gray-500 text-xs">🕐 {event.date}</p>}
                      </div>
                      {event.description && (
                        <p className="text-gray-400 text-xs mt-1 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monthly Averages */}
        {loadingTrends ? (
          <Skeleton className="h-48 mb-8" />
        ) : (
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
        )}

        {/* Bottom Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loadingTemp ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Trained On</p>
              <p className="text-white font-bold text-xl">{anomaly?.trained_on} days</p>
            </div>
          )}
          {loadingTrends ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Hottest Day</p>
              <p className="text-red-400 font-bold">{trends?.hottest_day?.temp}°C</p>
              <p className="text-gray-500 text-xs">{trends?.hottest_day?.date}</p>
            </div>
          )}
          {loadingTrends ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Coldest Day</p>
              <p className="text-blue-400 font-bold">{trends?.coldest_day?.temp}°C</p>
              <p className="text-gray-500 text-xs">{trends?.coldest_day?.date}</p>
            </div>
          )}
          {loadingCo2 ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">CO2 Increase/Year</p>
              <p className="text-red-400 font-bold text-xl">+{co2?.annual_increase} ppm</p>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}