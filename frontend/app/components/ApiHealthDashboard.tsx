"use client";
import { useEffect, useState } from "react";
const API = "https://earthwatch.onrender.com";
const EXTERNAL = ["/api/arctic-ice", "/api/temperature/global"];
export default function ApiHealthDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState("");
  const check = () => {
    setLoading(true);
    fetch(`${API}/api/health-dashboard`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setLastChecked(new Date().toLocaleTimeString()); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { check(); }, []);
  if (loading && !data) return <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse h-48" />;
  if (!data) return null;
  const summary = data.summary || {};
  const endpoints = (data.endpoints || []).map((ep: any) => ({
    ...ep,
    isExternal: EXTERNAL.includes(ep.path),
    displayStatus: EXTERNAL.includes(ep.path) && ep.status !== "up" ? "external" : ep.status
  }));
  const upCount = endpoints.filter((e: any) => e.status === "up").length;
  return (
    <div className="bg-gray-900 border border-green-900 rounded-xl p-6 mb-8">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">API Health Dashboard</h2>
          <p className="text-gray-500 text-xs">All EarthWatch endpoints | Last: {lastChecked}</p>
        </div>
        <button onClick={check} className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg border border-gray-700">Refresh</button>
      </div>
      <div className="flex gap-4 mb-4">
        <div className="bg-green-900 rounded-lg px-4 py-2 text-center"><p className="text-green-400 text-2xl font-bold">{upCount}</p><p className="text-green-300 text-xs">Up</p></div>
        <div className="bg-yellow-900 rounded-lg px-4 py-2 text-center"><p className="text-yellow-400 text-2xl font-bold">{EXTERNAL.length}</p><p className="text-yellow-300 text-xs">External</p></div>
        <div className="bg-gray-800 rounded-lg px-4 py-2 text-center"><p className="text-white text-2xl font-bold">{summary.total}</p><p className="text-gray-400 text-xs">Total</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {endpoints.map((ep: any, i: number) => (
          <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ep.status === "up" ? "bg-green-400" : ep.isExternal ? "bg-yellow-400" : "bg-red-400"}`} />
              <p className="text-white text-xs font-mono truncate">{ep.path}</p>
              {ep.isExternal && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-300 flex-shrink-0">ext</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {ep.response_ms > 0 && <p className="text-gray-500 text-xs">{ep.response_ms}ms</p>}
              <span className={`text-xs px-2 py-0.5 rounded-full ${ep.status === "up" ? "bg-green-900 text-green-300" : ep.isExternal ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"}`}>
                {ep.displayStatus}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
