"""
EarthWatch — aurora oval + geomagnetic activity (NOAA Space Weather Prediction Center).

Two public SWPC feeds, no key:
  * OVATION Prime aurora forecast — a 360 x 181 grid (1-degree cells, longitude 0..359, latitude
    -90..90) of the probability, in percent, of visible aurora. Published every 5 minutes for the
    next ~30 minutes. ~1 MB of JSON, so it is fetched once, cached for 5 minutes and shrunk to a
    2-degree grid (the strongest cell of each 2 x 2 block, so a narrow oval keeps its peaks):
    91 rows x 180 columns of whole percents, ~40 KB for the browser.
  * Planetary K index (3-hour intervals, last few days) — the latest value gives Kp and the
    NOAA G-scale of the current geomagnetic storm. It is optional: if it is down the aurora grid
    is still served, with `kp: null`.

This layer has no point items; it answers with a grid the frontend paints as a colour wash:
    {layer, source, url, updated_at, observed_at, forecast_at, stale, count: 0, items: [],
     counts: {max_pct, north_max_pct, south_max_pct, kp, kp_time, g_scale},
     grid: {lat_min, lon_min, step, rows, cols, values: [[...] per latitude row, south -> north]}}
`updated_at` is when we fetched; `stale` is true when we only have an old copy (NOAA down) or when
NOAA itself stopped publishing.
"""
import time

import requests

from data.cache import ttl_cache
from data.hazards.common import iso_from_ms, num, parse_iso_ms

OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
SOURCE_URL = "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast"
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

FULL_COLS, FULL_ROWS = 360, 181
STEP = 2
COLS, ROWS = FULL_COLS // STEP, FULL_ROWS // STEP + 1  # 180 x 91

TTL_SECONDS = 300                              # NOAA publishes a new forecast every 5 minutes
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)   # our copy is older than this -> NOAA was unreachable
UPSTREAM_STALE_SECONDS = 3 * 3600              # NOAA's own forecast time is older than this -> stalled
MIN_CELLS = FULL_COLS * FULL_ROWS // 2         # a grid with fewer valid cells than this is not trusted


def g_scale(kp):
    """NOAA geomagnetic storm scale from Kp: Kp 5 -> G1 ... Kp 9 -> G5 (below 5 -> 0)."""
    if kp is None or kp < 5:
        return 0
    return min(5, int(kp) - 4)


def _grid_from_payload(payload):
    """OVATION JSON -> (observed_ms, forecast_ms, 2-degree grid), or None if it is not what we expect."""
    if not isinstance(payload, dict):
        return None
    coords = payload.get("coordinates")
    if not isinstance(coords, list):
        return None
    full = [[0] * FULL_COLS for _ in range(FULL_ROWS)]
    seen = set()
    for row in coords:
        if not isinstance(row, (list, tuple)) or len(row) < 3:
            continue
        lon, lat, val = num(row[0]), num(row[1]), num(row[2])
        if lon is None or lat is None or val is None:
            continue
        lon, lat = int(lon), int(lat)
        if not (0 <= lon < FULL_COLS and -90 <= lat <= 90):
            continue
        seen.add((lon, lat))
        full[lat + 90][lon] = max(0, min(100, int(round(val))))
    if len(seen) < MIN_CELLS:
        return None
    grid = []
    for r in range(ROWS):
        lo = r * STEP
        rows = full[lo: lo + STEP]            # the last row (lat 90) is alone
        grid.append([max(max(block[c * STEP: c * STEP + STEP]) for block in rows) for c in range(COLS)])
    return (
        parse_iso_ms(payload.get("Observation Time")),
        parse_iso_ms(payload.get("Forecast Time")),
        grid,
    )


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "aurora-ovation", stale_ok=True)
def fetch_aurora_grid():
    """The shrunk aurora grid, or {"error": ...} (the cache then serves the last good copy)."""
    last_error = "unknown error"
    for attempt in range(2):
        try:
            r = requests.get(OVATION_URL, headers={"User-Agent": USER_AGENT}, timeout=15)
            if r.status_code == 200:
                parsed = _grid_from_payload(r.json())
                if parsed is None:
                    return {"error": "NOAA aurora forecast had an unexpected format"}
                observed_ms, forecast_ms, grid = parsed
                return {"fetched_at": time.time(), "observed_ms": observed_ms, "forecast_ms": forecast_ms, "grid": grid}
            last_error = f"HTTP {r.status_code}"
            if r.status_code != 429 and r.status_code < 500:
                break
        except (requests.RequestException, ValueError) as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(1)
    return {"error": f"NOAA aurora forecast unavailable ({last_error})"}


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _kp_row(row):
    """(kp, time_ms) from one row of the K-index feed, in either its list-of-dicts or table form."""
    if isinstance(row, dict):
        for key in ("Kp", "kp_index", "estimated_kp"):
            kp = num(row.get(key))
            if kp is not None:
                return kp, parse_iso_ms(row.get("time_tag"))
        return None
    if isinstance(row, (list, tuple)) and len(row) >= 2:
        kp = num(_as_float(row[1]))  # the older table form carries the value as text; its header row drops out
        return (kp, parse_iso_ms(row[0])) if kp is not None else None
    return None


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "aurora-kp", stale_ok=True)
def fetch_kp():
    """Latest planetary K index as {"kp", "time_ms"}, or {"error": ...}."""
    try:
        r = requests.get(KP_URL, headers={"User-Agent": USER_AGENT}, timeout=10)
        if r.status_code != 200:
            return {"error": f"HTTP {r.status_code}"}
        rows = r.json()
    except (requests.RequestException, ValueError) as e:
        return {"error": type(e).__name__}
    if not isinstance(rows, list):
        return {"error": "unexpected K-index format"}
    for row in reversed(rows):
        parsed = _kp_row(row)
        if parsed and 0 <= parsed[0] <= 9:
            return {"kp": round(parsed[0], 2), "time_ms": parsed[1]}
    return {"error": "no usable K-index value"}


def build_aurora_response(now=None):
    data = fetch_aurora_grid()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    grid = data["grid"]
    equator = 90 // STEP  # row of latitude 0
    kp_data = fetch_kp()
    kp = None if "error" in kp_data else kp_data["kp"]
    kp_ms = None if "error" in kp_data else kp_data["time_ms"]
    forecast_ms = data["forecast_ms"]
    upstream_old = forecast_ms is not None and now - forecast_ms / 1000 > UPSTREAM_STALE_SECONDS
    return {
        "layer": "aurora",
        "source": "NOAA SWPC OVATION",
        "url": SOURCE_URL,
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "observed_at": iso_from_ms(data["observed_ms"]) if data["observed_ms"] is not None else None,
        "forecast_at": iso_from_ms(forecast_ms) if forecast_ms is not None else None,
        "stale": now - data["fetched_at"] > STALE_AFTER_SECONDS or upstream_old,
        "count": 0,
        "items": [],
        "counts": {
            "max_pct": max(max(row) for row in grid),
            "north_max_pct": max(max(row) for row in grid[equator + 1:]),
            "south_max_pct": max(max(row) for row in grid[:equator]),
            "kp": kp,
            "kp_time": iso_from_ms(kp_ms) if kp_ms is not None else None,
            "g_scale": g_scale(kp),
        },
        "grid": {"lat_min": -90, "lon_min": 0, "step": STEP, "rows": ROWS, "cols": COLS, "values": grid},
    }
