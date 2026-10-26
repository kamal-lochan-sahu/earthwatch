import { makeHazardLayer } from "./hazardKit";

/** Active wildfires (NASA EONET); size = burned area. */
export const wildfiresLayer = makeHazardLayer({
  id: "wildfires",
  group: "hazards",
  labelKey: "layerWildfires",
  counterKey: "counterWildfires",
  color: "#fb923c",
  endpoint: "/api/wildfires",
  icon: "🔥",
  noun: "Wildfire",
  legendLabel: "Wildfire · bigger = larger area",
  pulseFrom: "extreme",
  valueLabel: "Burned area",
});
