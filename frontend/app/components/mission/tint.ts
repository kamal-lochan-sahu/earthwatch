import type { TintSpec } from "../../layers/types";

/**
 * Paint colour washes into a canvas. `at(x, y)` maps a canvas pixel to [lon, lat] in degrees,
 * or null where there is no map (outside the 2D projection). Several tints are composited "over".
 */
export function rasterizeTints(
  tints: TintSpec[],
  w: number,
  h: number,
  at: (x: number, y: number) => [number, number] | null
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ll = at(x + 0.5, y + 0.5);
      if (!ll) continue;
      let r = 0, g = 0, b = 0, a = 0;
      for (const t of tints) {
        const ta = Math.max(0, Math.min(1, t.alphaAt(ll[1], ll[0])));
        if (ta <= 0) continue;
        const out = ta + a * (1 - ta);
        r = (r * a * (1 - ta) + t.rgb[0] * ta) / out;
        g = (g * a * (1 - ta) + t.rgb[1] * ta) / out;
        b = (b * a * (1 - ta) + t.rgb[2] * ta) / out;
        a = out;
      }
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Equirectangular pixel -> [lon, lat] (how a globe texture is laid out). */
export const equirect = (w: number, h: number) => (x: number, y: number): [number, number] =>
  [-180 + (360 * x) / w, 90 - (180 * y) / h];
