"use client";
import { useState } from "react";
const API = "https://earthwatch.onrender.com";
export default function CityComparison() {
  const [city1, setCity1] = useState("Delhi");
  const [city2, setCity2] = useState("Mumbai");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const compare = async () => {
    if (!city1.trim() || !city2.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const [g1, g2] = await Promise.all([
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city1)}&format=json&limit=1`).then(r => r.json()),
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city2)}&format=json&limit=1`).then(r => r.json()),
      ]);
      if (!g1[0] || !g2[0]) { setError("City not found!"); return; }
      const url = `${API}/api/compare-cities?lat1=${g1[0].lat}&lon1=${g1[0].lon}&lat2=${g2[0].lat}&lon2=${g2[0].lon}&city1=${encodeURIComponent(city1)}&city2=${encodeURIComponent(city2)}`;
      const res = await fetch(url);
      setData(await res.json());
    } catch { setError("Comparison failed!"); }
    finally { setLoading(false); }
  };
  const StatBox = ({ label, v1, v2, unit="" }: any) => (
    <div className="grid grid-cols-3 gap-2 items-center bg-gray-800 rounded-lg p-3">
      <p className="text-white font-bold text-right">{v1 ?? "--"}{unit}</p>
      <p className="text-gray-500 text-xs text-center">{label}</p>
      <p className="text-white font-bold">{v2 ?? "--"}{unit}</p>
    </div>
  );
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Compare Two Cities</h2>
      <p className="text-gray-500 text-xs mb-4">Side by side climate comparison</p>
      <div className="flex gap-3 mb-4 flex-wrap">
        <input value={city1} onChange={e => setCity1(e.target.value)} onKeyDown={e => e.key==="Enter" && compare()} placeholder="City 1 (e.g. Delhi)" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
        <input value={city2} onChange={e => setCity2(e.target.value)} onKeyDown={e => e.key==="Enter" && compare()} placeholder="City 2 (e.g. Mumbai)" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
        <button onClick={compare} disabled={loading} className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white font-bold px-5 py-2 rounded-lg text-sm">{loading ? "Comparing..." : "Compare"}</button>
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {data && !data.error && (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <p className="text-green-400 font-bold text-center">{data.city1?.name}</p>
            <p className="text-gray-500 text-xs text-center">vs</p>
            <p className="text-blue-400 font-bold text-center">{data.city2?.name}</p>
          </div>
          <div className="flex flex-col gap-2">
            <StatBox label="Temperature" v1={data.city1?.temperature} v2={data.city2?.temperature} unit="°C" />
            <StatBox label="Humidity" v1={data.city1?.humidity} v2={data.city2?.humidity} unit="%" />
            <StatBox label="Wind Speed" v1={data.city1?.wind_speed} v2={data.city2?.wind_speed} unit=" km/h" />
            <StatBox label="UV Index" v1={data.city1?.uv_index} v2={data.city2?.uv_index} />
          </div>
          <div className="mt-3 bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-yellow-400 text-sm font-bold">{data.comparison?.hotter_city} is hotter by {data.comparison?.temp_difference}°C</p>
          </div>
        </div>
      )}
    </div>
  );
}
