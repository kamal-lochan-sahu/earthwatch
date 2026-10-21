import type { LayerDef, LayerGroup } from "./types";
import { temperatureLayer } from "./temperature";
import { earthquakesLayer } from "./earthquakes";

/** Every map layer. Order = order inside its group in the LayerPanel. */
export const LAYERS: LayerDef[] = [temperatureLayer, earthquakesLayer];

export const LAYER_BY_ID: Record<string, LayerDef> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l])
);

export const DEFAULT_LAYER_IDS: string[] = LAYERS.filter((l) => l.defaultOn).map((l) => l.id);

export const GROUPS: { id: LayerGroup; labelKey: string }[] = [
  { id: "weather", labelKey: "groupWeather" },
  { id: "hazards", labelKey: "groupHazards" },
  { id: "ocean", labelKey: "groupOcean" },
  { id: "space", labelKey: "groupSpace" },
  { id: "climate", labelKey: "groupClimate" },
];

export function isLayerId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYER_BY_ID, id);
}
