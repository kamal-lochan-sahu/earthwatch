"""
EarthWatch — earthquakes layer (USGS Earthquake Hazards Program).

One upstream request feeds everything: the public USGS "M2.5+ past 7 days" GeoJSON feed is
fetched once, cached for a couple of minutes (serving the last good copy if USGS hiccups),
and every window / magnitude / region query is answered from that single cached copy.

Response envelope (shared by all hazard layers):
    {layer, updated_at, stale, count, items: [{id, lat, lon, title, severity, value, unit,
     time, url, source, ...extras}], ...}
"""
import re
import time
from datetime import datetime, timezone

import requests

from data.cache import ttl_cache

USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson"
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

FEED_TTL_SECONDS = 120        # USGS refreshes this feed every minute; 2 min keeps us polite.
STALE_AFTER_SECONDS = 600     # a copy older than this is flagged stale in the envelope.
FEED_MIN_MAG = 2.5            # the feed's own floor: lower magnitudes are not available.
MAX_ITEMS = 1500              # hard cap on points per response (strongest are kept).
MAX_REGIONS = 25

WINDOWS = {"1h": 3600, "24h": 86400, "7d": 7 * 86400}


def severity_for_magnitude(mag: float) -> str:
    """Shared severity scale (the frontend legend uses the same thresholds)."""
    if mag >= 7.0:
        return "extreme"
    if mag >= 6.0:
        return "moderate"
    if mag >= 4.5:
        return "mild"
    return "info"


_US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico",
}

_OFFSET_PREFIX = re.compile(r"^\d+(?:\.\d+)?\s*km\s+[NSEW]{1,3}\s+of\s+(.+)$", re.IGNORECASE)
_DIRECTION_PREFIX = re.compile(
    r"^(?:north|south|east|west|north-?east|north-?west|south-?east|south-?west)(?:ern)?"
    r"\s+of\s+(?:the\s+)?(.+)$",
    re.IGNORECASE,
)


def region_from_place(place: str) -> str:
    """
    A coarse, filterable region name from USGS's free-text `place`:
      "12 km NNE of Fukushima, Japan" -> "Japan"     "5 km SW of Ridgecrest, CA" -> "California"
      "south of the Fiji Islands"     -> "Fiji Islands"     "Mid-Atlantic Ridge" -> same
    """
    p = (place or "").strip()
    if not p:
        return "Unknown"
    if "," in p:
        tail = p.rsplit(",", 1)[1].strip()
        if tail:
            return _US_STATES.get(tail.upper(), tail) if len(tail) == 2 else tail
    for pattern in (_OFFSET_PREFIX, _DIRECTION_PREFIX):
        m = pattern.match(p)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return p


