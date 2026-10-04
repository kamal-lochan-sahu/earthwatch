"use client";
import ViewContainer from "../components/ViewContainer";
import Skeleton from "../components/Skeleton";
import { useAppState } from "../context/AppState";
import { useData } from "../context/DataContext";
import ClimateIndex from "../components/ClimateIndex";
import ArcticIce from "../components/ArcticIce";
import SeasonalChart from "../components/SeasonalChart";
import CorrelationMatrix from "../components/CorrelationMatrix";
import ForecastChart from "../components/ForecastChart";
import TippingPoints from "../components/TippingPoints";
import YearComparison from "../components/YearComparison";
import AnomalyCalendar from "../components/AnomalyCalendar";

export default function ClimateView() {
  const { t } = useAppState();
  const { trends, anomaly, co2, loadingCo2, loadingTrends, loadingTemp } = useData();

  return (
    <ViewContainer>
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

      {/* Research Features */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-green-400 mb-6">Research Features</h2>
        <ClimateIndex />
        <ArcticIce />
        <SeasonalChart />
        <CorrelationMatrix />
        <ForecastChart lat={28.61} lon={77.21} city="Delhi" />
        <TippingPoints />
        <YearComparison />
        <AnomalyCalendar />
      </div>
    </ViewContainer>
  );
}
