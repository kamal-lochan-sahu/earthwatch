import type { LayerDef, LayerItem, TintSpec } from "./types";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const wrap360 = (d: number) => ((d % 360) + 360) % 360;

/** Where the Sun is straight overhead: latitude = solar declination, longitude from sidereal time. */
export function subsolarPoint(ms: number): { lat: number; lon: number } {
  const n = ms / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const L = wrap360(280.46 + 0.9856474 * n); // mean longitude
  const g = rad(wrap360(357.528 + 0.9856003 * n)); // mean anomaly
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)); // ecliptic longitude
  const eps = rad(23.439 - 0.0000004 * n); // obliquity
  const lat = deg(Math.asin(Math.sin(eps) * Math.sin(lambda)));
  const ra = deg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)));
  const gmst = wrap360(280.46061837 + 360.98564736629 * n);
  const lon = ((wrap360(ra - gmst) + 540) % 360) - 180;
  return { lat, lon };
}

/** Sun altitude (degrees above the horizon) at a place, for a Sun over `sun`. */
export function sunAltitude(lat: number, lon: number, sun: { lat: number; lon: number }): number {
  const p = rad(lat);
  const d = rad(sun.lat);
  const s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(rad(lon - sun.lon));
  return deg(Math.asin(Math.max(-1, Math.min(1, s))));
}

const DAY_OPACITY = 0.13;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Warm wash that fades in through twilight (Sun -18° .. 0°) and is steady in full daylight. */
export function dayOpacity(altDeg: number): number {
  const t = Math.max(0, Math.min(1, (altDeg + 18) / 18));
  return DAY_OPACITY * smooth(t);
}

export function terminatorTint(now: number): TintSpec {
  const sun = subsolarPoint(now);
  return { key: "terminator", rgb: [253, 224, 71], alphaAt: (lat, lon) => dayOpacity(sunAltitude(lat, lon, sun)) };
}

/** Day/night terminator: computed on the device from the clock, nothing to fetch. */
export const terminatorLayer: LayerDef = {
  id: "terminator",
  group: "space",
  labelKey: "layerTerminator",
  color: "#fde047",
  endpoint: "",
  refreshSec: 60,
  defaultOn: false,

  parse: (): LayerItem[] => [],
  tint: terminatorTint,

  legend: () => [
    { color: "#fde047", label: "Daylight" },
    { color: "#a16207", label: "Twilight (fades)" },
  ],

  // No markers, so none of these is ever called; they only satisfy the LayerDef contract.
  tooltip: (item) => ({ title: item.title, lines: [] }),
  toDetail: (item) => ({ title: item.title, rows: [] }),
  globe: { radius: 0, altitude: 0, labels: false },
};
