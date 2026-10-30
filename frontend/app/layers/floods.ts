import { timeAgo } from "../lib/format";
import type { LayerDef, LayerItem } from "./types";

/**
 * River flood watch (Open-Meteo Flood / GloFAS). Colour = how high the river is forecast to get in the
 * next 7 days compared with its last-30-day median; size = how big the river is. Same thresholds as the
 * backend's severity (data/hazards/floods.py). It is a "rising water" signal, not an official flood warning.
 */
const BANDS = [
  { min: 4, color: "#f87171", label: "≥ 4× recent normal" },
  { min: 2.5, color: "#fb923c", label: "2.5 – 4×" },
  { min: 1.6, color: "#facc15", label: "1.6 – 2.5×" },
  { min: -Infinity, color: "#2dd4bf", label: "Normal (< 1.6×)" },
];

const colorForRatio = (r: number) => BANDS.find((b) => r >= b.min)!.color;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const flow = (q: number) => `${Math.round(q).toLocaleString("en-US")} m³/s`;

/** Bigger river = bigger marker (log scale: ~100 m³/s small, 200,000 m³/s the Amazon). */
export const sizeForDischarge = (q: number) => clamp(0.7 + (Math.log10(Math.max(q, 10)) - 2) * 0.6, 0.7, 2.7);

const TREND_ICON: Record<string, string> = { rising: "↗ rising", falling: "↘ falling", steady: "→ steady" };

export const floodsLayer: LayerDef = {
  id: "floods",
  group: "hazards",
  labelKey: "layerFloods",
  color: "#2dd4bf",
  endpoint: "/api/floods",
  refreshSec: 6 * 3600,
  defaultOn: false,

  parse(json): LayerItem[] {
    const rows: any[] = Array.isArray(json?.items) ? json.items : [];
    const out: LayerItem[] = [];
    for (const r of rows) {
      if (
        typeof r?.id !== "string" ||
        !isNum(r.lat) || r.lat < -90 || r.lat > 90 ||
        !isNum(r.lon) || r.lon < -180 || r.lon > 180 ||
        !isNum(r.value) || !isNum(r.ratio)
      ) continue;
      const time = Date.parse(r.time);
      out.push({
        id: r.id,
        lat: r.lat,
        lon: r.lon,
        title: typeof r.title === "string" ? r.title : `${r.river} at ${r.name}`,
        color: colorForRatio(r.ratio),
        size: sizeForDischarge(r.value),
        time: Number.isFinite(time) ? time : undefined,
        raw: r,
      });
    }
    return out;
  },

  counter: (json) =>
    isNum(json?.counts?.elevated) ? { labelKey: "counterFloods", value: json.counts.elevated } : null,

  legend: () => BANDS.map((b) => ({ color: b.color, label: b.label })),

  tooltip: (item) => {
    const r = item.raw;
    return {
      title: `${r.river} · ${r.name}`,
      lines: [`🌊 ${flow(r.value)}`, `${r.ratio}× recent normal at peak · ${TREND_ICON[r.trend] ?? ""}`.trim()],
    };
  },

  toDetail: (item) => {
    const r = item.raw;
    const rows = [
      { label: "Discharge today", value: flow(r.value) },
      { label: "7-day peak", value: `${flow(r.peak)} · ${r.peak_date}` },
      { label: "Recent normal (30-day median)", value: flow(r.baseline) },
      { label: "Peak vs normal", value: `${r.ratio}×` },
      { label: "Trend", value: TREND_ICON[r.trend] ?? "—" },
    ];
    if (item.time) rows.push({ label: "Data from", value: timeAgo(item.time) });
    if (r.regulated)
      rows.push({ label: "Note", value: "Heavily dammed river: the model ignores dam releases, so real flow can differ" });
    rows.push({ label: "Source", value: "Open-Meteo Flood API (GloFAS) · daily model data" });
    return {
      title: `${r.river} at ${r.name}`,
      subtitle: "River discharge · rising-water watch, not an official flood warning",
      headline: `${r.ratio}× normal`,
      headlineColor: item.color,
      rows,
      link: typeof r.url === "string" ? { label: "About the Flood API", href: r.url } : undefined,
    };
  },

  globe: { radius: 0.5, altitude: 0.01, labels: false },
};
