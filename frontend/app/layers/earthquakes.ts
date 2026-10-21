import { timeAgo } from "../lib/format";
import type { LayerDef, LayerItem, PulseSpec } from "./types";

/** Severity scale shared with the backend (backend/data/hazards/earthquakes.py). */
export const QUAKE_SEVERITY_COLOR: Record<string, string> = {
  info: "#60a5fa",
  mild: "#facc15",
  moderate: "#fb923c",
  extreme: "#f87171",
};
export const QUAKE_SEVERITY_LABEL: Record<string, string> = {
  info: "Minor",
  mild: "Light–moderate",
  moderate: "Strong",
  extreme: "Major",
};

const BASE_RADIUS = 0.5; // globe.radius; each quake scales it by `size`
const PULSE_WINDOW_MS = 3 * 60 * 60 * 1000; // quakes newer than this ripple
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Marker size multiplier: ~0.35 for M2.5 up to ~2.5 for M8. */
export function sizeForMagnitude(mag: number): number {
  const m = Math.max(mag, 2.5);
  const radiusDeg = 0.18 + 0.12 * Math.pow(m - 2.5, 1.3);
  return clamp(radiusDeg / BASE_RADIUS, 0.35, 3);
}

export const formatMag = (m: number) => `M ${m.toFixed(1)}`;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Backend envelope -> items. Malformed rows are skipped, never thrown on. */
export function parseQuakes(json: any): LayerItem[] {
  const rows: any[] = Array.isArray(json?.items) ? json.items : [];
  const out: LayerItem[] = [];
  for (const q of rows) {
    if (
      typeof q?.id !== "string" ||
      !isFiniteNumber(q.lat) || q.lat < -90 || q.lat > 90 ||
      !isFiniteNumber(q.lon) || q.lon < -180 || q.lon > 180 ||
      !isFiniteNumber(q.value)
    ) continue;
    const time = Date.parse(q.time);
    out.push({
      id: q.id,
      lat: q.lat,
      lon: q.lon,
      title: typeof q.title === "string" ? q.title : `${formatMag(q.value)}`,
      color: QUAKE_SEVERITY_COLOR[q.severity] ?? QUAKE_SEVERITY_COLOR.info,
      size: sizeForMagnitude(q.value),
      lift: clamp((q.value - 2.5) * 0.004, 0, 0.02), // low dots, so they read differently from tall city spikes
      time: Number.isFinite(time) ? time : undefined,
      raw: q,
    });
  }
  return out;
}

function depthText(km: unknown): string | null {
  return isFiniteNumber(km) ? `${Math.round(km)} km` : null;
}

/** Live earthquakes (USGS, M2.5+, last 24 hours). */
export const earthquakesLayer: LayerDef = {
  id: "earthquakes",
  group: "hazards",
  labelKey: "layerEarthquakes",
  color: "#f87171",
  endpoint: "/api/earthquakes?window=24h",
  refreshSec: 120,
  defaultOn: true,

  parse: parseQuakes,

  counter: (json) =>
    isFiniteNumber(json?.counts?.last_24h)
      ? { labelKey: "counterQuakes", value: json.counts.last_24h }
      : null,

  legend: () => [
    { color: QUAKE_SEVERITY_COLOR.extreme, label: "M7+" },
    { color: QUAKE_SEVERITY_COLOR.moderate, label: "M6 – 7" },
    { color: QUAKE_SEVERITY_COLOR.mild, label: "M4.5 – 6" },
    { color: QUAKE_SEVERITY_COLOR.info, label: "< M4.5" },
  ],

  tooltip: (item) => {
    const q = item.raw;
    const lines = [item.time ? `🕐 ${timeAgo(item.time)}` : ""];
    const depth = depthText(q.depth_km);
    if (depth) lines.push(`↧ ${depth}`);
    return { title: `${formatMag(q.value)} · ${q.place}`, lines: lines.filter(Boolean) };
  },

  toDetail: (item) => {
    const q = item.raw;
    const rows: { label: string; value: string }[] = [];
    if (item.time) {
      rows.push({ label: "When", value: timeAgo(item.time) });
      rows.push({ label: "Time (UTC)", value: new Date(item.time).toISOString().slice(0, 16).replace("T", " ") });
    }
    const depth = depthText(q.depth_km);
    if (depth) rows.push({ label: "Depth", value: depth });
    if (q.region) rows.push({ label: "Region", value: q.region });
    if (isFiniteNumber(q.felt) && q.felt > 0) rows.push({ label: "Felt reports", value: String(q.felt) });
    if (q.alert) rows.push({ label: "PAGER alert", value: String(q.alert).toUpperCase() });
    if (q.tsunami) rows.push({ label: "Tsunami flag", value: "Oceanic · see tsunami.gov" });
    return {
      title: q.place,
      subtitle: `Earthquake · ${QUAKE_SEVERITY_LABEL[q.severity] ?? "Minor"} · ${q.source ?? "USGS"}`,
      headline: formatMag(q.value),
      headlineColor: item.color,
      rows,
      link: typeof q.url === "string" ? { label: "View on USGS", href: q.url } : undefined,
    };
  },

  ticker: (item) => `${formatMag(item.raw.value)} · ${item.raw.place}`,

  pulse: (item, now): PulseSpec | null => {
    if (!item.time) return null;
    const age = now - item.time;
    if (age < -5 * 60_000 || age > PULSE_WINDOW_MS) return null;
    return {
      color: item.color,
      maxRadius: clamp(2 + (item.raw.value - 2.5) * 0.9, 2, 8),
      periodMs: 2200,
    };
  },

  globe: { radius: BASE_RADIUS, altitude: 0.01, labels: false },
};

/** Items from the last 24 hours only — what the Mission globe and ticker show. */
export const isRecent = (item: LayerItem, now: number) =>
  item.time !== undefined && now - item.time <= DAY_MS;
