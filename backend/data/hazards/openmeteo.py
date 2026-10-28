"""
EarthWatch — one shared client for Open-Meteo's multi-location requests.

Wind, ocean waves and river levels all ask Open-Meteo about a whole grid of points. Doing that
point by point would burn the free daily quota (and Render's shared IP is already rate-limited),
so every layer goes through `fetch_points`: the points are sent as comma-separated coordinates,
a few dozen per request, and the answer is returned aligned with the input list.

Open-Meteo snaps the returned coordinates to its own grid, so callers must match results to
points by POSITION, never by the coordinates echoed back.
"""
import time

import requests

CHUNK_SIZE = 80          # coordinates per request: keeps the URL short and the request light
TIMEOUT_SECONDS = 20
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"


def _reason(response) -> str:
    """Open-Meteo explains errors as {\"error\": true, \"reason\": \"...\"}."""
    try:
        body = response.json()
        reason = body.get("reason") if isinstance(body, dict) else None
        return str(reason)[:80] if reason else ""
    except Exception:
        return ""


def _fetch_chunk(url: str, chunk: list, params: dict):
    """One request for up to CHUNK_SIZE points -> list of per-point dicts, or {\"error\": ...}."""
    query = dict(params)
    query["latitude"] = ",".join(str(lat) for lat, _ in chunk)
    query["longitude"] = ",".join(str(lon) for _, lon in chunk)
    last_error = "unknown error"
    for attempt in range(2):
        try:
            r = requests.get(url, params=query, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS)
            if r.status_code == 200:
                payload = r.json()
                rows = [payload] if isinstance(payload, dict) else payload
                if isinstance(rows, list) and len(rows) == len(chunk):
                    return rows
                last_error = "unexpected response shape"
                break
            last_error = f"HTTP {r.status_code}"
            reason = _reason(r)
            if reason:
                last_error += f": {reason}"
            if r.status_code < 500:
                break  # 4xx incl. 429: a limit will not clear in 2 s, do not hammer it
        except Exception as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(2)
    return {"error": f"Open-Meteo unavailable ({last_error})"}


def fetch_points(url: str, points: list, params: dict):
    """
    Query `url` for every (lat, lon) in `points`, chunked. Returns a list aligned with `points`
    (each entry is that point's Open-Meteo JSON object), or {\"error\": ...} when ANY chunk fails —
    a half-filled globe is worse than serving the last complete copy from the cache.
    """
    results: list = []
    for i in range(0, len(points), CHUNK_SIZE):
        chunk = points[i:i + CHUNK_SIZE]
        rows = _fetch_chunk(url, chunk, params)
        if isinstance(rows, dict):
            return rows
        results.extend(rows)
    return results
