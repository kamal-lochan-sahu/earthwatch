import { timeAgo } from "../lib/format";
import type { ArrowSpec, LayerDef, LayerItem } from "./types";

/** Arrow colour by speed (km/h). Same thresholds as the backend's severity (data/hazards/wind.py). */
const BANDS = [
  { min: 75, color: "#f87171", label: "75+ km/h" },
  { min: 50, color: "#fb923c", label: "50 – 75 km/h" },
  { min: 30, color: "#facc15", label: "30 – 50 km/h" },
  { min: -Infinity, color: "#67e8f9", label: "< 30 km/h" },
];

const colorForSpeed = (kmh: number) => BANDS.find((b) => kmh >= b.min)!.color;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** Arrow length grows with speed: ~4° for a calm cell, up to ~10° (the grid is 15° apart). */
export const arrowLength = (kmh: number) => clamp(4 + kmh * 0.11, 4, 10);

/** Global wind (Open-Meteo, 15° grid): an arrow per grid point, pointing where the wind blows. */
export const windLayer: LayerDef = {
  id: "wind",
  group: "weather",
  labelKey: "layerWind",
  color: "#67e8f9",
  endpoint: "/api/wind",
  refreshSec: 3 * 3600,
  defaultOn: false,

  parse(json): LayerItem[] {
    const rows: any[] = Array.isArray(json?.items) ? json.items : [];
    const out: LayerItem[] = [];
    for (const w of rows) {
      if (
        typeof w?.id !== "string" ||
        !isNum(w.lat) || w.lat < -90 || w.lat > 90 ||
        !isNum(w.lon) || w.lon < -180 || w.lon > 180 ||
        !isNum(w.value) ||
        !isNum(w.bearing)
      ) continue;
      const time = Date.parse(w.time);
      out.push({
        id: w.id,
        lat: w.lat,
        lon: w.lon,
        title: typeof w.title === "string" ? w.title : `Wind ${w.value} km/h`,
        color: colorForSpeed(w.value),
        time: Number.isFinite(time) ? time : undefined,
        raw: w,
      });
    }
    return out;
  },

  arrow: (item): ArrowSpec | null => ({
    bearing: item.raw.bearing,
    lengthDeg: arrowLength(item.raw.value),
    color: item.color,
  }),

  legend: () => BANDS.map((b) => ({ color: b.color, label: b.label })),

  tooltip: (item) => {
    const w = item.raw;
    const lines = [`💨 ${w.value} km/h · from ${compass(w.direction)}`];
    if (isNum(w.gusts)) lines.push(`Gusts ${w.gusts} km/h`);
    return { title: "Wind", lines };
  },

  toDetail: (item) => {
    const w = item.raw;
    const rows = [
      { label: "Direction", value: `from ${compass(w.direction)} (${w.direction}°)` },
      { label: "Blowing towards", value: `${compass(w.bearing)} (${w.bearing}°)` },
    ];
    if (isNum(w.gusts)) rows.push({ label: "Gusts", value: `${w.gusts} km/h` });
    if (item.time) {
      rows.push({ label: "Observed", value: timeAgo(item.time) });
      rows.push({ label: "Time (UTC)", value: new Date(item.time).toISOString().slice(0, 16).replace("T", " ") });
    }
    rows.push({ label: "Source", value: "Open-Meteo · 15° global grid" });
    return {
      title: `Wind near ${Math.abs(w.lat)}°${w.lat < 0 ? "S" : "N"} ${Math.abs(w.lon)}°${w.lon < 0 ? "W" : "E"}`,
      subtitle: "Wind at 10 m",
      headline: `${w.value} km/h`,
      headlineColor: item.color,
      rows,
      link: typeof w.url === "string" ? { label: "View on Open-Meteo", href: w.url } : undefined,
    };
  },

  // Small markers: they carry the hover/click; the arrows carry the picture.
  globe: { radius: 0.28, altitude: 0.012, labels: false },
};
