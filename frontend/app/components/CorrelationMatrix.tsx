"use client";
import { useEffect, useState } from "react";

const API = "https://earthwatch.onrender.com";

export default function CorrelationMatrix() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/correlation`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />
  );
  if (!data || data.error) return null;

  const corr = data.correlation;
  const chartData = data.data || [];

  const corrValue = corr?.co2_vs_sea_level ?? 0;
  const corrPct = Math.abs(corrValue) * 100;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">🔬 Correlation Analysis</h2>
      <p className="text-gray-500 text-xs mb-4">CO2 vs Sea Level Rise — are they connected?</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-2">CO2 vs Sea Level Correlation</p>
          <p className="text-3xl font-bold text-purple-400">{corrValue.toFixed(3)}</p>
          <p className="text-gray-500 text-xs mt-1">{corr?.interpretation}</p>
          <div className="bg-gray-700 rounded-full h-2 mt-3">
            <div
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${corrPct}%` }}
            />
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-2">What this means</p>
          <p className="text-white text-sm leading-relaxed">
            {corrValue > 0.9
              ? "As CO2 rises, sea levels rise almost perfectly in sync. Strong evidence of climate forcing."
              : corrValue > 0.7
              ? "Strong link between CO2 emissions and sea level rise over recent decades."
              : "Moderate correlation detected between CO2 and sea level changes."
            }
          </p>
        </div>
      </div>

      <div className="flex items-end gap-1 h-24 overflow-x-auto">
        {chartData.map((d: any, i: number) => (
          <div key={i} className="flex-1 min-w-1 flex flex-col justify-end" title={`CO2: ${d.co2_ppm}ppm | SL: +${d.sea_level_rise_mm}mm`}>
            <div
              className="w-full rounded-t"
              style={{
                height: `${((d.co2_ppm - 419) / 10) * 60 + 10}px`,
                backgroundColor: "#a78bfa",
                opacity: 0.7
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2 text-center">CO2: NOAA Mauna Loa | Sea Level: estimated trend (3.3mm/yr since 1993) — illustrative only</p>
    </div>
  );
}
