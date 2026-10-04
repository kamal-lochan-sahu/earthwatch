"use client";
import dynamic from "next/dynamic";
import ViewContainer from "../components/ViewContainer";
import Skeleton from "../components/Skeleton";
import { useAppState } from "../context/AppState";
import { useData } from "../context/DataContext";

const GlobeView = dynamic(() => import("../components/GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 h-64 flex items-center justify-center">
      <p className="text-gray-400">🌍 Loading Globe...</p>
    </div>
  ),
});

export default function MissionView() {
  const { t, convertTemp, tempUnit } = useAppState();
  const {
    temperature, anomaly, trends, co2, cities,
    loadingTemp, loadingTrends, loadingCo2, loadingCities,
  } = useData();

  return (
    <ViewContainer>
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-green-400 mb-3">🌍 {t.title}</h1>
        <p className="text-gray-400 text-lg">{t.subtitle}</p>
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

      {/* Globe */}
      {!loadingCities && cities.length > 0 && <GlobeView cities={cities} />}
    </ViewContainer>
  );
}
