"use client";
import { useEffect, useState } from "react";

export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  // phase 0 = globe spin
  // phase 1 = text appear
  // phase 2 = subtitle appear
  // phase 3 = fade out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1800);
    const t3 = setTimeout(() => setPhase(3), 2800);
    const t4 = setTimeout(() => onComplete(), 3600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 transition-opacity duration-700 ${
        phase === 3 ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Glowing background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500 opacity-5 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Globe */}
      <div
        className={`text-8xl mb-6 transition-all duration-700 ${
          phase >= 0 ? "opacity-100 scale-100" : "opacity-0 scale-50"
        }`}
        style={{ animation: "spin 3s linear infinite" }}
      >
        🌍
      </div>

      {/* Title */}
      <div
        className={`transition-all duration-700 ${
          phase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h1 className="text-6xl font-bold text-green-400 tracking-wider">
          EarthWatch
        </h1>
      </div>

      {/* Subtitle */}
      <div
        className={`mt-4 transition-all duration-700 ${
          phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <p className="text-gray-400 text-lg tracking-widest uppercase">
          Real-Time Climate Intelligence
        </p>
      </div>

      {/* Loading bar */}
      <div
        className={`mt-12 w-64 h-0.5 bg-gray-800 rounded-full overflow-hidden transition-all duration-700 ${
          phase >= 2 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full bg-green-400 rounded-full transition-all duration-1000"
          style={{ width: phase >= 2 ? "100%" : "0%" }}
        />
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}