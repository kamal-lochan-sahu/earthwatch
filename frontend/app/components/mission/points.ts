import { LAYER_BY_ID } from "../../layers";
import type { ArrowSpec, LayerDef, LayerItem, PulseSpec, TintSpec } from "../../layers/types";
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
  /** Ripple ring for fresh items (already limited to MAX_PULSES across all layers). */
  pulse: PulseSpec | null;
  /** Direction arrow (wind), drawn on the globe and the 2D map. */
  arrow: ArrowSpec | null;
}

/** Ripples are the most expensive thing on the globe: only the freshest few are animated. */
export const MAX_PULSES = 25;

export function buildPoints(
  activeIds: string[],
  states: Record<string, LayerState>,
  selectedKey: string,
  now: number = Date.now()
): MapPoint[] {
  const out: MapPoint[] = [];
  for (const id of activeIds) {
    const def = LAYER_BY_ID[id];
    const st = states[id];
    if (!def || !st) continue;
    for (const item of st.items) {
      const key = `${def.id}:${item.id}`;
      const selected = key === selectedKey;
      const radius = def.globe.radius * (item.size ?? 1);
      const altitude = def.globe.altitude + (item.lift ?? 0);
      out.push({
        key,
        def,
        item,
        color: item.color,
        radius: selected ? radius * 1.8 : radius,
        altitude: selected ? altitude + 0.04 : altitude,
        label: item.label ?? def.globe.labels,
        selected,
        pulse: def.pulse?.(item, now) ?? null,
        arrow: def.arrow?.(item) ?? null,
      });
    }
  }

  // Keep ripples on the freshest items only (the 3D globe and the 2D map share this).
  const pulsing = out.filter((p) => p.pulse);
  if (pulsing.length > MAX_PULSES) {
    pulsing.sort((a, b) => (b.item.time ?? 0) - (a.item.time ?? 0));
    for (const p of pulsing.slice(MAX_PULSES)) p.pulse = null;
  }
  return out;
}

/** Colour washes (day/night, aurora) of the active layers, evaluated at `now`. */
export function buildTints(activeIds: string[], states: Record<string, LayerState>, now: number): TintSpec[] {
  const out: TintSpec[] = [];
  for (const id of activeIds) {
    const def = LAYER_BY_ID[id];
    if (!def?.tint) continue;
    // A layer that fetches data paints nothing until the first load has arrived.
    if (def.endpoint && !states[id]?.data) continue;
    const t = def.tint(now, states[id]?.data);
    if (Array.isArray(t)) out.push(...t);
    else if (t) out.push(t);
  }
  return out;
}
