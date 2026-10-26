"""
EarthWatch — small helpers shared by the hazard layers (EONET, GDACS, ...).

Every hazard layer answers with the same envelope the earthquakes layer uses:
    {layer, source, updated_at, stale, count, counts, items: [{id, lat, lon, title, severity,
     value, unit, time, url, source, category, ...extras}]}
and the same four-step severity scale: info < mild < moderate < extreme.
"""
import math
from datetime import datetime, timezone

SEVERITIES = ("info", "mild", "moderate", "extreme")
_RANK = {name: i for i, name in enumerate(SEVERITIES)}


def severity_rank(severity) -> int:
    """0 (info) .. 3 (extreme); unknown values rank as info."""
    return _RANK.get(severity, 0)


def max_severity(*severities) -> str:
    return max(severities, key=severity_rank)


def num(value):
    """A finite float, or None (upstream feeds use null / strings / NaN for 'unknown')."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    f = float(value)
    return f if math.isfinite(f) else None


def valid_coords(lat, lon) -> bool:
    return lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180


def parse_iso_ms(value):
    """ISO-8601 text -> epoch milliseconds (naive timestamps are read as UTC), or None."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def iso_from_ms(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def http_url(value):
    """Only http(s) links are passed on to the frontend."""
    return value if isinstance(value, str) and value.startswith(("https://", "http://")) else None
