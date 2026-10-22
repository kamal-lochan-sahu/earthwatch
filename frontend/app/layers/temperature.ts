import type { LayerDef, LayerItem, UnitCtx } from "./types";

const BANDS = [
  { min: 30, color: "#f87171" },
  { min: 20, color: "#fb923c" },
  { min: 10, color: "#facc15" },
  { min: -Infinity, color: "#60a5fa" },
];

function bandColor(c: number): string {
  return BANDS.find((b) => c >= b.min)!.color;
}

const fmt = (c: number, u: UnitCtx) => `${u.convertTemp(c)}${u.tempUnit}`;

/** Live temperature of ~60 cities across every continent (labels on the ~15 biggest). */
export const temperatureLayer: LayerDef = {
  id: "temperature",
  group: "weather",
  labelKey: "layerTemperature",
  color: "#fb923c",
  endpoint: "/api/temperature/global",
  refreshSec: 900,
  defaultOn: true,

  parse(json): LayerItem[] {
    const cities: any[] = Array.isArray(json?.cities) ? json.cities : [];
    return cities
      .filter(
        (c) =>
          typeof c?.city === "string" &&
          Number.isFinite(c.latitude) &&
          Number.isFinite(c.longitude) &&
          Number.isFinite(c.temperature)
      )
      .map((c) => ({
        id: c.city,
        lat: c.latitude,
        lon: c.longitude,
        title: c.city,
        color: bandColor(c.temperature),
        label: c.major !== false, // label only the big cities; an older backend without the flag labels all
        raw: c,
      }));
  },

  legend: (u) => [
    { color: BANDS[0].color, label: `${fmt(30, u)}+` },
    { color: BANDS[1].color, label: `${fmt(20, u)} – ${fmt(30, u)}` },
    { color: BANDS[2].color, label: `${fmt(10, u)} – ${fmt(20, u)}` },
    { color: BANDS[3].color, label: `< ${fmt(10, u)}` },
  ],

  tooltip: (item, u) => ({
    title: item.title,
    lines: [`🌡️ ${fmt(item.raw.temperature, u)}`, `💧 ${item.raw.humidity}%`],
  }),

  toDetail: (item, u) => {
    const r = item.raw;
    const rows = [{ label: "Humidity", value: `${r.humidity}%` }];
    if (Number.isFinite(r.wind_speed)) rows.push({ label: "Wind", value: `${r.wind_speed} km/h` });
    if (r.timestamp) rows.push({ label: "Observed (UTC)", value: String(r.timestamp).replace("T", " ") });
    if (r.source) rows.push({ label: "Source", value: r.source === "met.no" ? "MET Norway" : "Open-Meteo" });
    return {
      title: item.title,
      subtitle: "Live temperature",
      headline: fmt(r.temperature, u),
      headlineColor: item.color,
      rows,
      action: { label: "Open full analysis", city: item.title },
    };
  },

  globe: { radius: 0.6, altitude: 0.05, labels: true },
};
