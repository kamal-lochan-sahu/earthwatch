export const API =
  process.env.NEXT_PUBLIC_API_URL || "https://earthwatch-backend-nx4u.onrender.com";

/** GET a backend endpoint and return parsed JSON. Throws on network error or non-2xx. */
export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

const inflight = new Map<string, Promise<any>>();
const recent = new Map<string, { at: number; data: any }>();

/**
 * Like apiGet, but concurrent callers share one request and a fresh result is reused for
 * `maxAgeMs`. Keeps the shared free-tier backend from being asked twice for the same data
 * (e.g. DataContext and the Mission-view layer store both want /api/temperature/global).
 */
export function apiGetShared<T = any>(path: string, maxAgeMs = 30_000): Promise<T> {
  const hit = recent.get(path);
  if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data as T);
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;
  const req = apiGet<T>(path)
    .then((data) => {
      recent.set(path, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, req);
  return req;
}
