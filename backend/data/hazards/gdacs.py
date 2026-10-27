"""
EarthWatch — tropical cyclones from GDACS (Global Disaster Alert and Coordination System).

GDACS gives every cyclone an alert level (Green / Orange / Red) that already weighs expected
impact, so it is the primary storms source; EONET storms only fill gaps (see feeds.py).

GDACS GeoJSON feature: properties {eventtype, eventid, episodeid, name, description, alertlevel,
fromdate, todate, iscurrent, country, severitydata: {severity, severityunit}, url: {report}},
geometry Point [lon, lat].
"""
import re
import time
from datetime import datetime, timedelta, timezone

import requests

from data.cache import ttl_cache
from data.hazards.common import (
    http_url, iso_from_ms, max_severity, num, parse_iso_ms, valid_coords,
)
from data.hazards.eonet import severity_for_wind_kmh

GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

FEED_TTL_SECONDS = 900
LOOKBACK_DAYS = 14
STILL_ACTIVE_SECONDS = 2 * 86400     # not flagged current, but updated in the last 2 days

ALERT_SEVERITY = {"red": "extreme", "orange": "moderate", "green": "mild"}
_TAGS = re.compile(r"<[^>]+>")


def _param_sets(now: datetime):
    """The documented query first; the older shape that production already uses as a fallback."""
    return [
        {
            "eventlist": "TC",
            "fromDate": (now - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d"),
            "toDate": now.strftime("%Y-%m-%d"),
            "alertlevel": "Green;Orange;Red",
        },
        {"eventtypes": "TC", "limit": 100},
    ]


def _parse_features(payload, now_ms):
    out, seen = [], set()
    for feat in (payload or {}).get("features") or []:
        try:
            props = feat.get("properties") or {}
            coords = (feat.get("geometry") or {}).get("coordinates") or []
            if str(props.get("eventtype") or "").upper() != "TC":
                continue
            event_id = str(props.get("eventid") or "").strip()
            lon = num(coords[0]) if len(coords) > 0 else None
            lat = num(coords[1]) if len(coords) > 1 else None
            if not event_id or event_id in seen or not valid_coords(lat, lon):
                continue

            start = parse_iso_ms(props.get("fromdate"))
            end = parse_iso_ms(props.get("todate"))
            updated = max([t for t in (start, end) if t is not None], default=None)
            if updated is None:
                continue
            updated = min(updated, int(now_ms))       # never report the future
            current = str(props.get("iscurrent")).lower() == "true"
            if not current and now_ms - updated > STILL_ACTIVE_SECONDS * 1000:
                continue                              # already over

            sev_data = props.get("severitydata") if isinstance(props.get("severitydata"), dict) else {}
            wind = num(sev_data.get("severity"))
            unit = str(sev_data.get("severityunit") or "").strip().lower()
            wind_kmh = wind if wind is not None and wind > 0 and unit in ("km/h", "kmh", "kph", "") else None

            alert = str(props.get("alertlevel") or "").strip().lower()
            severity = max_severity(ALERT_SEVERITY.get(alert, "info"), severity_for_wind_kmh(wind_kmh))

            title = _TAGS.sub("", str(props.get("description") or props.get("htmldescription") or "")).strip()
            title = title or str(props.get("name") or "").strip() or "Tropical cyclone"
            urls = props.get("url") if isinstance(props.get("url"), dict) else {}

            seen.add(event_id)
            out.append({
                "id": f"gdacs-TC-{event_id}",
                "kind": "storm",
                "lat": round(lat, 3),
                "lon": round(lon, 3),
                "title": title,
                "name": str(props.get("name") or "").strip(),
                "severity": severity,
                "alert": alert if alert in ALERT_SEVERITY else None,
                "value": round(wind_kmh) if wind_kmh is not None else None,
                "unit": "km/h" if wind_kmh is not None else None,
                "country": str(props.get("country") or "").strip() or None,
                "time_ms": updated,
                "started_ms": start if start is not None else updated,
                "url": http_url(urls.get("report")) or http_url(urls.get("details")),
                "source": "GDACS",
            })
        except (AttributeError, TypeError, ValueError, IndexError):
            continue
    return out


@ttl_cache(ttl_seconds=FEED_TTL_SECONDS, key_fn=lambda: "gdacs-tc", stale_ok=True)
def fetch_gdacs_cyclones():
    """Cached upstream call with a fallback query shape; stale copy on total failure."""
    now = datetime.now(timezone.utc)
    last_error = "unknown error"
    for attempt, params in enumerate(_param_sets(now)):
        try:
            r = requests.get(GDACS_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=15)
            if r.status_code == 200:
                t = time.time()
                return {"fetched_at": t, "events": _parse_features(r.json(), t * 1000)}
            last_error = f"HTTP {r.status_code}"
        except (requests.RequestException, ValueError) as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(1)
    return {"error": f"GDACS unavailable ({last_error})"}


def to_item(e: dict) -> dict:
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
        "category": "storm",
        "alert": e["alert"],
        "country": e["country"],
    }
