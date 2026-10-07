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
import { DEFAULT_LAYER_IDS, isLayerId } from "../layers";

export const VIEW_IDS = ["mission", "hazards", "climate", "cities", "system"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
const DEFAULT_VIEW: ViewId = "mission";

function isViewId(v: string | null): v is ViewId {
  return !!v && (VIEW_IDS as readonly string[]).includes(v);
}

/** Everything that lives in the URL, so any state can be shared as a link. */
interface Nav {
  view: ViewId;
  city: string;
  /** Active map layers (Mission view). */
  layers: string[];
  /** Selected map item as "layerId:itemId" or "". */
  sel: string;
  /** User chose the 2D map (?map=2d). */
  flat: boolean;
}

const DEFAULT_NAV: Nav = {
  view: DEFAULT_VIEW,
  city: "",
  layers: DEFAULT_LAYER_IDS,
  sel: "",
  flat: false,
};

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function readUrl(): Nav {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("view");
  const rawLayers = p.get("layers");
  const layers =
    rawLayers === null
      ? DEFAULT_LAYER_IDS
      : Array.from(new Set(rawLayers.split(",").filter(isLayerId)));
  return {
    view: isViewId(v) ? v : DEFAULT_VIEW,
    city: (p.get("city") ?? "").slice(0, 80),
    layers,
    sel: (p.get("sel") ?? "").slice(0, 120),
    flat: p.get("map") === "2d",
  };
}

function writeUrl(n: Nav, mode: "push" | "replace") {
  const p = new URLSearchParams();
  if (n.view !== DEFAULT_VIEW) p.set("view", n.view);
  if (n.city) p.set("city", n.city);
  if (n.view === "mission") {
    if (!sameSet(n.layers, DEFAULT_LAYER_IDS)) p.set("layers", n.layers.join(","));
    if (n.sel) p.set("sel", n.sel);
    if (n.flat) p.set("map", "2d");
  }
  const qs = p.toString();
  const url = window.location.pathname + (qs ? `?${qs}` : "");
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
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

  /** Active map layer ids (URL-synced as ?layers=). */
  activeLayers: string[];
  toggleLayer: (id: string) => void;
  /** Selected map item "layerId:itemId" (URL-synced as ?sel=), "" when none. */
  selection: string;
  select: (sel: string) => void;

  /** "3d" = WebGL globe, "2d" = flat SVG map. Falls back to 2d when WebGL is unavailable. */
  mapMode: "3d" | "2d";
  /** null until the browser has been probed. */
  canWebGL: boolean | null;
  setFlat: (flat: boolean) => void;
  /** Called by the globe when WebGL fails or the GPU context is lost. */
  reportWebGLFailure: () => void;

  /** Approximate visitor location (from the region lookup), used by the fly-in intro. */
  visitorGeo: { lat: number; lon: number } | null;
  /** True once the region lookup finished (successfully or not). */
  geoSettled: boolean;

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
  const [nav, setNav] = useState<Nav>(DEFAULT_NAV);
  const [canWebGL, setCanWebGL] = useState<boolean | null>(null);
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [currentLang, setCurrentLang] = useState("en");
  const [regionalLang, setRegionalLang] = useState<string | null>(null);
  const [visitorGeo, setVisitorGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [geoSettled, setGeoSettled] = useState(false);

  // Latest nav for callbacks, so they stay stable and never act on stale values.
  const latest = useRef<Nav>(nav);
  latest.current = nav;

  const commit = useCallback((patch: Partial<Nav>, mode: "push" | "replace") => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setNav(next);
    writeUrl(next, mode);
  }, []);

  // Read initial state from the URL, and follow browser back/forward.
  useEffect(() => {
    const apply = () => {
      const n = readUrl();
      latest.current = n;
      setNav(n);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  useEffect(() => {
    setCanWebGL(detectWebGL());
  }, []);

  const setView = useCallback(
    (v: ViewId) => {
      if (v === latest.current.view) return;
      commit({ view: v }, "push");
      window.scrollTo({ top: 0 });
    },
    [commit]
  );

  const setCity = useCallback(
    (c: string) => commit({ city: c.trim().slice(0, 80) }, "replace"),
    [commit]
  );

  const openCity = useCallback(
    (c: string) => {
      const clean = c.trim().slice(0, 80);
      if (!clean) return;
      commit({ city: clean, view: "cities" }, latest.current.view === "cities" ? "replace" : "push");
      window.scrollTo({ top: 0 });
    },
    [commit]
  );

  const toggleLayer = useCallback(
    (id: string) => {
      if (!isLayerId(id)) return;
      const cur = latest.current;
      const on = cur.layers.includes(id);
      const layers = on ? cur.layers.filter((x) => x !== id) : [...cur.layers, id];
      // Drop the selection if its layer was just switched off.
      const sel = on && cur.sel.startsWith(`${id}:`) ? "" : cur.sel;
      commit({ layers, sel }, "replace");
    },
    [commit]
  );

  const select = useCallback((sel: string) => commit({ sel }, "replace"), [commit]);
  const setFlat = useCallback((flat: boolean) => commit({ flat }, "replace"), [commit]);
  const reportWebGLFailure = useCallback(() => setCanWebGL(false), []);

  // Detect user region -> offer regional language, and remember roughly where the visitor is.
  useEffect(() => {
    async function detectRegion() {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        const indiaKey = `IN-${data.region_code}`;
        if (REGION_LANGUAGE_MAP[indiaKey]) setRegionalLang(REGION_LANGUAGE_MAP[indiaKey]);
        else if (REGION_LANGUAGE_MAP[data.country_code])
          setRegionalLang(REGION_LANGUAGE_MAP[data.country_code]);
        if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
          setVisitorGeo({ lat: data.latitude, lon: data.longitude });
        }
      } catch {
        console.error("Region detection failed:");
      } finally {
        setGeoSettled(true);
      }
    }
    detectRegion();
  }, []);

  const toggleUnits = useCallback(() => setIsFahrenheit((f) => !f), []);
  const convertTemp = useCallback(
    (c: number) => (isFahrenheit ? Math.round((c * 9) / 5 + 32) : c),
    [isFahrenheit]
  );

  // Missing keys in a language fall back to English (new UI strings land in English first).
  const t = useMemo(
    () =>
      currentLang === "en" || !translations[currentLang]
        ? translations["en"]
        : { ...translations["en"], ...translations[currentLang] },
    [currentLang]
  );

  const mapMode: "3d" | "2d" = nav.flat || canWebGL === false ? "2d" : "3d";

  const value = useMemo<AppState>(
    () => ({
      view: nav.view, setView, city: nav.city, setCity, openCity,
      activeLayers: nav.layers, toggleLayer, selection: nav.sel, select,
      mapMode, canWebGL, setFlat, reportWebGLFailure,
      visitorGeo, geoSettled,
      isFahrenheit, toggleUnits, convertTemp, tempUnit: isFahrenheit ? "°F" : "°C",
      currentLang, setCurrentLang, regionalLang, t,
    }),
    [nav, setView, setCity, openCity, toggleLayer, select, mapMode, canWebGL, setFlat,
     reportWebGLFailure, visitorGeo, geoSettled, isFahrenheit, toggleUnits, convertTemp,
     currentLang, regionalLang, t]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
