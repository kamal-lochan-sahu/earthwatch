"use client";
import { useEffect, useRef, useState } from "react";
import { escapeHtml } from "../../lib/format";
import type { UnitCtx } from "../../layers/types";
import type { MapPoint } from "./points";

interface Props {
  points: MapPoint[];
  onSelect: (key: string | null) => void;
  units: UnitCtx;
  reducedMotion: boolean;
  geo: { lat: number; lon: number } | null;
  geoSettled: boolean;
  onWebGLFailure: () => void;
}

const BG = "#05070d";
const INTRO_KEY = "earthwatch:intro";
const INTRO_MS = 2800;
const isNarrow = (el: HTMLElement | null) => !!el && el.clientWidth < 600;
// Camera altitude (globe radii) that frames the whole globe: portrait phones need to sit further back.
const viewAlt = (el: HTMLElement | null) => (isNarrow(el) ? 3.6 : 2.2);
const IDLE_RESUME_MS = 6000;
// Remembered across Mission-view remounts so switching tabs doesn't snap the camera back.
let lastPov: { lat: number; lng: number; altitude: number } | null = null;

/** One ripple on the globe: a layer's pulse for a fresh item, or the white selection ring. */
interface RingDatum {
  lat: number;
  lng: number;
  rgb: string; // "r,g,b"
  maxR: number; // degrees of arc
  speed: number; // degrees per second
  period: number; // ms between ripples
}

function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "255,255,255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const SELECTION_RING = { rgb: "255,255,255", maxR: 4, speed: 2, period: 1400 };

function introSeen(): boolean {
  try { return sessionStorage.getItem(INTRO_KEY) === "1"; } catch { return false; }
}

