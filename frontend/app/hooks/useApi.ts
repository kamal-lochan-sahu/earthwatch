export const API =
  process.env.NEXT_PUBLIC_API_URL || "https://earthwatch-backend-nx4u.onrender.com";

/** GET a backend endpoint and return parsed JSON. Throws on network error or non-2xx. */
export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}
