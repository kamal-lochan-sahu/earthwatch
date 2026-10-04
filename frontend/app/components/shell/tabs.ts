import type { ViewId } from "../../context/AppState";

// English-only for now; other languages fall back to English until the Phase 10 translation pass.
export const TABS: { id: ViewId; label: string; icon: string }[] = [
  { id: "mission", label: "Mission", icon: "🌍" },
  { id: "hazards", label: "Hazards", icon: "🚨" },
  { id: "climate", label: "Climate", icon: "📈" },
  { id: "cities", label: "Cities", icon: "🏙️" },
  { id: "system", label: "System", icon: "⚙️" },
];
