"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { translations, REGION_LANGUAGE_MAP } from "../translations";

export const VIEW_IDS = ["mission", "hazards", "climate", "cities", "system"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
const DEFAULT_VIEW: ViewId = "mission";

function isViewId(v: string | null): v is ViewId {
  return !!v && (VIEW_IDS as readonly string[]).includes(v);
}

function readUrl(): { view: ViewId; city: string } {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("view");
  return { view: isViewId(v) ? v : DEFAULT_VIEW, city: (p.get("city") ?? "").slice(0, 80) };
}

function writeUrl(view: ViewId, city: string, mode: "push" | "replace") {
  const p = new URLSearchParams();
  if (view !== DEFAULT_VIEW) p.set("view", view);
  if (city) p.set("city", city);
  const qs = p.toString();
  const url = window.location.pathname + (qs ? `?${qs}` : "");
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

interface AppState {
  view: ViewId;
  setView: (v: ViewId) => void;
  /** City currently searched (URL-synced as ?city=). */
  city: string;
  /** Update the searched city without leaving the current view. */
  setCity: (c: string) => void;
  /** Jump to the Cities view and search this city. */
  openCity: (c: string) => void;

  isFahrenheit: boolean;
  toggleUnits: () => void;
  convertTemp: (celsius: number) => number;
  tempUnit: string;

  currentLang: string;
  setCurrentLang: (l: string) => void;
  regionalLang: string | null;
  t: Record<string, string>;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<ViewId>(DEFAULT_VIEW);
  const [city, setCityState] = useState("");
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [currentLang, setCurrentLang] = useState("en");
  const [regionalLang, setRegionalLang] = useState<string | null>(null);

  // Latest view/city for callbacks, so they stay stable and never act on stale values.
  const latest = useRef({ view, city });
  latest.current = { view, city };

  // Read initial state from the URL, and follow browser back/forward.
  useEffect(() => {
    const apply = () => {
      const s = readUrl();
      setViewState(s.view);
      setCityState(s.city);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const setView = useCallback((v: ViewId) => {
    if (v === latest.current.view) return;
    setViewState(v);
    writeUrl(v, latest.current.city, "push");
    window.scrollTo({ top: 0 });
  }, []);

  const setCity = useCallback((c: string) => {
    const clean = c.trim().slice(0, 80);
    setCityState(clean);
    writeUrl(latest.current.view, clean, "replace");
  }, []);

  const openCity = useCallback((c: string) => {
    const clean = c.trim().slice(0, 80);
    if (!clean) return;
    setCityState(clean);
    setViewState("cities");
    writeUrl("cities", clean, latest.current.view === "cities" ? "replace" : "push");
    window.scrollTo({ top: 0 });
  }, []);

  // Detect user region -> offer regional language (unchanged behaviour).
  useEffect(() => {
    async function detectRegion() {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        const indiaKey = `IN-${data.region_code}`;
        if (REGION_LANGUAGE_MAP[indiaKey]) setRegionalLang(REGION_LANGUAGE_MAP[indiaKey]);
        else if (REGION_LANGUAGE_MAP[data.country_code])
          setRegionalLang(REGION_LANGUAGE_MAP[data.country_code]);
      } catch {
        console.error("Region detection failed:");
      }
    }
    detectRegion();
  }, []);

  const toggleUnits = useCallback(() => setIsFahrenheit((f) => !f), []);
  const convertTemp = useCallback(
    (c: number) => (isFahrenheit ? Math.round((c * 9) / 5 + 32) : c),
    [isFahrenheit]
  );

  const t = translations[currentLang] || translations["en"];

  const value = useMemo<AppState>(
    () => ({
      view, setView, city, setCity, openCity,
      isFahrenheit, toggleUnits, convertTemp, tempUnit: isFahrenheit ? "°F" : "°C",
      currentLang, setCurrentLang, regionalLang, t,
    }),
    [view, setView, city, setCity, openCity, isFahrenheit, toggleUnits, convertTemp,
     currentLang, regionalLang, t]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
