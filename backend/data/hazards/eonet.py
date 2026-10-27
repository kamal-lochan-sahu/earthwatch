"""
EarthWatch — wildfires, volcanoes, icebergs and severe storms from NASA EONET.

ONE upstream request (all four categories, open events only) feeds three layers + the storms
merge. The result is cached for 15 minutes and, if NASA hiccups, the last good copy is served
(flagged `stale` once it is old) — same policy as the earthquakes layer.

EONET v3 event: {id, title, link, categories: [{id, title}], sources: [{id, url}],
                 geometry: [{date, type: Point|Polygon, coordinates, magnitudeValue, magnitudeUnit}]}
The newest geometry entry is the event's current position / size.
"""
import logging
import re
import time

import requests

from data.cache import ttl_cache
from data.hazards.common import (
    http_url, iso_from_ms, num, parse_iso_ms, valid_coords,
)

EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"
EONET_CATEGORIES = "wildfires,volcanoes,severeStorms,seaLakeIce"
log = logging.getLogger("earthwatch.hazards")

USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

FEED_TTL_SECONDS = 900          # EONET changes slowly; 15 min is plenty and keeps us polite.
STALE_AFTER_SECONDS = 2700      # a copy older than this is flagged stale in the envelope.
MAX_ITEMS = 600                 # per layer; most severe, then newest, are kept.

DAY = 86400
# EONET keeps events "open" long after the last update; drop the ones that went quiet.
MAX_AGE_SECONDS = {"wildfire": 14 * DAY, "storm": 10 * DAY, "volcano": 180 * DAY, "iceberg": 120 * DAY}

# Planned / controlled burns are not hazards (EONET lists them from the US IRWIN feed).
_PLANNED_BURN = re.compile(r"\bprescribed\b|\brx\b", re.IGNORECASE)

HECTARES_PER_ACRE = 0.404686
KM2_PER_NM2 = 3.4299
KMH_PER_KNOT = 1.852


def severity_for_wildfire(hectares):
    if hectares is None:
        return "info"
    if hectares >= 40_000:
        return "extreme"
    if hectares >= 4_000:
        return "moderate"
    if hectares >= 400:
        return "mild"
    return "info"


def severity_for_wind_kmh(kmh):
    """Tropical-cyclone scale: tropical storm / hurricane / major hurricane thresholds."""
    if kmh is None:
        return "info"
    if kmh >= 178:
        return "extreme"
    if kmh >= 119:
        return "moderate"
    if kmh >= 63:
        return "mild"
    return "info"


def _centroid(ring):
    pts = []
    for p in ring or []:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            lon, lat = num(p[0]), num(p[1])
            if lon is not None and lat is not None:
                pts.append((lon, lat))
    if not pts:
        return None
    lons = [p[0] for p in pts]
    if max(lons) - min(lons) > 180:          # polygon crosses the antimeridian
        lons = [lo + 360 if lo < 0 else lo for lo in lons]
    lon = sum(lons) / len(lons)
    lon = lon - 360 if lon > 180 else lon
    return sum(p[1] for p in pts) / len(pts), lon


def _position(geom):
    """(lat, lon) of a Point / Polygon geometry entry, or None."""
    coords = geom.get("coordinates")
    kind = geom.get("type")
    if kind == "Point" and isinstance(coords, (list, tuple)) and len(coords) >= 2:
        lon, lat = num(coords[0]), num(coords[1])
        return (lat, lon) if valid_coords(lat, lon) else None
    if kind == "Polygon" and isinstance(coords, (list, tuple)) and coords:
        c = _centroid(coords[0])
        return c if c and valid_coords(*c) else None
    return None


def _kind_for(event):
    """EONET category -> our layer kind (None = not something we show)."""
    ids = {c.get("id") for c in event.get("categories") or [] if isinstance(c, dict)}
    title = str(event.get("title") or "")
    if "wildfires" in ids:
        return "wildfire"
    if "volcanoes" in ids:
        return "volcano"
    if "severeStorms" in ids:
        return "storm"
    if "seaLakeIce" in ids and "iceberg" in title.lower():
        return "iceberg"
    return None


