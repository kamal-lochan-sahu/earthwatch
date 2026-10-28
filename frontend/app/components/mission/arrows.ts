import type { ArrowSpec } from "../../layers/types";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** [lat, lon] reached from (lat, lon) after `distDeg` degrees of arc along a great circle. */
export function destination(lat: number, lon: number, bearingDeg: number, distDeg: number): [number, number] {
  const p1 = rad(lat);
  const l1 = rad(lon);
  const b = rad(bearingDeg);
  const d = rad(distDeg);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), ((deg(l2) + 540) % 360) - 180];
}

/**
 * One arrow as a single polyline of [lat, lon] points: tail -> tip -> left barb -> tip -> right barb.
 * (A path can retrace itself, so the head needs no extra geometry.)
 */
export function arrowPath(lat: number, lon: number, a: ArrowSpec): [number, number][] {
  const tip = destination(lat, lon, a.bearing, a.lengthDeg);
  const barb = a.lengthDeg * 0.42;
  const left = destination(tip[0], tip[1], a.bearing + 150, barb);
  const right = destination(tip[0], tip[1], a.bearing - 150, barb);
  return [[lat, lon], tip, left, tip, right];
}

/** True when the path jumps across the antimeridian (a flat map would draw a line across the world). */
export function crossesAntimeridian(path: [number, number][]): boolean {
  for (let i = 1; i < path.length; i++) if (Math.abs(path[i][1] - path[i - 1][1]) > 180) return true;
  return false;
}
