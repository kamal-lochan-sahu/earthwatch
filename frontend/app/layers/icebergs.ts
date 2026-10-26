import { makeHazardLayer } from "./hazardKit";

/** Tracked icebergs (NASA EONET / U.S. National Ice Center). */
export const icebergsLayer = makeHazardLayer({
  id: "icebergs",
  group: "ocean",
  labelKey: "layerIcebergs",
  counterKey: "counterIcebergs",
  color: "#38bdf8",
  endpoint: "/api/icebergs",
  icon: "🧊",
  noun: "Iceberg",
  legendLabel: "Tracked iceberg · bigger = larger",
  pulseFrom: null,
  valueLabel: "Area",
});
