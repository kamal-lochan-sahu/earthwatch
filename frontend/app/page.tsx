"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import LoadingScreen from "./components/LoadingScreen";
import LanguageToggle from "./components/LanguageToggle";
import { translations, REGION_LANGUAGE_MAP } from "./translations";

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

interface CitySearchResult {
  city: string;
  temperature: number;
  humidity: number;
  wind_speed: number;
  is_anomaly: boolean;
  z_score: number;
  severity: string;
}

export default function Home() {
  const [temperature, setTemperature] = useState<any>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [co2, setCo2] = useState<any>(null);
  const [events, setEvents] = useState<WeatherEvent[]>([]);

  const [loadingTemp, setLoadingTemp] = useState(true);
  const [loadingCo2, setLoadingCo2] = useState(true);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  const [showLoader, setShowLoader] = useState(true);
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [currentLang, setCurrentLang] = useState("en");
  const [regionalLang, setRegionalLang] = useState<string | null>(null);
  const [searchCity, setSearchCity] = useState("");
  const [searchResult, setSearchResult] = useState<CitySearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Detect user region and set language
  useEffect(() => {
    async function detectRegion() {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        const countryCode = data.country_code;
        const regionCode = data.region_code;

        // Check India regions first
        const indiaKey = `IN-${regionCode}`;
        if (REGION_LANGUAGE_MAP[indiaKey]) {
          setRegionalLang(REGION_LANGUAGE_MAP[indiaKey]);
        } else if (REGION_LANGUAGE_MAP[countryCode]) {
          setRegionalLang(REGION_LANGUAGE_MAP[countryCode]);
        }
      } catch (e) {
        console.error("Region detection failed:", e);
      }
    }
    detectRegion();
  }, []);

  const t = translations[currentLang] || translations["en"];

  useEffect(() => {
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

    fetchTemp();
    setTimeout(() => fetchCo2(), 100);
    setTimeout(() => fetchCities(), 200);
    setTimeout(() => fetchEvents(), 300);
    setTimeout(() => fetchTrends(), 400);

    
  }, []);

  const searchCityWeather = async () => {
    if (!searchCity.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchCity)}&format=json&limit=1`
      );
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) {
        setSearchError("❌ City not found! Please try again.");
        setSearchLoading(false);
        return;
      }
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      const [tempRes, anomalyRes] = await Promise.all([
        fetch(`${API}/api/temperature?lat=${lat}&lon=${lon}`),
        fetch(`${API}/api/anomalies?lat=${lat}&lon=${lon}`),
      ]);
      const tempData = await tempRes.json();
      const anomalyData = await anomalyRes.json();
      setSearchResult({
        city: geoData[0].display_name.split(",")[0],
        temperature: tempData.current_temperature,
        humidity: tempData.current_humidity,
        wind_speed: tempData.current_wind_speed,
        is_anomaly: anomalyData.anomaly_result?.is_anomaly,
        z_score: anomalyData.anomaly_result?.z_score,
        severity: anomalyData.anomaly_result?.severity,
      });
    } catch (e) {
      setSearchError("❌ Something went wrong! Please try again.");
    } finally {
      setSearchLoading(false);
    }
  };

  const convertTemp = (temp: number) => {
    if (isFahrenheit) return Math.round((temp * 9 / 5) + 32);
    return temp;
  };
  const tempUnit = isFahrenheit ? "°F" : "°C";

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

  const Skeleton = ({ className }: { className: string }) => (
    <div className={`animate-pulse bg-gray-800 rounded-xl ${className}`} />
  );

  return (
    <>
      {showLoader && (
        <LoadingScreen onComplete={() => setShowLoader(false)} />
      )}
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-green-400 mb-3">
            🌍 {t.title}
          </h1>
          <p className="text-gray-400 text-lg">
            {t.subtitle}
          </p>
          <div className="flex justify-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => setIsFahrenheit(!isFahrenheit)}
              className="bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm font-bold transition-all"
            >
              <span className={isFahrenheit ? "text-gray-500" : "text-green-400"}>°C</span>
              <span className="text-gray-600 mx-2">|</span>
              <span className={isFahrenheit ? "text-green-400" : "text-gray-500"}>°F</span>
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: "EarthWatch 🌍",
                    text: `Delhi temperature: ${temperature?.current_temperature}°C | CO2: ${co2?.latest_co2_ppm} ppm | Check live climate data!`,
                    url: "https://earthwatch.vercel.app"
                  });
                } else {
                  navigator.clipboard.writeText("https://earthwatch.vercel.app");
                  alert("Link copied! Share EarthWatch 🌍");
                }
              }}
              className="bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm font-bold text-gray-300 hover:text-white hover:border-green-500 transition-all"
            >
              🔗 {t.share}
            </button>
            <LanguageToggle
              currentLang={currentLang}
              regionalLang={regionalLang}
              onLanguageChange={setCurrentLang}
            />
          </div>
        </div>

        {/* Search Box */}
        <div className="bg-gray-900 border border-green-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">🔍 {t.searchTitle}</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCityWeather()}
              placeholder={t.searchPlaceholder}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            <button
              onClick={searchCityWeather}
              disabled={searchLoading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold px-6 py-3 rounded-lg transition-colors"
            >
              {searchLoading ? "⏳" : t.searchButton}
            </button>
          </div>
          {searchError && <p className="text-red-400 text-sm mt-3">{searchError}</p>}
          {searchResult && (
            <div className="mt-4 bg-gray-800 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-gray-400 text-xs mb-1">📍 City</p>
                <p className="text-white font-bold text-lg">{searchResult.city}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">🌡️ Temperature</p>
                <p className={`font-bold text-2xl ${getTempColor(searchResult.temperature)}`}>
                  {convertTemp(searchResult.temperature)}{tempUnit}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">🤖 Anomaly</p>
                <p className={`font-bold text-lg ${searchResult.is_anomaly ? "text-red-400" : "text-green-400"}`}>
                  {searchResult.is_anomaly ? "⚠️ Anomaly!" : "✅ Normal"}
                </p>
                <p className="text-gray-500 text-xs">Z-Score: {searchResult.z_score}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">💧 Humidity</p>
                <p className="text-blue-400 font-bold text-lg">{searchResult.humidity}%</p>
                <p className="text-gray-500 text-xs">💨 {searchResult.wind_speed} km/h</p>
              </div>
            </div>
          )}
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {loadingTemp ? <Skeleton className="h-32" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🌡️ {t.liveTemp}</p>
              <p className="text-green-400 text-3xl font-bold">
                {temperature?.current_temperature ? `${convertTemp(temperature.current_temperature)}${tempUnit}` : `...${tempUnit}`}
              </p>
              <p className="text-gray-500 text-xs mt-1">Delhi, India</p>
            </div>
          )}
          {loadingTemp ? <Skeleton className="h-32" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🤖 {t.mlAnomaly}</p>
              <p className={`text-3xl font-bold ${anomaly?.anomaly_result?.is_anomaly ? "text-red-400" : "text-green-400"}`}>
                {anomaly?.anomaly_result?.is_anomaly ? t.anomaly : t.normal}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Z-Score: {anomaly?.anomaly_result?.z_score} | {anomaly?.anomaly_result?.severity}
              </p>
            </div>
          )}
          {loadingTrends ? <Skeleton className="h-32" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">📈 {t.climateTrend}</p>
              <p className={`text-3xl font-bold ${trends?.trend?.trend === "warming" ? "text-red-400" : "text-blue-400"}`}>
                {trends?.trend?.trend === "warming" ? t.warming : t.cooling}
              </p>
              <p className="text-gray-500 text-xs mt-1">{trends?.trend?.slope_per_year}°C/year</p>
            </div>
          )}
          {loadingCo2 ? <Skeleton className="h-32" /> : (
            <div className="bg-gray-900 border border-red-900 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-1">🏭 {t.co2Level}</p>
              <p className="text-red-400 text-3xl font-bold">{co2?.latest_co2_ppm} ppm</p>
              <p className="text-gray-500 text-xs mt-1">Safe: 350 ppm | Status: {co2?.current_status}</p>
            </div>
          )}
        </div>

        {/* CO2 Chart */}
        {loadingCo2 ? <Skeleton className="h-48 mb-8" /> : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">🏭 {t.co2Chart}</h2>
            <div className="flex items-end gap-1 h-32 overflow-x-auto">
              {co2?.monthly_data?.map((m: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <p className="text-red-400 text-xs font-bold">{m.co2_ppm}</p>
                  <div className="w-full rounded-t-sm bg-red-500 opacity-80"
                    style={{ height: `${((m.co2_ppm - 420) / 15) * 80 + 20}px` }} />
                  <p className="text-gray-500 text-xs">{m.month}/{String(m.year).slice(2)}</p>
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-3 text-center">
              Pre-industrial: 280 ppm | Safe: 350 ppm | Current: {co2?.latest_co2_ppm} ppm
            </p>
          </div>
        )}

        {/* Globe */}
        {!loadingCities && cities.length > 0 && <GlobeView cities={cities} />}

        {/* Global Cities */}
        {loadingCities ? <Skeleton className="h-64 mb-8" /> : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">🌐 {t.globalCities}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {cities.map((city: any) => (
                <div key={city.city} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="text-white font-bold">{city.city}</p>
                    <p className="text-gray-500 text-xs">💧 {city.humidity}% | 💨 {city.wind_speed} km/h</p>
                  </div>
                  <p className={`text-2xl font-bold ${getTempColor(city.temperature)}`}>
                    {convertTemp(city.temperature)}{tempUnit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        {loadingEvents ? <Skeleton className="h-48 mb-8" /> : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-1">🚨 {t.events}</h2>
            <p className="text-gray-500 text-xs mb-4">Source: GDACS — Global Disaster Alert & Coordination System</p>
            {events.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">{t.noEvents}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {events.map((event, i) => (
                  <div key={i} className={`bg-gray-800 border rounded-lg p-4 flex items-start gap-4 ${getSeverityColor(event.severity)}`}>
                    <span className="text-2xl mt-0.5">{getEventIcon(event.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-white font-bold text-sm">{event.title}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getSeverityColor(event.severity)}`}>
                          {isNaN(Number(event.severity)) ? String(event.severity ?? "").toUpperCase() : "⚠️ ALERT"}
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
        {loadingTrends ? <Skeleton className="h-48 mb-8" /> : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">📅 {t.monthlyAvg}</h2>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
              {trends?.monthly_averages?.map((m: any) => (
                <div key={m.month} className="text-center">
                  <div className="rounded-lg mb-1 mx-auto"
                    style={{
                      height: `${(m.avg_temp / 40) * 80}px`,
                      width: "100%",
                      backgroundColor: m.avg_temp > 30 ? "#f87171" : m.avg_temp > 25 ? "#fb923c" : "#60a5fa",
                    }} />
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
              <p className="text-gray-400 text-xs mb-1">{t.trainedOn}</p>
              <p className="text-white font-bold text-xl">{anomaly?.trained_on ?? "..."} {t.days}</p>
            </div>
          )}
          {loadingTrends ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">{t.hottestDay}</p>
              <p className="text-red-400 font-bold">{trends?.hottest_day?.temp}°C</p>
              <p className="text-gray-500 text-xs">{trends?.hottest_day?.date}</p>
            </div>
          )}
          {loadingTrends ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">{t.coldestDay}</p>
              <p className="text-blue-400 font-bold">{trends?.coldest_day?.temp}°C</p>
              <p className="text-gray-500 text-xs">{trends?.coldest_day?.date}</p>
            </div>
          )}
          {loadingCo2 ? <Skeleton className="h-24" /> : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">{t.co2Increase}</p>
              <p className="text-red-400 font-bold text-xl">+{co2?.annual_increase} ppm</p>
            </div>
          )}
        </div>

      </div>
    </main>
    </>
  );
}