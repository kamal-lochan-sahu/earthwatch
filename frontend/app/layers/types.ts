export type LayerGroup = "weather" | "hazards" | "ocean" | "space" | "climate";

export interface UnitCtx {
  convertTemp: (celsius: number) => number;
  tempUnit: string;
}

/** One thing on the map (a city, an earthquake, a fire...). Layer-agnostic. */
export interface LayerItem {
  id: string;
  lat: number;
  lon: number;
  title: string;
  color: string;
  /** Marker size multiplier of `def.globe.radius` (default 1) — e.g. earthquake magnitude. */
  size?: number;
  /** Extra marker height on top of `def.globe.altitude` (globe units). */
  lift?: number;
  /** Draw a text label for this item (defaults to `def.globe.labels`) — lets a layer label only its big items. */
  label?: boolean;
  /** When it happened (ms epoch). Drives the ticker order and recency pulses. */
  time?: number;
  raw?: any;
}

/** A ripple ring drawn around a fresh item (globe: animated rings, 2D map: expanding circle). */
export interface PulseSpec {
  color: string;
  /** Ring radius at the end of the ripple, in degrees of arc (globe) / scaled on the 2D map. */
  maxRadius: number;
  periodMs: number;
}

/** A direction arrow drawn from an item (wind). Globe: a path on the sphere; 2D map: a line. */
export interface ArrowSpec {
  /** Compass bearing the arrow points TOWARDS, in degrees clockwise from north. */
  bearing: number;
  /** Shaft length in degrees of arc (the head scales with it). */
  lengthDeg: number;
  color: string;
}

export interface LegendEntry {
  color: string;
  label: string;
}

export interface TooltipContent {
  title: string;
  lines: string[];
}

export interface DetailView {
  title: string;
  subtitle?: string;
  headline?: string;
  headlineColor?: string;
  rows: { label: string; value: string }[];
  /** Jumps to the Cities view for this city. */
  action?: { label: string; city: string };
  /** External source page. Only https links are rendered. */
  link?: { label: string; href: string };
}

/**
 * A map layer. Adding one means adding ONE file in app/layers/ and listing it in index.ts —
 * GlobeStage / FlatMap / LayerPanel / DetailPanel never contain layer-specific code.
 */
export interface LayerDef {
  id: string;
  group: LayerGroup;
  /** Key into the translations table (falls back to English). */
  labelKey: string;
  color: string;
  endpoint: string;
  refreshSec: number;
  defaultOn: boolean;
  parse: (json: any) => LayerItem[];
  legend: (u: UnitCtx) => LegendEntry[];
  tooltip: (item: LayerItem, u: UnitCtx) => TooltipContent;
  toDetail: (item: LayerItem, u: UnitCtx) => DetailView;
  globe: {
    radius: number;
    altitude: number;
    /** Draw a text label next to every point (cheap only for small layers). */
    labels: boolean;
  };
  /** Optional: ripple rings for fresh items. Return null when an item should not pulse. */
  pulse?: (item: LayerItem, now: number) => PulseSpec | null;
  /** Optional: a direction arrow from each item (wind). Return null to draw none. */
  arrow?: (item: LayerItem) => ArrowSpec | null;
  /** Optional: one-line ticker text (the ticker appends the relative time itself). */
  ticker?: (item: LayerItem, u: UnitCtx) => string;
  /** Optional: a headline counter for the ticker, read from the raw endpoint JSON. */
  counter?: (json: any) => { labelKey: string; value: number } | null;
}
