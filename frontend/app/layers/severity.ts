/** One severity scale for every hazard layer (backend: data/hazards/common.py). */
export type Severity = "info" | "mild" | "moderate" | "extreme";

export const SEVERITY_ORDER: Severity[] = ["info", "mild", "moderate", "extreme"];

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#60a5fa",
  mild: "#facc15",
  moderate: "#fb923c",
  extreme: "#f87171",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Low",
  mild: "Moderate",
  moderate: "High",
  extreme: "Extreme",
};

/** Marker size multiplier: severity is drawn as size (colour identifies the hazard type). */
export const SEVERITY_SIZE: Record<Severity, number> = { info: 0.7, mild: 1, moderate: 1.5, extreme: 2.1 };

export const isSeverity = (s: unknown): s is Severity => SEVERITY_ORDER.includes(s as Severity);
export const severityRank = (s: unknown): number => (isSeverity(s) ? SEVERITY_ORDER.indexOf(s) : 0);
