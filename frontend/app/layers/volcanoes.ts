import { makeHazardLayer } from "./hazardKit";

/** Volcanoes erupting or in notable unrest (NASA EONET). */
export const volcanoesLayer = makeHazardLayer({
  id: "volcanoes",
  group: "hazards",
  labelKey: "layerVolcanoes",
  counterKey: "counterVolcanoes",
  color: "#f43f5e",
  endpoint: "/api/volcanoes",
  icon: "🌋",
  noun: "Volcano",
  legendLabel: "Erupting / in unrest",
  pulseFrom: null,
  valueLabel: "Value",
});
