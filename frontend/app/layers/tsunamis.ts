import { timeAgo } from "../lib/format";
import { parseHazards, type HazardKind } from "./hazardKit";
import { SEVERITY_COLOR, severityRank, type Severity } from "./severity";
import type { LayerDef, LayerItem, PulseSpec } from "./types";

const WINDOW_MS = 48 * 3_600_000; // the backend keeps messages for 48 hours

/** Only what parseHazards needs; the rest of this layer is custom because severity here is a message type, not a hazard size. */
const KIND: HazardKind = {
  id: "tsunamis",
  group: "ocean",
  labelKey: "layerTsunamis",
  counterKey: "counterTsunamis",
  color: "#38bdf8",
  endpoint: "/api/tsunamis",
  icon: "🌊",
  noun: "Tsunami message",
  legendLabel: "Tsunami message",
  pulseFrom: "mild",
  valueLabel: "Magnitude",
};

/** Message kinds the backend sends (data/hazards/tsunami.py). */
const NAME: Record<string, string> = {
  information: "Information statement",
  cancellation: "Cancellation",
  advisory: "Advisory",
  watch: "Watch",
  threat: "Threat message",
  warning: "Warning",
  other: "Message",
};
const HEADLINE: Record<string, string> = {
  information: "No tsunami threat",
  cancellation: "Alert cancelled",
  advisory: "Advisory",
  watch: "Watch",
  threat: "Threat message",
  warning: "WARNING",
  other: "Message",
};
const CENTRE: Record<string, string> = {
  NTWC: "National TWC, Alaska",
  PTWC: "Pacific TWC, Hawaii",
};

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const nameOf = (item: LayerItem) => NAME[item.raw.kind] ?? NAME.other;
const sev = (item: LayerItem): Severity => item.raw.severity;
const isAlert = (item: LayerItem) => severityRank(sev(item)) >= severityRank("mild");

export function magnitudeText(raw: any): string | null {
  if (!isNum(raw?.value)) return null;
  const type = typeof raw.magnitude_type === "string" && raw.magnitude_type ? ` (${raw.magnitude_type})` : "";
  return `M ${raw.value.toFixed(1)}${type}`;
}

/** Latest tsunami messages from the NOAA warning centers. Colour = how serious the message is, not the hazard type. */
export const tsunamisLayer: LayerDef = {
  id: "tsunamis",
  group: "ocean",
  labelKey: "layerTsunamis",
  color: "#38bdf8",
  endpoint: "/api/tsunamis",
  refreshSec: 300,
  defaultOn: false,

  parse: (json) => parseHazards(json, KIND).map((item) => ({ ...item, color: SEVERITY_COLOR[sev(item)] })),

  // Shown even at 0: "no active tsunami alerts" is the normal, reassuring state.
  counter: (json) =>
    isNum(json?.counts?.active) ? { labelKey: "counterTsunamis", value: json.counts.active } : null,

  legend: () => [
    { color: SEVERITY_COLOR.extreme, label: "Warning" },
    { color: SEVERITY_COLOR.moderate, label: "Watch / threat" },
    { color: SEVERITY_COLOR.mild, label: "Advisory" },
    { color: SEVERITY_COLOR.info, label: "Information · no threat" },
  ],

  tooltip: (item) => {
    const r = item.raw;
    const lines = [r.region, magnitudeText(r), item.time ? `🕐 issued ${timeAgo(item.time)}` : ""];
    return { title: `🌊 ${nameOf(item)}`, lines: lines.filter(Boolean) as string[] };
  },

  toDetail: (item) => {
    const r = item.raw;
    const rows: { label: string; value: string }[] = [];
    if (r.message) rows.push({ label: "Message", value: r.message });
    const mag = magnitudeText(r);
    if (mag) rows.push({ label: "Earthquake", value: mag });
    if (item.time) {
      rows.push({ label: "Issued", value: timeAgo(item.time) });
      rows.push({ label: "Time (UTC)", value: new Date(item.time).toISOString().slice(0, 16).replace("T", " ") });
    }
    if (r.note) rows.push({ label: "Note", value: r.note });
    if (CENTRE[r.centre]) rows.push({ label: "Issued by", value: CENTRE[r.centre] });
    rows.push({
      label: "Notice",
      value: isAlert(item) ? "NOAA relay only. Follow local authorities." : "NOAA relay, not an alert service.",
    });
    return {
      title: r.region ?? item.title,
      subtitle: `Tsunami message · ${r.source ?? "NOAA"}`,
      headline: HEADLINE[r.kind] ?? HEADLINE.other,
      headlineColor: item.color,
      rows,
      link: typeof r.url === "string" ? { label: "Read the official bulletin", href: r.url } : undefined,
    };
  },

  ticker: (item) => {
    const mag = magnitudeText(item.raw);
    return `🌊 ${nameOf(item)}${mag ? ` · ${mag}` : ""} · ${item.raw.region ?? ""}`.replace(/ · $/, "");
  },

  /** Real alerts ripple (faster than the others) for as long as the backend keeps them. */
  pulse: (item, now): PulseSpec | null => {
    if (!item.time || !isAlert(item) || now - item.time > WINDOW_MS) return null;
    return { color: item.color, maxRadius: 4 + severityRank(sev(item)), periodMs: 1800 };
  },

  globe: { radius: 0.5, altitude: 0.012, labels: false },
};
