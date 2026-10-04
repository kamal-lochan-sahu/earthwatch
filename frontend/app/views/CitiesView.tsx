"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ViewContainer from "../components/ViewContainer";
import Skeleton from "../components/Skeleton";
import { useAppState } from "../context/AppState";
import { useData } from "../context/DataContext";
import { apiGet } from "../hooks/useApi";
import { getTempColor } from "../lib/format";
import AirQuality from "../components/AirQuality";
import HeatIndex from "../components/HeatIndex";
import CityComparison from "../components/CityComparison";
import CSVExport from "../components/CSVExport";
import ClimateReportPDF from "../components/ClimateReportPDF";

interface CitySearchResult {
  city: string;
  temperature: number;
  humidity: number;
  wind_speed: number;
  is_anomaly: boolean;
  z_score: number;
  severity: string;
}

export default function CitiesView() {
  const { t, city, setCity, convertTemp, tempUnit } = useAppState();
  const { cities, loadingCities } = useData();

  const [searchCity, setSearchCity] = useState(city);
  const [searchResult, setSearchResult] = useState<CitySearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const requestId = useRef(0);

  const runSearch = useCallback(async (name: string) => {
    if (!name.trim()) return;
    const id = ++requestId.current;
    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`
      );
      const geoData = await geoRes.json();
      if (id !== requestId.current) return;
      if (!geoData || geoData.length === 0) {
        setSearchError("❌ City not found! Please try again.");
        return;
      }
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      const [tempData, anomalyData] = await Promise.all([
        apiGet(`/api/temperature?lat=${lat}&lon=${lon}`),
        apiGet(`/api/anomalies?lat=${lat}&lon=${lon}`),
      ]);
      if (id !== requestId.current) return;
      setSearchResult({
        city: geoData[0].display_name.split(",")[0],
        temperature: tempData.current_temperature,
        humidity: tempData.current_humidity,
        wind_speed: tempData.current_wind_speed,
        is_anomaly: anomalyData.anomaly_result?.is_anomaly,
        z_score: anomalyData.anomaly_result?.z_score,
        severity: anomalyData.anomaly_result?.severity,
      });
    } catch {
      if (id === requestId.current) setSearchError("❌ Something went wrong! Please try again.");
    } finally {
      if (id === requestId.current) setSearchLoading(false);
    }
  }, []);

  // Search whenever the URL-synced city changes (top-bar search, shared link, back/forward).
  useEffect(() => {
    setSearchCity(city);
    if (city) runSearch(city);
  }, [city, runSearch]);

  const submit = () => {
    const name = searchCity.trim();
    if (!name) return;
    if (name === city) runSearch(name);
    else setCity(name);
  };

  return (
    <ViewContainer>
      {/* Search Box */}
      <div className="bg-gray-900 border border-green-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4">🔍 {t.searchTitle}</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t.searchPlaceholder}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
          />
          <button
            onClick={submit}
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

      {/* Global Cities */}
      {loadingCities ? <Skeleton className="h-64 mb-8" /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">🌐 {t.globalCities}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {cities.map((c: any) => (
              <div key={c.city} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="text-white font-bold">{c.city}</p>
                  <p className="text-gray-500 text-xs">💧 {c.humidity}% | 💨 {c.wind_speed} km/h</p>
                </div>
                <p className={`text-2xl font-bold ${getTempColor(c.temperature)}`}>
                  {convertTemp(c.temperature)}{tempUnit}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research Features */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-green-400 mb-6">City Tools</h2>
        <AirQuality lat={28.61} lon={77.21} cityName="Delhi" />
        <HeatIndex lat={28.61} lon={77.21} city="Delhi" />
        <CityComparison />
        <CSVExport />
        <ClimateReportPDF />
      </div>
    </ViewContainer>
  );
}
