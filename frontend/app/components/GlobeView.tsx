"use client";
import { useEffect, useRef } from "react";

interface City {
  city: string;
  latitude: number;
  longitude: number;
  temperature: number;
  humidity: number;
}

interface GlobeViewProps {
  cities: City[];
}

export default function GlobeView({ cities }: GlobeViewProps) {
  const globeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!globeRef.current || cities.length === 0) return;

    let globe: any;

    const initGlobe = async () => {
      const Globe = (await import("globe.gl")).default;

      globe = Globe()(globeRef.current!)
        .width(globeRef.current!.offsetWidth)
        .height(500)
        .backgroundColor("#0a0a0f")
        .globeImageUrl(
          "//unpkg.com/three-globe/example/img/earth-night.jpg"
        )
        .pointsData(cities)
        .pointLat("latitude")
        .pointLng("longitude")
        .pointColor((d: any) => {
          if (d.temperature >= 30) return "#f87171";
          if (d.temperature >= 20) return "#fb923c";
          if (d.temperature >= 10) return "#facc15";
          return "#60a5fa";
        })
        .pointAltitude(0.05)
        .pointRadius(0.6)
        .pointLabel((d: any) =>
          `<div style="background:#1f2937;padding:8px;border-radius:8px;color:white;font-size:13px">
            <b>${d.city}</b><br/>
            🌡️ ${d.temperature}°C<br/>
            💧 ${d.humidity}%
          </div>`
        )
        .labelsData(cities)
        .labelLat("latitude")
        .labelLng("longitude")
        .labelText("city")
        .labelSize(1.2)
        .labelColor(() => "white")
        .labelDotRadius(0.3);

      // Auto rotate
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.8;
    };

    initGlobe();

    return () => {
      if (globe) globe._destructor?.();
    };
  }, [cities]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-4">
        🌍 Live Global Temperature Globe
      </h2>
      <div ref={globeRef} style={{ width: "100%", height: "500px" }} />
      <div className="flex gap-6 mt-4 justify-center text-sm">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> 30°C+
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> 20-30°C
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> 10-20°C
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> 10°C
        </span>
      </div>
    </div>
  );
}