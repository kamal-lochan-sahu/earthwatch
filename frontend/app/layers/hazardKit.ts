import { timeAgo } from "../lib/format";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_SIZE, isSeverity, severityRank, type Severity } from "./severity";
import type { LayerDef, LayerGroup, LayerItem, PulseSpec } from "./types";

/** What differs between the EONET / GDACS hazard layers; everything else is shared here. */
export interface HazardKind {
  id: string;
  group: LayerGroup;
  labelKey: string;
  counterKey: string;
  /** Hazard-type colour of the markers (severity is shown by size, badge and ripples). */
  color: string;
  endpoint: string;
  icon: string;
  noun: string;
  legendLabel: string;
  /** Items at or above this severity ripple while fresh; null = never. */
  pulseFrom: Severity | null;
  /** Detail-panel label for the item's number, e.g. "Burned area". */
  valueLabel: string;
}

const HOUR_MS = 3_600_000;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function formatValue(value: unknown, unit: unknown): string | null {
  if (!finite(value) || typeof unit !== "string" || !unit) return null;
  return `${value.toLocaleString("en-US")} ${unit}`;
}

/** Backend hazard envelope -> items. Malformed rows are skipped, never thrown on. */
export function parseHazards(json: any, kind: HazardKind): LayerItem[] {
  const rows: any[] = Array.isArray(json?.items) ? json.items : [];
  const out: LayerItem[] = [];
  for (const r of rows) {
    if (
      typeof r?.id !== "string" ||
      !finite(r.lat) || r.lat < -90 || r.lat > 90 ||
      !finite(r.lon) || r.lon < -180 || r.lon > 180
    ) continue;
    const severity: Severity = isSeverity(r.severity) ? r.severity : "info";
    const time = Date.parse(r.time);
    out.push({
      id: r.id,
      lat: r.lat,
      lon: r.lon,
      title: typeof r.title === "string" && r.title ? r.title : kind.noun,
      color: kind.color,
      size: SEVERITY_SIZE[severity],
      lift: severityRank(severity) * 0.004,
      time: Number.isFinite(time) ? time : undefined,
      raw: { ...r, severity },
    });
  }
  return out;
}

export function makeHazardLayer(kind: HazardKind): LayerDef {
  const pulseRank = kind.pulseFrom ? severityRank(kind.pulseFrom) : null;
  const sev = (item: LayerItem): Severity => item.raw.severity;

  return {
    id: kind.id,
    group: kind.group,
    labelKey: kind.labelKey,
    color: kind.color,
    endpoint: kind.endpoint,
    refreshSec: 900,
    defaultOn: false,

    parse: (json) => parseHazards(json, kind),

    counter: (json) =>
      finite(json?.counts?.active) ? { labelKey: kind.counterKey, value: json.counts.active } : null,

    legend: () => [{ color: kind.color, label: kind.legendLabel }],

    tooltip: (item) => {
      const r = item.raw;
      const lines = [`${SEVERITY_LABEL[sev(item)]} severity`];
      const v = formatValue(r.value, r.unit);
      if (v) lines.push(v);
      if (item.time) lines.push(`🕐 updated ${timeAgo(item.time)}`);
      return { title: `${kind.icon} ${item.title}`, lines };
    },

    toDetail: (item) => {
      const r = item.raw;
      const rows: { label: string; value: string }[] = [{ label: "Severity", value: SEVERITY_LABEL[sev(item)] }];
      const v = formatValue(r.value, r.unit);
      if (v) rows.push({ label: kind.valueLabel, value: v });
      if (typeof r.alert === "string") rows.push({ label: "GDACS alert", value: r.alert.toUpperCase() });
      if (typeof r.country === "string" && r.country) rows.push({ label: "Country", value: r.country });
      if (item.time) rows.push({ label: "Last update", value: timeAgo(item.time) });
      const started = Date.parse(r.started);
      if (Number.isFinite(started)) rows.push({ label: "First seen", value: new Date(started).toISOString().slice(0, 10) });
      return {
        title: item.title,
        subtitle: `${kind.noun} · ${r.source ?? "NASA EONET"}`,
        headline: v ?? SEVERITY_LABEL[sev(item)],
        headlineColor: SEVERITY_COLOR[sev(item)],
        rows,
        link: typeof r.url === "string" ? { label: "View source", href: r.url } : undefined,
      };
    },

    ticker: (item) => {
      const v = formatValue(item.raw.value, item.raw.unit);
      return `${kind.icon} ${item.title}${v ? ` · ${v}` : ""}`;
    },

    pulse:
      pulseRank === null
        ? undefined
        : (item, now): PulseSpec | null => {
            if (!item.time || severityRank(sev(item)) < pulseRank) return null;
            if (now - item.time > 24 * HOUR_MS) return null;
            return { color: item.color, maxRadius: 3 + severityRank(sev(item)), periodMs: 2800 };
          },

    globe: { radius: 0.5, altitude: 0.012, labels: false },
  };
}