def _parse_event(event, now_ms):
    kind = _kind_for(event)
    event_id = str(event.get("id") or "").strip()
    if not kind or not event_id or event.get("closed"):
        return None
    if kind == "wildfire" and _PLANNED_BURN.search(str(event.get("title") or "")):
        return None

    dated = []
    for g in event.get("geometry") or []:
        if not isinstance(g, dict):
            continue
        t, pos = parse_iso_ms(g.get("date")), _position(g)
        if t is not None and pos is not None:
            dated.append((t, pos, g))
    if not dated:
        return None
    dated.sort(key=lambda d: d[0])
    first_t = dated[0][0]
    last_t, (lat, lon), last_geom = dated[-1]
    if last_t > now_ms + 3600_000 or now_ms - last_t > MAX_AGE_SECONDS[kind] * 1000:
        return None  # from the future (bad data) or gone quiet

    magnitude, unit = num(last_geom.get("magnitudeValue")), str(last_geom.get("magnitudeUnit") or "").strip().lower()
    value, out_unit, severity = None, None, "info"

    if kind == "wildfire":
        if magnitude is not None and magnitude > 0:
            if unit in ("acres", "acre", "ac"):
                value, out_unit = round(magnitude * HECTARES_PER_ACRE, 1), "ha"
            elif unit in ("ha", "hectares", "hectare"):
                value, out_unit = round(magnitude, 1), "ha"
        severity = severity_for_wildfire(value)
    elif kind == "storm":
        if magnitude is not None and magnitude > 0:
            if unit in ("kts", "kt", "knots", "knot"):
                value, out_unit = round(magnitude * KMH_PER_KNOT), "km/h"
            elif unit in ("km/h", "kmh", "kph"):
                value, out_unit = round(magnitude), "km/h"
        severity = severity_for_wind_kmh(value)
    elif kind == "volcano":
        severity = "mild"   # EONET lists a volcano only while it is erupting / in notable unrest
    elif kind == "iceberg":
        if magnitude is not None and magnitude > 0 and unit in ("nm^2", "nm2", "sq nm"):
            value, out_unit = round(magnitude * KM2_PER_NM2), "km²"

    source_url = None
    for s in event.get("sources") or []:
        source_url = http_url(s.get("url")) if isinstance(s, dict) else None
        if source_url:
            break
    title = str(event.get("title") or "").strip() or event_id

    return {
        "id": event_id,
        "kind": kind,
        "lat": round(lat, 3),
        "lon": round(lon, 3),
        "title": title,
        "severity": severity,
        "value": value,
        "unit": out_unit,
        "time_ms": last_t,
        "started_ms": first_t,
        "url": source_url or http_url(event.get("link")),
        "source": "NASA EONET",
    }


def _parse_events(payload, now_ms):
    out, seen = [], set()
    for event in (payload or {}).get("events") or []:
        try:
            e = _parse_event(event, now_ms) if isinstance(event, dict) else None
        except (AttributeError, TypeError, ValueError):
            e = None
        if e and e["id"] not in seen:
            seen.add(e["id"])
            out.append(e)
    return out


@ttl_cache(ttl_seconds=FEED_TTL_SECONDS, key_fn=lambda: "eonet-open", stale_ok=True)
def fetch_eonet_feed():
    """
    The cached upstream call. Retries once on 429 / 5xx / network errors; if both attempts fail
    the ttl_cache wrapper serves the last good copy instead of an error.
    """
    params = {"status": "open", "category": EONET_CATEGORIES, "limit": 1000}
    last_error = "unknown error"
    for attempt in range(2):
        try:
            r = requests.get(EONET_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=15)
            if r.status_code == 200:
                now = time.time()
                return {"fetched_at": now, "events": _parse_events(r.json(), now * 1000)}
            last_error = f"HTTP {r.status_code}"
            if r.status_code != 429 and r.status_code < 500:
                break
        except (requests.RequestException, ValueError) as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(1)
    log.warning("EONET fetch failed: %s", last_error)
    return {"error": f"NASA EONET unavailable ({last_error})"}


def to_item(e: dict, category: str) -> dict:
    """Parsed EONET event -> the shared hazard item."""
    return {
        "id": e["id"],
        "lat": e["lat"],
        "lon": e["lon"],
        "title": e["title"],
        "severity": e["severity"],
        "value": e["value"],
        "unit": e["unit"],
        "time": iso_from_ms(e["time_ms"]),
        "started": iso_from_ms(e["started_ms"]),
        "url": e["url"],
        "source": e["source"],
        "category": category,
    }
