import { LAYER_BY_ID } from "../../layers";
import type { LayerDef, LayerItem } from "../../layers/types";
import type { LayerState } from "../../context/LayerStore";

/** One renderable marker, shared by the 3D globe and the 2D map. */
export interface MapPoint {
  key: string; // "layerId:itemId"
  def: LayerDef;
  item: LayerItem;
  color: string;
  radius: number;
  altitude: number;
  label: boolean;
  selected: boolean;
}

export function buildPoints(
  activeIds: string[],
  states: Record<string, LayerState>,
  selectedKey: string
): MapPoint[] {
  const out: MapPoint[] = [];
  for (const id of activeIds) {
    const def = LAYER_BY_ID[id];
    const st = states[id];
    if (!def || !st) continue;
    for (const item of st.items) {
      const key = `${def.id}:${item.id}`;
      const selected = key === selectedKey;
      out.push({
        key,
        def,
        item,
        color: item.color,
        radius: selected ? def.globe.radius * 1.8 : def.globe.radius,
        altitude: selected ? def.globe.altitude + 0.04 : def.globe.altitude,
        label: def.globe.labels,
        selected,
      });
    }
  }
  return out;
}
