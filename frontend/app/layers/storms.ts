import { makeHazardLayer } from "./hazardKit";

/** Tropical cyclones + severe storms (GDACS alert levels, NASA EONET); size = alert/wind. */
export const stormsLayer = makeHazardLayer({
  id: "storms",
  group: "hazards",
  labelKey: "layerStorms",
  counterKey: "counterStorms",
  color: "#a78bfa",
  endpoint: "/api/storms",
  icon: "🌀",
  noun: "Cyclone / storm",
  legendLabel: "Cyclone / storm · bigger = stronger",
  pulseFrom: "moderate",
  valueLabel: "Max wind",
});
