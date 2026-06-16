"use client";
import { useState } from "react";

const API = "https://earthwatch.onrender.com";

export default function CSVExport() {
  const [lat, setLat] = useState("28.61");
  const [lon, setLon] = useState("77.21");
  const [years, setYears] = useState("2");
  const [loading, setLoading] = useState(false);
  const [cityName, setCityName] = useState("Delhi");

  const searchAndExport = async () => {
    setLoading(true);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`
      );
      const geo = await geoRes.json();
      const useLat = geo[0] ? geo[0].lat : lat;
      const useLon = geo[0] ? geo[0].lon : lon;

      const res = await fetch(`${API}/api/export/csv?lat=${useLat}&lon=${useLon}&years=${years}`);
      const data = await res.json();
      const records = data.data || [];
      if (!records.length) { alert("No data found!"); return; }

      const header = "Date,Avg Temp (C),Max Temp (C),Min Temp (C)";
      const rows = records.map((r: any) =>
        `${r.date},${r.avg_temp},${r.max_temp},${r.min_temp}`
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `earthwatch_${cityName}_${years}yr.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed! Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-green-900 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">📥 CSV Data Export</h2>
      <p className="text-gray-500 text-xs mb-4">Download historical temperature data for any city</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-40">
          <label className="text-gray-400 text-xs mb-1 block">City Name</label>
          <input
            type="text"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchAndExport()}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
            placeholder="e.g. Mumbai"
          />
        </div>
        <div className="w-28">
          <label className="text-gray-400 text-xs mb-1 block">Years</label>
          <select
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="1">1 Year</option>
            <option value="2">2 Years</option>
            <option value="5">5 Years</option>
          </select>
        </div>
        <button
          onClick={searchAndExport}
          disabled={loading}
          className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? "Fetching..." : "Download CSV"}
        </button>
      </div>
      <p className="text-gray-600 text-xs mt-3">Source: NASA POWER API — Daily climate reanalysis data</p>
    </div>
  );
}
