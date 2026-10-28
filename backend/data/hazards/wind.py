"""
EarthWatch — wind layer (Open-Meteo).

A coarse global grid (every 15 degrees, poles left out) of current 10 m wind: speed, direction
and gusts. One batched request set feeds the whole globe and is cached for 3 hours (wind moves
slowly at this resolution, and the free Open-Meteo quota is better spent elsewhere); if Open-Meteo
rate-limits us, the last good copy is served instead and flagged `stale`.

Response envelope (shared with the hazard layers):
    {layer, source, updated_at, stale, count, counts, items: [{id, lat, lon, title, severity,
     value, unit, time, url, source, direction, bearing, gusts}]}
`direction` is where the wind blows FROM (meteorological); `bearing` is where it blows TOWARDS,
which is what an arrow on a map points along.
"""
import time

from data.cache import ttl_cache
from data.hazards.common import iso_from_ms, num, parse_iso_ms
from data.hazards.openmeteo import fetch_points

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE_URL = "https://open-meteo.com/en/docs"

GRID_STEP = 15
LATITUDES = list(range(-75, 76, GRID_STEP))      # 11 rows
LONGITUDES = list(range(-180, 180, GRID_STEP))   # 24 columns
GRID = [(lat, lon) for lat in LATITUDES for lon in LONGITUDES]   # 264 points

TTL_SECONDS = 3 * 3600
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)

_COMPASS = ("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")


def compass(degrees: float) -> str:
    return _COMPASS[int((degrees % 360) / 22.5 + 0.5) % 16]


def severity_for_speed(kmh: float) -> str:
    """Shared severity scale; the frontend legend uses the same thresholds."""
    if kmh >= 75:
        return "extreme"   # storm force and above
    if kmh >= 50:
        return "moderate"  # gale
    if kmh >= 30:
        return "mild"      # fresh to strong breeze
    return "info"


def _item(lat: int, lon: int, row) -> dict | None:
    current = row.get("current") if isinstance(row, dict) else None
    if not isinstance(current, dict):
        return None
    speed = num(current.get("wind_speed_10m"))
    direction = num(current.get("wind_direction_10m"))
    if speed is None or direction is None:
        return None
    gusts = num(current.get("wind_gusts_10m"))
    direction = direction % 360
    time_ms = parse_iso_ms(current.get("time"))
    speed = round(speed, 1)
    return {
        "id": f"{lat:+d},{lon:+d}",
        "lat": lat,
        "lon": lon,
        "title": f"Wind {speed:g} km/h from {compass(direction)}",
        "severity": severity_for_speed(speed),
        "value": speed,
        "unit": "km/h",
        "time": iso_from_ms(time_ms) if time_ms is not None else None,
        "url": SOURCE_URL,
        "source": "Open-Meteo",
        "category": "wind",
        "direction": round(direction),
        "bearing": round((direction + 180) % 360),
        "gusts": round(gusts, 1) if gusts is not None else None,
    }


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "wind-grid-15", stale_ok=True)
def fetch_wind_grid():
    """The whole grid, or {"error": ...} (the cache then serves the last good copy)."""
    rows = fetch_points(
        OPEN_METEO_URL,
        GRID,
        {"current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m", "wind_speed_unit": "kmh"},
    )
    if isinstance(rows, dict):
        return rows
    items = [it for (lat, lon), row in zip(GRID, rows) if (it := _item(lat, lon, row))]
    if not items:
        return {"error": "Open-Meteo returned no usable wind data"}
    return {"fetched_at": time.time(), "items": items}


def build_wind_response(now=None):
    data = fetch_wind_grid()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    items = data["items"]
    return {
        "layer": "wind",
        "source": "Open-Meteo",
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "stale": now - data["fetched_at"] > STALE_AFTER_SECONDS,
        "count": len(items),
        "counts": {
            "max_kmh": max(it["value"] for it in items),
            "strong": sum(1 for it in items if it["value"] >= 50),
        },
        "items": items,
    }
