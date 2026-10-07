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
  raw?: any;
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
}
