export function getTempColor(temp: number): string {
  if (temp >= 30) return "text-red-400";
  if (temp >= 20) return "text-orange-400";
  if (temp >= 10) return "text-yellow-400";
  return "text-blue-400";
}

export function getSeverityColor(severity: any): string {
  const s = String(severity ?? "").toLowerCase();
  if (s === "red" || s === "extreme" || s === "high") return "text-red-400 border-red-800";
  if (s === "orange" || s === "moderate" || s === "medium") return "text-orange-400 border-orange-800";
  if (s === "green" || s === "low" || s === "minor") return "text-green-400 border-green-800";
  return "text-yellow-400 border-yellow-800";
}

export function getEventIcon(type: any): string {
  const t = String(type ?? "").toLowerCase();
  if (t.includes("flood")) return "🌊";
  if (t.includes("storm") || t.includes("cyclone") || t.includes("hurricane")) return "🌀";
  if (t.includes("earthquake") || t.includes("quake")) return "🫨";
  if (t.includes("fire") || t.includes("wildfire")) return "🔥";
  if (t.includes("drought")) return "☀️";
  if (t.includes("volcano")) return "🌋";
  if (t.includes("snow") || t.includes("blizzard")) return "❄️";
  return "⚠️";
}
