import type { LayerDef, LayerItem, TintSpec } from "./types";

/** Aurora grid as the backend sends it (data/hazards/aurora.py): rows south -> north, columns from lon 0 eastwards. */
interface AuroraGrid {
  lat_min: number;
  lon_min: number;
  step: number;
  rows: number;
  cols: number;
  values: number[][];
}

const GREEN: [number, number, number] = [52, 211, 153]; // the design system's aurora colour
const RED: [number, number, number] = [248, 113, 113];

/** Same shape check the backend promises; a malformed payload paints nothing instead of throwing. */
export function readGrid(data: any): AuroraGrid | null {
  const g = data?.grid;
  if (
    !g || !Array.isArray(g.values) ||
    !Number.isFinite(g.step) || g.step <= 0 ||
    !Number.isFinite(g.lat_min) || !Number.isFinite(g.lon_min) ||
    g.rows !== g.values.length || g.rows < 2 || g.cols < 2 ||
    g.values.some((r: unknown) => !Array.isArray(r) || r.length !== g.cols)
  ) return null;
  return g as AuroraGrid;
}

/** Probability (0..100) at a place, bilinear between grid cells; longitude wraps around the globe. */
export function sampleGrid(g: AuroraGrid, lat: number, lon: number): number {
  const fr = (lat - g.lat_min) / g.step;
  if (fr < 0 || fr > g.rows - 1) return 0;
  const lonSpan = g.cols * g.step;
  const fc = ((((lon - g.lon_min) % lonSpan) + lonSpan) % lonSpan) / g.step;
  const r0 = Math.min(Math.floor(fr), g.rows - 2);
  const c0 = Math.floor(fc);
  const c1 = (c0 + 1) % g.cols; // wrap 358° -> 0°
  const tr = fr - r0;
  const tc = fc - c0;
  const v = g.values;
  const top = v[r0][c0] * (1 - tc) + v[r0][c1] * tc;
  const bottom = v[r0 + 1][c0] * (1 - tc) + v[r0 + 1][c1] * tc;
  return top * (1 - tr) + bottom * tr;
}

/** A faint 1-3 % floor is model noise (it draws a ring on the equator): ignore it. */
const NOISE_FLOOR = 3;

/** Green glow that gets denser with the probability: ~10 % is a faint arc, 40 %+ a bright oval. */
export const greenOpacity = (pct: number) => 0.7 * (1 - Math.exp(-Math.max(0, pct - NOISE_FLOOR) / 20));

/** Pink-red on top of the green once a storm makes the oval intense (45 % and up). */
export const redOpacity = (pct: number) => 0.6 * Math.max(0, Math.min(1, (pct - 45) / 55));

export function auroraTints(_now: number, data: any): TintSpec[] | null {
  const g = readGrid(data);
  if (!g) return null;
  return [
    { key: "aurora:green", rgb: GREEN, alphaAt: (lat, lon) => greenOpacity(sampleGrid(g, lat, lon)) },
    { key: "aurora:red", rgb: RED, alphaAt: (lat, lon) => redOpacity(sampleGrid(g, lat, lon)) },
  ];
}

/** Aurora oval (NOAA SWPC OVATION): a colour wash from the backend's 2° probability grid; the Kp index is the ticker counter. */
export const auroraLayer: LayerDef = {
  id: "aurora",
  group: "space",
  labelKey: "layerAurora",
  color: "#34d399",
  endpoint: "/api/aurora",
  refreshSec: 300,
  defaultOn: false,

  parse: (): LayerItem[] => [],
  tint: auroraTints,

  counter(json) {
    const kp = json?.counts?.kp;
    return typeof kp === "number" && Number.isFinite(kp) ? { labelKey: "counterKp", value: kp } : null;
  },

  legend: () => [
    { color: "#34d399", label: "Aurora likely" },
    { color: "#f87171", label: "Strong storm" },
  ],

  // No markers, so none of these is ever called; they only satisfy the LayerDef contract.
  tooltip: (item) => ({ title: item.title, lines: [] }),
  toDetail: (item) => ({ title: item.title, rows: [] }),
  globe: { radius: 0, altitude: 0, labels: false },
};
