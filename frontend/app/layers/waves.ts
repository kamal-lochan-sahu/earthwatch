import { timeAgo } from "../lib/format";
import { compass } from "./wind";
import type { LayerDef, LayerItem } from "./types";

/** Marker colour by wave height (m). Same thresholds as the backend's severity (data/hazards/waves.py). */
const BANDS = [
  { min: 6, color: "#f87171", label: "6+ m" },
  { min: 4, color: "#fb923c", label: "4 – 6 m" },
  { min: 2.5, color: "#facc15", label: "2.5 – 4 m" },
  { min: -Infinity, color: "#60a5fa", label: "< 2.5 m" },
];

const colorForHeight = (m: number) => BANDS.find((b) => m >= b.min)!.color;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Marker size multiplier: bigger swell = bigger dot (0.8x for flat water up to ~2.8x for storm seas). */
export const sizeForHeight = (m: number) => clamp(0.8 + m * 0.3, 0.8, 2.8);

/** Open-ocean wave height (Open-Meteo Marine): one dot per ocean grid point, sized and coloured by height. */
export const wavesLayer: LayerDef = {
  id: "waves",
  group: "ocean",
  labelKey: "layerWaves",
  color: "#818cf8",
  endpoint: "/api/waves",
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
        !isNum(w.value)
      ) continue;
      const time = Date.parse(w.time);
      out.push({
        id: w.id,
        lat: w.lat,
        lon: w.lon,
        title: typeof w.title === "string" ? w.title : `Waves ${w.value} m`,
        color: colorForHeight(w.value),
        size: sizeForHeight(w.value),
        time: Number.isFinite(time) ? time : undefined,
        raw: w,
      });
    }
    return out;
  },

  legend: () => BANDS.map((b) => ({ color: b.color, label: b.label })),

  tooltip: (item) => {
    const w = item.raw;
    const lines = [`🌊 ${w.value} m`];
    if (isNum(w.direction)) lines.push(`From ${compass(w.direction)}`);
    if (isNum(w.period)) lines.push(`Period ${w.period} s`);
    return { title: "Ocean waves", lines };
  },

  toDetail: (item) => {
    const w = item.raw;
    const rows: { label: string; value: string }[] = [];
    if (isNum(w.direction)) rows.push({ label: "Coming from", value: `${compass(w.direction)} (${w.direction}°)` });
    if (isNum(w.period)) rows.push({ label: "Wave period", value: `${w.period} s` });
    if (item.time) {
      rows.push({ label: "Observed", value: timeAgo(item.time) });
      rows.push({ label: "Time (UTC)", value: new Date(item.time).toISOString().slice(0, 16).replace("T", " ") });
    }
    rows.push({ label: "Source", value: "Open-Meteo Marine · open-ocean grid" });
    return {
      title: `Ocean near ${Math.abs(w.lat)}°${w.lat < 0 ? "S" : "N"} ${Math.abs(w.lon)}°${w.lon < 0 ? "W" : "E"}`,
      subtitle: "Significant wave height",
      headline: `${w.value} m`,
      headlineColor: item.color,
      rows,
      link: typeof w.url === "string" ? { label: "View on Open-Meteo", href: w.url } : undefined,
    };
  },

  globe: { radius: 0.55, altitude: 0.01, labels: false },
};
