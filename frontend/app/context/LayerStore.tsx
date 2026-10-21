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
import { apiGetShared } from "../hooks/useApi";
import { LAYER_BY_ID } from "../layers";
import type { LayerDef, LayerItem } from "../layers/types";
import { useAppState } from "./AppState";

export interface LayerState {
  status: "idle" | "loading" | "ok" | "error";
  items: LayerItem[];
  /** ms epoch of the last successful load. */
  updatedAt: number | null;
  /** A refresh failed (or the backend served an old copy); we are showing the previous data. */
  stale: boolean;
  /** Headline number from the layer's `counter()` (e.g. quakes in the last 24h). */
  counter: { labelKey: string; value: number } | null;
}

const EMPTY: LayerState = { status: "idle", items: [], updatedAt: null, stale: false, counter: null };
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 15_000;

interface LayerStoreValue {
  states: Record<string, LayerState>;
  /** The currently selected item (resolved from ?sel=), or null. */
  selected: { def: LayerDef; item: LayerItem } | null;
}

const LayerStoreContext = createContext<LayerStoreValue | null>(null);

/**
 * Loads and refreshes the data of every ACTIVE layer. A failed refresh keeps the previous
 * items and flags them stale, so a layer never silently vanishes.
 */
export function LayerStoreProvider({ children }: { children: React.ReactNode }) {
  const { activeLayers, selection } = useAppState();
  const [states, setStates] = useState<Record<string, LayerState>>({});
  const statesRef = useRef(states);
  statesRef.current = states;
  const loading = useRef(new Set<string>());
  const retryTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const attempts = useRef<Record<string, number>>({});

  const patch = useCallback((id: string, fn: (prev: LayerState) => LayerState) => {
    setStates((s) => ({ ...s, [id]: fn(s[id] ?? EMPTY) }));
  }, []);

  const load = useCallback(
    async (def: LayerDef) => {
      if (loading.current.has(def.id)) return;
      loading.current.add(def.id);
      patch(def.id, (p) => (p.items.length ? p : { ...p, status: "loading" }));
      try {
        const json = await apiGetShared(def.endpoint, 5_000);
        const items = def.parse(json);
        const counter = def.counter?.(json) ?? null;
        // Hazard endpoints flag when the backend is serving an older copy; show THAT age, not now.
        const backendStale = json?.stale === true;
        const backendAt = backendStale ? Date.parse(json?.updated_at) : NaN;
        attempts.current[def.id] = 0;
        patch(def.id, () => ({
          status: "ok",
          items,
          counter,
          updatedAt: Number.isFinite(backendAt) ? backendAt : Date.now(),
          stale: backendStale,
        }));
      } catch (e) {
        console.error(`Layer ${def.id} failed:`, e);
        const n = (attempts.current[def.id] = (attempts.current[def.id] ?? 0) + 1);
        patch(def.id, (p) =>
          p.items.length ? { ...p, status: "ok", stale: true } : { ...EMPTY, status: "error" }
        );
        if (n <= MAX_RETRIES) {
          // Free-tier backends cold-start slowly, so retry with a growing delay.
          const timer = setTimeout(() => {
            retryTimers.current.delete(timer);
            load(def);
          }, RETRY_BASE_MS * n);
          retryTimers.current.add(timer);
        }
      } finally {
        loading.current.delete(def.id);
      }
    },
    [patch]
  );

  const activeKey = activeLayers.join(",");
  useEffect(() => {
    const defs = activeKey
      .split(",")
      .map((id) => LAYER_BY_ID[id])
      .filter(Boolean);

    const refreshIfDue = (def: LayerDef) => {
      const at = statesRef.current[def.id]?.updatedAt;
      if (!at || Date.now() - at > def.refreshSec * 1000) load(def);
    };

    defs.forEach(refreshIfDue);
    const timers = defs.map((def) =>
      setInterval(() => {
        if (document.visibilityState === "visible") refreshIfDue(def);
      }, Math.min(def.refreshSec, 60) * 1000)
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") defs.forEach(refreshIfDue);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach(clearInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeKey, load]);

  useEffect(() => {
    const timers = retryTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const selected = useMemo(() => {
    const i = selection.indexOf(":");
    if (i < 1) return null;
    const def = LAYER_BY_ID[selection.slice(0, i)];
    if (!def || !activeLayers.includes(def.id)) return null;
    const item = states[def.id]?.items.find((x) => x.id === selection.slice(i + 1));
    return item ? { def, item } : null;
  }, [selection, activeLayers, states]);

  const value = useMemo(() => ({ states, selected }), [states, selected]);
  return <LayerStoreContext.Provider value={value}>{children}</LayerStoreContext.Provider>;
}

export function useLayerStore(): LayerStoreValue {
  const ctx = useContext(LayerStoreContext);
  if (!ctx) throw new Error("useLayerStore must be used inside <LayerStoreProvider>");
  return ctx;
}