def _num(value):
    """A finite float, or None (USGS uses null for unknown values)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    f = float(value)
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def _parse_features(payload) -> list:
    """GeoJSON -> clean event dicts, newest first. Silently drops malformed / non-quake rows."""
    out, seen = [], set()
    for feat in (payload or {}).get("features") or []:
        try:
            props = feat.get("properties") or {}
            coords = (feat.get("geometry") or {}).get("coordinates") or []
            quake_id = str(feat.get("id") or "").strip()
            mag, t_ms = _num(props.get("mag")), _num(props.get("time"))
            lon, lat = _num(coords[0]) if len(coords) > 0 else None, _num(coords[1]) if len(coords) > 1 else None
            depth = _num(coords[2]) if len(coords) > 2 else None
            if props.get("type", "earthquake") != "earthquake":
                continue  # quarry blasts, explosions, ice quakes...
            if not quake_id or quake_id in seen or mag is None or t_ms is None:
                continue
            if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue
            seen.add(quake_id)
            felt = props.get("felt")
            out.append({
                "id": quake_id,
                "lat": round(lat, 3),
                "lon": round(lon, 3),
                "depth_km": round(depth, 1) if depth is not None else None,
                "mag": round(mag, 1),
                "mag_type": props.get("magType") or None,
                "place": str(props.get("place") or "Unknown location").strip(),
                "time_ms": int(t_ms),
                "url": props.get("url") if isinstance(props.get("url"), str) else None,
                "felt": int(felt) if isinstance(felt, (int, float)) and not isinstance(felt, bool) else None,
                "alert": props.get("alert") if props.get("alert") in ("green", "yellow", "orange", "red") else None,
                "tsunami": bool(props.get("tsunami")),
            })
        except (AttributeError, TypeError, ValueError, IndexError):
            continue
    out.sort(key=lambda e: e["time_ms"], reverse=True)
    return out


@ttl_cache(ttl_seconds=FEED_TTL_SECONDS, key_fn=lambda: "usgs-2.5-week", stale_ok=True)
def fetch_usgs_feed():
    """
    The cached upstream call. Retries once on a 429 / 5xx / network error; if both attempts
    fail the ttl_cache wrapper serves the last good copy instead of an error.
    """
    last_error = "unknown error"
    for attempt in range(2):
        try:
            r = requests.get(USGS_FEED_URL, headers={"User-Agent": USER_AGENT}, timeout=10)
            if r.status_code == 200:
                return {"fetched_at": time.time(), "events": _parse_features(r.json())}
            last_error = f"HTTP {r.status_code}"
            if r.status_code != 429 and r.status_code < 500:
                break  # a 4xx won't fix itself on retry
        except (requests.RequestException, ValueError) as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(1)
    return {"error": f"USGS feed unavailable ({last_error})"}


def _iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _item(e: dict) -> dict:
    return {
        "id": e["id"],
        "lat": e["lat"],
        "lon": e["lon"],
        "title": f"M {e['mag']:.1f} — {e['place']}",
        "severity": severity_for_magnitude(e["mag"]),
        "value": e["mag"],
        "unit": "M",
        "time": _iso(e["time_ms"]),
        "url": e["url"],
        "source": "USGS",
        "place": e["place"],
        "region": region_from_place(e["place"]),
        "depth_km": e["depth_km"],
        "mag_type": e["mag_type"],
        "felt": e["felt"],
        "alert": e["alert"],
        "tsunami": e["tsunami"],
    }


def build_earthquake_response(window="24h", min_mag=FEED_MIN_MAG, region=None, limit=MAX_ITEMS, now=None):
    """
    The /api/earthquakes payload. Returns {"error": ...} when USGS is unreachable and nothing
    has ever been cached. `counts` always describe ALL M2.5+ events, never the filtered subset.
    """
    feed = fetch_usgs_feed()
    if "error" in feed:
        return feed

    now = time.time() if now is None else now
    now_ms = now * 1000
    events = feed["events"]

    def within(seconds, mag=0.0):
        cutoff = now_ms - seconds * 1000
        return [e for e in events if e["time_ms"] >= cutoff and e["mag"] >= mag]

    last_24h = within(WINDOWS["24h"])
    strongest = max(last_24h, key=lambda e: e["mag"], default=None)
    counts = {
        "last_hour": len(within(WINDOWS["1h"])),
        "last_24h": len(last_24h),
        "last_7d": len(within(WINDOWS["7d"])),
        "m4_5_24h": sum(1 for e in last_24h if e["mag"] >= 4.5),
        "m6_24h": sum(1 for e in last_24h if e["mag"] >= 6.0),
        "strongest_24h": (
            {"id": strongest["id"], "mag": strongest["mag"], "place": strongest["place"]} if strongest else None
        ),
    }

    selected = within(WINDOWS[window], min_mag)

    region_counts = {}
    for e in selected:
        name = region_from_place(e["place"])
        region_counts[name] = region_counts.get(name, 0) + 1
    regions = [
        {"name": n, "count": c}
        for n, c in sorted(region_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_REGIONS]
    ]

    if region:
        wanted = region.strip().lower()
        selected = [e for e in selected if region_from_place(e["place"]).lower() == wanted]

    total_matching = len(selected)
    if total_matching > limit:  # keep the strongest, then restore newest-first order
        selected = sorted(selected, key=lambda e: (-e["mag"], -e["time_ms"]))[:limit]
        selected.sort(key=lambda e: e["time_ms"], reverse=True)

    age = now - feed["fetched_at"]
    return {
        "layer": "earthquakes",
        "source": "USGS Earthquake Hazards Program",
        "updated_at": _iso(feed["fetched_at"] * 1000),
        "stale": age > STALE_AFTER_SECONDS,
        "window": window,
        "min_mag": min_mag,
        "region": region or None,
        "count": len(selected),
        "total_matching": total_matching,
        "counts": counts,
        "regions": regions,
        "items": [_item(e) for e in selected],
    }
