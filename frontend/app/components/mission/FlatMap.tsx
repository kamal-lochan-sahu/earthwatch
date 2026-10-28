"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { select as d3select } from "d3-selection";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import type { UnitCtx } from "../../layers/types";
import type { MapPoint } from "./points";
import { arrowPath, crossesAntimeridian } from "./arrows";

interface Props {
  points: MapPoint[];
  onSelect: (key: string | null) => void;
  units: UnitCtx;
  reducedMotion: boolean;
  labels: { zoomIn: string; zoomOut: string; zoomReset: string };
}

const topo = world as unknown as Topology<{ land: GeometryCollection; countries: GeometryCollection }>;
const LAND = feature(topo, topo.objects.countries);
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b);

/**
 * Dependency-light 2D fallback for devices without WebGL: bundled world outline (no map
 * tiles, no network), same layers/points as the globe, pan + zoom.
 */
export default function FlatMap({ points, onSelect, units, reducedMotion, labels }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [tf, setTf] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ p: MapPoint; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: Math.max(el.clientWidth, 200), h: Math.max(el.clientHeight, 200) })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { projection, landPath, borderPath } = useMemo(() => {
    const proj = geoNaturalEarth1().fitSize([size.w, size.h], { type: "Sphere" });
    const path = geoPath(proj);
    return {
      projection: proj,
      landPath: path(LAND) ?? "",
      borderPath: path(BORDERS) ?? "",
    };
  }, [size]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([[0, 0], [size.w, size.h]])
      .extent([[0, 0], [size.w, size.h]])
      .on("zoom", (e) => setTf(e.transform));
    zoomRef.current = z;
    d3select(svg).call(z);
    return () => {
      d3select(svg).on(".zoom", null);
    };
  }, [size]);

  const zoomBy = (k: number) => {
    if (svgRef.current && zoomRef.current) d3select(svgRef.current).call(zoomRef.current.scaleBy, k);
  };
  const zoomReset = () => {
    if (svgRef.current && zoomRef.current)
      d3select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const placed = useMemo(
    () =>
      points
        .map((p) => ({ p, xy: projection([p.item.lon, p.item.lat]) }))
        .filter((d): d is { p: MapPoint; xy: [number, number] } => !!d.xy)
        // Selected on top, then bigger markers above smaller ones (e.g. strong quakes over weak).
        .sort(
          (a, b) =>
            Number(a.p.selected) - Number(b.p.selected) ||
            (a.p.item.size ?? 1) - (b.p.item.size ?? 1)
        ),
    [points, projection]
  );

  // Direction arrows (wind) as projected polylines; the few that wrap the date line are skipped.
  const arrows = useMemo(() => {
    const out: { key: string; color: string; d: string }[] = [];
    for (const p of points) {
      if (!p.arrow) continue;
      const path = arrowPath(p.item.lat, p.item.lon, p.arrow);
      if (crossesAntimeridian(path)) continue;
      const xy = path.map(([la, lo]) => projection([lo, la]));
      if (xy.some((q) => !q)) continue;
      out.push({ key: p.key, color: p.arrow.color, d: "M" + (xy as [number, number][]).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L") });
    }
    return out;
  }, [points, projection]);

  const tip = hover ? hover.p.def.tooltip(hover.p.item, units) : null;

  return (
    <div ref={boxRef} className="absolute inset-0 bg-[#05070d]">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="img"
        aria-label="2D world map"
        className="block touch-none select-none"
      >
        <rect width={size.w} height={size.h} fill="#05070d" onClick={() => onSelect(null)} />
        <g transform={tf.toString()}>
          <path d={landPath} fill="#111a2b" stroke="none" onClick={() => onSelect(null)} />
          <path d={borderPath} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5 / tf.k} />
          {arrows.map((a) => (
            <path
              key={a.key}
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth={1.4 / tf.k}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ))}
          {placed.map(({ p, xy }) => {
            const base = Math.max(2.2, 4 * (p.item.size ?? 1)); // px at zoom 1
            return (
              <g key={p.key} transform={`translate(${xy[0]},${xy[1]})`}>
                {p.pulse && !reducedMotion && (
                  <circle
                    r={base / tf.k}
                    fill="none"
                    stroke={p.pulse.color}
                    strokeWidth={1.5 / tf.k}
                    pointerEvents="none"
                  >
                    <animate attributeName="r" from={base / tf.k} to={(base + 6 + p.pulse.maxRadius * 3) / tf.k} dur="2.2s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" from="0.9" to="0" dur="2.2s" repeatCount="indefinite" />
                  </circle>
                )}
                {p.selected && (
                  <circle r={11 / tf.k} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.5 / tf.k} />
                )}
                <circle
                  r={(p.selected ? base * 1.5 : base) / tf.k}
                  fill={p.color}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={0.8 / tf.k}
                  tabIndex={0}
                  role="button"
                  aria-label={p.item.title}
                  aria-pressed={p.selected}
                  className="cursor-pointer outline-none focus-visible:stroke-white"
                  onClick={(e) => { e.stopPropagation(); onSelect(p.key); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.key); }
                  }}
                  onMouseEnter={(e) => setHover({ p, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover({ p, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(null)}
                />
                {p.selected && (
                  <text
                    x={9 / tf.k} y={4 / tf.k} fill="#fff" fontSize={13 / tf.k}
                    style={{ paintOrder: "stroke" }} stroke="#05070d" strokeWidth={3 / tf.k}
                  >
                    {p.item.title}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {tip && hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-gray-800 p-2 text-[13px] text-white shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <b>{tip.title}</b>
          {tip.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      <div className="absolute right-3 top-3 flex flex-col gap-1 md:bottom-12 md:left-3 md:right-auto md:top-auto md:flex-row">
        {[
          { l: "+", a: labels.zoomIn, f: () => zoomBy(1.6) },
          { l: "−", a: labels.zoomOut, f: () => zoomBy(1 / 1.6) },
          { l: "⟲", a: labels.zoomReset, f: zoomReset },
        ].map((b) => (
          <button
            key={b.a}
            onClick={b.f}
            aria-label={b.a}
            title={b.a}
            className="h-8 w-8 rounded-full border border-white/10 bg-gray-900/80 text-gray-200 backdrop-blur hover:border-green-500"
          >
            {b.l}
          </button>
        ))}
      </div>
    </div>
  );
}
