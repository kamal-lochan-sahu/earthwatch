"""
EarthWatch — ocean waves layer (Open-Meteo Marine API).

Significant wave height, mean wave direction and period at open-ocean points (a 15-degree
grid shifted half a cell from the wind grid so the two layers do not sit on top of each other,
keeping only points that sit well away from any coast: the marine model has no data on land
and is unreliable right at the shore). The list was generated once from the Natural Earth land
polygons, so there is no land mask to ship at runtime. One batched request set feeds the whole
globe and is cached for 3 hours; if Open-Meteo rate-limits us the last good copy is served and
flagged `stale`. Points with no data (e.g. under sea ice) are simply left out.

Response envelope (shared with the other layers):
    {layer, source, updated_at, stale, count, counts, items: [{id, lat, lon, title, severity, value,
     unit, time, url, source, direction, period}]}
`value` is the significant wave height in metres; `direction` is where the waves come FROM.
"""
import time

from data.cache import ttl_cache
from data.hazards.common import iso_from_ms, num, parse_iso_ms
from data.hazards.openmeteo import fetch_points
from data.hazards.wind import compass

OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
SOURCE_URL = "https://open-meteo.com/en/docs/marine-weather-api"

# (lat, lon) of open-ocean grid points, every 15 degrees (offset 7.5 from the wind grid), >= ~4 degrees from land.
GRID = [
    (-52.5, -172.5), (-52.5, -157.5), (-52.5, -142.5), (-52.5, -127.5), (-52.5, -112.5),
    (-52.5, -97.5), (-52.5, -82.5), (-52.5, -52.5), (-52.5, -37.5), (-52.5, -22.5),
    (-52.5, -7.5), (-52.5, 7.5), (-52.5, 22.5), (-52.5, 37.5), (-52.5, 52.5), (-52.5, 67.5),
    (-52.5, 82.5), (-52.5, 97.5), (-52.5, 112.5), (-52.5, 127.5), (-52.5, 142.5),
    (-52.5, 157.5), (-52.5, 172.5), (-37.5, -172.5), (-37.5, -157.5), (-37.5, -142.5),
    (-37.5, -127.5), (-37.5, -112.5), (-37.5, -97.5), (-37.5, -82.5), (-37.5, -37.5),
    (-37.5, -22.5), (-37.5, -7.5), (-37.5, 7.5), (-37.5, 37.5), (-37.5, 52.5), (-37.5, 67.5),
    (-37.5, 82.5), (-37.5, 97.5), (-37.5, 127.5), (-37.5, 157.5), (-22.5, -172.5),
    (-22.5, -157.5), (-22.5, -142.5), (-22.5, -127.5), (-22.5, -112.5), (-22.5, -97.5),
    (-22.5, -82.5), (-22.5, -22.5), (-22.5, -7.5), (-22.5, 7.5), (-22.5, 52.5), (-22.5, 67.5),
    (-22.5, 82.5), (-22.5, 97.5), (-22.5, 157.5), (-22.5, 172.5), (-7.5, -172.5),
    (-7.5, -157.5), (-7.5, -142.5), (-7.5, -127.5), (-7.5, -112.5), (-7.5, -97.5),
    (-7.5, -22.5), (-7.5, -7.5), (-7.5, 7.5), (-7.5, 52.5), (-7.5, 67.5), (-7.5, 82.5),
    (-7.5, 97.5), (-7.5, 157.5), (-7.5, 172.5), (7.5, -172.5), (7.5, -157.5), (7.5, -142.5),
    (7.5, -127.5), (7.5, -112.5), (7.5, -97.5), (7.5, -37.5), (7.5, -22.5), (7.5, 67.5),
    (7.5, 127.5), (7.5, 142.5), (7.5, 157.5), (7.5, 172.5), (22.5, -172.5), (22.5, -157.5),
    (22.5, -142.5), (22.5, -127.5), (22.5, -82.5), (22.5, -52.5), (22.5, -37.5), (22.5, -22.5),
    (22.5, 127.5), (22.5, 142.5), (22.5, 157.5), (22.5, 172.5), (37.5, -172.5), (37.5, -157.5),
    (37.5, -142.5), (37.5, -67.5), (37.5, -52.5), (37.5, -37.5), (37.5, -22.5), (37.5, 157.5),
    (37.5, 172.5), (52.5, -172.5), (52.5, -142.5), (52.5, -37.5), (52.5, -22.5), (52.5, 172.5),
]

TTL_SECONDS = 3 * 3600
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)


def severity_for_height(metres: float) -> str:
    """Shared severity scale (roughly the Douglas sea scale); the frontend legend uses the same thresholds."""
    if metres >= 6:
        return "extreme"   # high seas and above
    if metres >= 4:
        return "moderate"  # very rough
    if metres >= 2.5:
        return "mild"      # rough
    return "info"


def _item(lat: float, lon: float, row):
    current = row.get("current") if isinstance(row, dict) else None
    if not isinstance(current, dict):
        return None
    height = num(current.get("wave_height"))
    if height is None or height < 0:
        return None
    direction = num(current.get("wave_direction"))
    period = num(current.get("wave_period"))
    time_ms = parse_iso_ms(current.get("time"))
    height = round(height, 1)
    title = f"Waves {height:g} m"
    if direction is not None:
        title += f" from {compass(direction)}"
    if period is not None:
        title += f" · {period:g} s"
    return {
        "id": f"{lat:+g},{lon:+g}",
        "lat": lat,
        "lon": lon,
        "title": title,
        "severity": severity_for_height(height),
        "value": height,
        "unit": "m",
        "time": iso_from_ms(time_ms) if time_ms is not None else None,
        "url": SOURCE_URL,
        "source": "Open-Meteo Marine",
        "category": "waves",
        "direction": round(direction % 360) if direction is not None else None,
        "period": round(period, 1) if period is not None else None,
    }


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "waves-grid-15", stale_ok=True)
def fetch_wave_grid():
    """All ocean points, or {"error": ...} (the cache then serves the last good copy)."""
    rows = fetch_points(
        OPEN_METEO_MARINE_URL,
        GRID,
        {"current": "wave_height,wave_direction,wave_period"},
    )
    if isinstance(rows, dict):
        return rows
    items = [it for (lat, lon), row in zip(GRID, rows) if (it := _item(lat, lon, row))]
    if not items:
        return {"error": "Open-Meteo returned no usable wave data"}
    return {"fetched_at": time.time(), "items": items}


def build_waves_response(now=None):
    data = fetch_wave_grid()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    items = data["items"]
    return {
        "layer": "waves",
        "source": "Open-Meteo Marine",
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "stale": now - data["fetched_at"] > STALE_AFTER_SECONDS,
        "count": len(items),
        "counts": {
            "max_m": max(it["value"] for it in items),
            "rough": sum(1 for it in items if it["value"] >= 2.5),
        },
        "items": items,
    }