export default function GlobeStage({
  points, onSelect, units, reducedMotion, geo, geoSettled, onWebGLFailure,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest props for callbacks created once inside the init effect.
  const live = useRef({ onSelect, units, reducedMotion, onWebGLFailure });
  live.current = { onSelect, units, reducedMotion, onWebGLFailure };
  const selectedRef = useRef<MapPoint | null>(null);
  selectedRef.current = points.find((p) => p.selected) ?? null;
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const introTimer = useRef<ReturnType<typeof setTimeout>>();
  const introPlayed = useRef(false);

  // ---- create the globe once ----
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let cancelled = false;
    let globe: any;
    let ro: ResizeObserver | undefined;
    let onVisibility: (() => void) | undefined;
    let onLost: ((e: Event) => void) | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let readyFallback: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const Globe = (await import("globe.gl")).default;
        if (cancelled) return;
        el.innerHTML = "";

        let setupDone = false;
        const finishSetup = () => {
          if (cancelled || setupDone || !globe) return;
          setupDone = true;
          const controls = globe.controls();
          if (controls) {
            controls.autoRotateSpeed = 0.8;
            controls.autoRotate = !live.current.reducedMotion && !selectedRef.current;
            // Pause rotation while the visitor drags/zooms, resume when idle.
            controls.addEventListener("start", () => {
              controls.autoRotate = false;
              clearTimeout(resumeTimer.current);
            });
            controls.addEventListener("end", () => {
              lastPov = globe.pointOfView();
              clearTimeout(resumeTimer.current);
              resumeTimer.current = setTimeout(() => {
                if (!live.current.reducedMotion && !selectedRef.current) controls.autoRotate = true;
              }, IDLE_RESUME_MS);
            });
          }
          if (lastPov) {
            globe.pointOfView(lastPov, 0);
            introPlayed.current = true;
          } else if (!live.current.reducedMotion && !introSeen() && !selectedRef.current) {
            // Wait in orbit until the visitor's region is known, then fly in.
            globe.pointOfView({ lat: 20, lng: 10, altitude: 6 }, 0);
            if (controls) controls.autoRotate = false;
          } else if (isNarrow(el)) {
            const pov = globe.pointOfView();
            globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: viewAlt(el) }, 0);
          }
          setReady(true);
        };

        globe = (Globe as any)()(el)
          .width(el.clientWidth || 800)
          .height(el.clientHeight || 600)
          .backgroundColor(BG)
          .globeImageUrl("/textures/earth-night.jpg")
          .pointsTransitionDuration(300)
          .pointLat((d: MapPoint) => d.item.lat)
          .pointLng((d: MapPoint) => d.item.lon)
          .pointColor((d: MapPoint) => d.color)
          .pointAltitude((d: MapPoint) => d.altitude)
          .pointRadius((d: MapPoint) => d.radius)
          .pointLabel((d: MapPoint) => {
            const tip = d.def.tooltip(d.item, live.current.units);
            return `<div style="background:#1f2937;padding:8px;border-radius:8px;color:white;font-size:13px">
              <b>${escapeHtml(tip.title)}</b>${tip.lines.map((l) => `<br/>${escapeHtml(l)}`).join("")}
            </div>`;
          })
          .onPointClick((d: MapPoint) => live.current.onSelect(d.key))
          .onGlobeClick(() => live.current.onSelect(null))
          .labelLat((d: MapPoint) => d.item.lat)
          .labelLng((d: MapPoint) => d.item.lon)
          .labelText((d: MapPoint) => d.item.title)
          .labelSize(1.2)
          .labelColor(() => "white")
          .labelDotRadius(0.3)
          .ringLat((d: RingDatum) => d.lat)
          .ringLng((d: RingDatum) => d.lng)
          .ringColor((d: RingDatum) => (t: number) => `rgba(${d.rgb},${1 - t})`)
          .ringMaxRadius((d: RingDatum) => d.maxR)
          .ringPropagationSpeed((d: RingDatum) => d.speed)
          .ringRepeatPeriod((d: RingDatum) => d.period)
          .onGlobeReady(() => finishSetup());
        globeRef.current = globe;
        // If the texture is slow/blocked, onGlobeReady may never fire: still show points after 3s.
        readyFallback = setTimeout(finishSetup, 3000);

        // GPU context lost (old graphics / memory pressure) -> hand over to the 2D map.
        canvas = globe.renderer?.()?.domElement;
        onLost = (e: Event) => {
          e.preventDefault();
          live.current.onWebGLFailure();
        };
        canvas?.addEventListener("webglcontextlost", onLost);

        ro = new ResizeObserver(() => {
          globe.width(el.clientWidth || 800).height(el.clientHeight || 600);
        });
        ro.observe(el);

        // Stop rendering while the tab is hidden.
        onVisibility = () =>
          document.visibilityState === "hidden" ? globe.pauseAnimation() : globe.resumeAnimation();
        document.addEventListener("visibilitychange", onVisibility);
      } catch (e: any) {
        console.error("GlobeStage init failed:", e);
        if (!cancelled) {
          setError("Globe failed to initialise: " + (e?.message || String(e)));
          live.current.onWebGLFailure();
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(resumeTimer.current);
      clearTimeout(introTimer.current);
      clearTimeout(readyFallback);
      try { if (globe) lastPov = globe.pointOfView() ?? lastPov; } catch {}
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
      if (onLost) canvas?.removeEventListener("webglcontextlost", onLost);
      ro?.disconnect();
      try { globe?._destructor?.(); } catch {}
      globeRef.current = null;
      el.innerHTML = "";
    };
  }, []);

  // ---- feed data ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    g.pointsData(points);
    g.labelsData(points.filter((p) => p.label));
  }, [points, ready]);

  // ---- rings: layer pulses on fresh items + the selection ring (none under reduced motion) ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    if (reducedMotion) {
      g.ringsData([]);
      return;
    }
    const rings: RingDatum[] = [];
    for (const p of points) {
      if (!p.pulse) continue;
      rings.push({
        lat: p.item.lat,
        lng: p.item.lon,
        rgb: hexToRgb(p.pulse.color),
        maxR: p.pulse.maxRadius,
        speed: p.pulse.maxRadius / 1.6, // each ripple takes ~1.6 s to fade out
        period: p.pulse.periodMs,
      });
    }
    const sel = points.find((p) => p.selected);
    if (sel) rings.push({ lat: sel.item.lat, lng: sel.item.lon, ...SELECTION_RING });
    g.ringsData(rings);
  }, [points, ready, reducedMotion]);

  // ---- selection: fly to it, stop rotating while something is open ----
  const selected = points.find((p) => p.selected) ?? null;
  const selectedKey = selected?.key ?? null;
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    const controls = g.controls();
    if (selected) {
      introPlayed.current = true;
      clearTimeout(introTimer.current);
      if (controls) controls.autoRotate = false;
      clearTimeout(resumeTimer.current);
      g.pointOfView(
        { lat: selected.item.lat, lng: selected.item.lon, altitude: isNarrow(boxRef.current) ? 2.4 : 1.6 },
        reducedMotion ? 0 : 900
      );
    } else {
      if (controls && !reducedMotion && introPlayed.current) controls.autoRotate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, ready, reducedMotion]);

  // ---- fly-in intro, once per session, toward the visitor's region ----
  const [geoTimedOut, setGeoTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGeoTimedOut(true), 1500);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready || introPlayed.current) return;
    if (!geoSettled && !geoTimedOut) return;
    introPlayed.current = true;

    const controls = g.controls();
    if (reducedMotion || introSeen() || selectedRef.current) {
      if (controls && !reducedMotion && !selectedRef.current) controls.autoRotate = true;
      return;
    }
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch {}

    const target = geo ? { lat: geo.lat, lng: geo.lon } : { lat: 20, lng: 10 };
    g.pointOfView({ ...target, altitude: viewAlt(boxRef.current) }, INTRO_MS);
    introTimer.current = setTimeout(() => {
      lastPov = g.pointOfView();
      if (controls && !live.current.reducedMotion && !selectedRef.current) controls.autoRotate = true;
    }, INTRO_MS + 100);
  }, [ready, geoSettled, geoTimedOut, geo, reducedMotion]);

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="h-full w-full" aria-label="Interactive 3D globe" role="img" />
      {error && (
        <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-yellow-900/70 px-3 py-1.5 text-sm text-yellow-200">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
