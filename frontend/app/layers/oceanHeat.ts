import type { LayerDef, LayerItem, TintSpec } from "./types";

/**
 * Ocean heat from /api/ocean-heat (NOAA Coral Reef Watch): two colour washes sharing one download.
 *  - anomaly:   2° grid, tenths of °C vs NOAA's daily climatology, null on land / ice
 *  - bleaching: 1° grid, one character per cell: Bleaching Alert Area 0-4, "." on land / ice
 * Rows run south -> north, columns west -> east from lon0 (cell centres).
 */
interface GridGeom {
  lat0: number;
  lon0: number;
  step: number;
  rows: number;
  cols: number;
}
interface AnomalyGrid extends GridGeom {
  scale: number;
  values: (number | null)[][];
}
interface BleachingGrid extends GridGeom {
  values: string[];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function geomOk(g: any): boolean {
  return (
    !!g && finite(g.lat0) && finite(g.lon0) && finite(g.step) && g.step > 0 &&
    Number.isInteger(g.rows) && Number.isInteger(g.cols) && g.rows >= 2 && g.cols >= 2 &&
    Array.isArray(g.values) && g.values.length === g.rows
  );
}

/** Shape check the backend promises; a malformed payload paints nothing instead of throwing. */
export function readAnomaly(data: any): AnomalyGrid | null {
  const g = data?.anomaly;
  if (!geomOk(g) || !finite(g.scale) || g.scale <= 0) return null;
  if (g.values.some((r: unknown) => !Array.isArray(r) || r.length !== g.cols)) return null;
  return g as AnomalyGrid;
}

export function readBleaching(data: any): BleachingGrid | null {
  const g = data?.bleaching;
  if (!geomOk(g)) return null;
  if (g.values.some((r: unknown) => typeof r !== "string" || r.length !== g.cols)) return null;
  return g as BleachingGrid;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bilinear corners around a place: rows clamp at the ends, longitude wraps around the globe. */
function corners(g: GridGeom, lat: number, lon: number) {
  const fr = Math.max(0, Math.min(g.rows - 1, (lat - g.lat0) / g.step));
  const span = g.cols * g.step;
  const fc = ((((lon - g.lon0) % span) + span) % span) / g.step;
  const r0 = Math.min(Math.floor(fr), g.rows - 2);
  const c0 = Math.floor(fc) % g.cols;
  return { r0, c0, c1: (c0 + 1) % g.cols, tr: fr - r0, tc: fc - Math.floor(fc) };
}

/**
 * Anomaly in °C at a place, averaged over the valid corners; `coverage` (0..1) is the weight those corners
 * carry, so it fades out towards land and sea ice instead of smearing the colour over them.
 */
export function anomalyAt(g: AnomalyGrid, lat: number, lon: number): { value: number; coverage: number } | null {
  const { r0, c0, c1, tr, tc } = corners(g, lat, lon);
  const v = g.values;
  let sw = 0;
  let sv = 0;
  const add = (r: number, c: number, w: number) => {
    const x = v[r][c];
    if (finite(x) && w > 0) {
      sw += w;
      sv += x * w;
    }
  };
  add(r0, c0, (1 - tr) * (1 - tc));
  add(r0, c1, (1 - tr) * tc);
  add(r0 + 1, c0, tr * (1 - tc));
  add(r0 + 1, c1, tr * tc);
  return sw > 0 ? { value: sv / sw / g.scale, coverage: sw } : null;
}

/** Share of the surrounding cells at each alert level 0..4 (land and no-data count for none). Fills `out`. */
export function levelWeights(g: BleachingGrid, lat: number, lon: number, out: number[]): void {
  const { r0, c0, c1, tr, tc } = corners(g, lat, lon);
  out.fill(0);
  const add = (r: number, c: number, w: number) => {
    const level = g.values[r].charCodeAt(c) - 48; // "0".."4"; "." is -2
    if (level >= 0 && level <= 4) out[level] += w;
  };
  add(r0, c0, (1 - tr) * (1 - tc));
  add(r0, c1, (1 - tr) * tc);
  add(r0 + 1, c0, tr * (1 - tc));
  add(r0 + 1, c1, tr * tc);
}

// ---- sea-surface temperature anomaly -------------------------------------------------------------------

const WARM: [number, number, number] = [249, 115, 22];
const COOL: [number, number, number] = [56, 189, 248];
const ANOMALY_OPACITY = 0.6;

/** Warm / cool wash: invisible within ±0.2 °C of normal, full strength from ±2 °C (most of the ocean sits within ±1). */
export const anomalyOpacity = (celsius: number) => ANOMALY_OPACITY * smooth(0.2, 2.0, celsius);
const edgeFade = (coverage: number) => smooth(0.35, 0.75, coverage);

export function sstTints(_now: number, data: any): TintSpec[] | null {
  const g = readAnomaly(data);
  if (!g) return null;
  const at = (lat: number, lon: number, sign: 1 | -1) => {
    const s = anomalyAt(g, lat, lon);
    return s ? anomalyOpacity(s.value * sign) * edgeFade(s.coverage) : 0;
  };
  return [
    { key: "sst:cool", rgb: COOL, alphaAt: (lat, lon) => at(lat, lon, -1) },
    { key: "sst:warm", rgb: WARM, alphaAt: (lat, lon) => at(lat, lon, 1) },
  ];
}

// ---- coral bleaching heat stress -----------------------------------------------------------------------

/** NOAA's Bleaching Alert Area levels, drawn mildest first so the worst sits on top. */
const LEVELS: { level: number; key: string; rgb: [number, number, number]; opacity: number; label: string }[] = [
  { level: 1, key: "watch", rgb: [250, 204, 21], opacity: 0.4, label: "Bleaching watch" },
  { level: 2, key: "warning", rgb: [251, 146, 60], opacity: 0.55, label: "Bleaching warning" },
  { level: 3, key: "alert1", rgb: [239, 68, 68], opacity: 0.65, label: "Alert level 1" },
  { level: 4, key: "alert2", rgb: [190, 18, 60], opacity: 0.75, label: "Alert level 2" },
];

export function coralTints(_now: number, data: any): TintSpec[] | null {
  const g = readBleaching(data);
  if (!g) return null;
  const memo = { lat: NaN, lon: NaN, w: [0, 0, 0, 0, 0] }; // the four levels of one pixel share one lookup
  return LEVELS.map((l) => ({
    key: `coral:${l.key}`,
    rgb: l.rgb,
    alphaAt: (lat: number, lon: number) => {
      if (lat !== memo.lat || lon !== memo.lon) {
        levelWeights(g, lat, lon, memo.w);
        memo.lat = lat;
        memo.lon = lon;
      }
      return l.opacity * smooth(0.35, 0.75, memo.w[l.level]);
    },
  }));
}

// ---- the two layers ------------------------------------------------------------------------------------

const unused = {
  tooltip: (item: LayerItem) => ({ title: item.title, lines: [] as string[] }),
  toDetail: (item: LayerItem) => ({ title: item.title, rows: [] }),
  globe: { radius: 0, altitude: 0, labels: false },
};

/** Sea-surface temperature against normal: warm colours where the ocean is hotter than usual, blue where cooler. */
export const sstLayer: LayerDef = {
  id: "sst",
  group: "ocean",
  labelKey: "layerSst",
  color: "#f97316",
  endpoint: "/api/ocean-heat",
  refreshSec: 3 * 3600, // NOAA publishes one day at a time
  defaultOn: false,

  parse: (): LayerItem[] => [],
  tint: sstTints,
  counter: (json) =>
    finite(json?.counts?.mean_anomaly_c) ? { labelKey: "counterSst", value: json.counts.mean_anomaly_c } : null,
  legend: () => [
    { color: "#f97316", label: "Warmer than usual" },
    { color: "#38bdf8", label: "Cooler than usual" },
  ],
  ...unused,
};

/** Coral bleaching heat stress (NOAA Bleaching Alert Area, 7-day maximum): where the sea is hot enough to stress reefs. */
export const coralLayer: LayerDef = {
  id: "coral",
  group: "ocean",
  labelKey: "layerCoral",
  color: "#fb923c",
  endpoint: "/api/ocean-heat",
  refreshSec: 3 * 3600,
  defaultOn: false,

  parse: (): LayerItem[] => [],
  tint: coralTints,
  counter: (json) =>
    finite(json?.counts?.stressed_tropics_pct)
      ? { labelKey: "counterCoral", value: json.counts.stressed_tropics_pct }
      : null,
  legend: () => LEVELS.map((l) => ({ color: `rgb(${l.rgb.join(",")})`, label: l.label })),
  ...unused,
};
