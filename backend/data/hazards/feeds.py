"""
EarthWatch — builds the /api/wildfires, /api/volcanoes, /api/icebergs, /api/storms and
/api/hazards payloads from the cached EONET and GDACS feeds.

Storms = GDACS cyclones (primary, impact-weighted alert levels) + EONET severe storms that GDACS
does not already cover (same name, or within DEDUPE_KM at about the same time).
"""
import re
import time

from data.hazards import eonet, gdacs
from data.hazards.common import haversine_km, iso_from_ms, parse_iso_ms, severity_rank, SEVERITIES

LAYERS = {
    "wildfires": {"category": "wildfire", "source": "NASA EONET"},
    "volcanoes": {"category": "volcano", "source": "NASA EONET (Smithsonian GVP / USGS)"},
    "icebergs": {"category": "iceberg", "source": "NASA EONET (U.S. National Ice Center)"},
    "storms": {"category": "storm", "source": "GDACS + NASA EONET"},
}
CATEGORY_TO_LAYER = {v["category"]: k for k, v in LAYERS.items()}

DEDUPE_KM = 600
DEDUPE_SECONDS = 3 * 86400
_GENERIC = {
    "TROPICAL", "CYCLONE", "STORM", "TYPHOON", "HURRICANE", "SEVERE", "SUPER", "SUPERTYPHOON",
    "DEPRESSION", "SUBTROPICAL", "POST", "REMNANTS", "TS", "TD", "TC", "WARNING", "FORECAST",
}
_WORD = re.compile(r"[A-Za-z]{4,}")


def _name_tokens(text: str) -> set:
    return {w.upper() for w in _WORD.findall(text or "")} - _GENERIC


def _same_storm(a: dict, b: dict) -> bool:
    a_names = _name_tokens(a["title"]) | _name_tokens(a.get("name", ""))
    if a_names & _name_tokens(b["title"]):
        return True
    close = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) <= DEDUPE_KM
    return close and abs(a["time_ms"] - b["time_ms"]) <= DEDUPE_SECONDS * 1000


def _rank_key(item):
    return (-severity_rank(item["severity"]), -_epoch(item["time"]))


def _epoch(iso: str) -> float:
    return float(parse_iso_ms(iso) or 0)


def _eonet_items(kind: str, category: str):
    feed = eonet.fetch_eonet_feed()
    if "error" in feed:
        return None, feed
    return [(e, eonet.to_item(e, category)) for e in feed["events"] if e["kind"] == kind], feed


def _collect(layer: str):
    """-> (items, fetched_at_list, errors, sources_used) for one layer."""
    if layer != "storms":
        kind = LAYERS[layer]["category"]
        pairs, feed = _eonet_items(kind, kind)
        if pairs is None:
            return None, [], [feed["error"]]
        return [item for _, item in pairs], [feed["fetched_at"]], []

    items, fetched, errors = [], [], []
    g_feed = gdacs.fetch_gdacs_cyclones()
    g_events = []
    if "error" in g_feed:
        errors.append(g_feed["error"])
    else:
        g_events = g_feed["events"]
        fetched.append(g_feed["fetched_at"])
        items.extend(gdacs.to_item(e) for e in g_events)

    e_feed = eonet.fetch_eonet_feed()
    if "error" in e_feed:
        errors.append(e_feed["error"])
    else:
        fetched.append(e_feed["fetched_at"])
        for e in e_feed["events"]:
            if e["kind"] == "storm" and not any(_same_storm(e, g) for g in g_events):
                items.append(eonet.to_item(e, "storm"))

    if not fetched:                       # both sources down and nothing cached
        return None, [], errors
    return items, fetched, errors


def _counts(items):
    by_sev = {s: 0 for s in SEVERITIES}
    for it in items:
        by_sev[it["severity"]] = by_sev.get(it["severity"], 0) + 1
    return {"active": len(items), "by_severity": by_sev, "extreme": by_sev["extreme"]}


def build_layer_response(layer: str, now=None):
    """The /api/<layer> payload, or {"error": ...} when every upstream is unreachable and uncached."""
    items, fetched, errors = _collect(layer)
    if items is None:
        return {"error": "; ".join(errors) or "hazard data unavailable"}
    now = time.time() if now is None else now
    items.sort(key=_rank_key)
    total = len(items)
    kept = items[: eonet.MAX_ITEMS]
    oldest = min(fetched)
    return {
        "layer": layer,
        "source": LAYERS[layer]["source"],
        "updated_at": iso_from_ms(oldest * 1000),
        "stale": (now - oldest) > eonet.STALE_AFTER_SECONDS or bool(errors),
        "partial": bool(errors),
        "count": len(kept),
        "total_matching": total,
        "counts": _counts(items),
        "items": kept,
    }


def build_hazards_response(categories=None, min_severity="info", limit=200, now=None):
    """
    The /api/hazards payload: every active wildfire / volcano / storm / iceberg in one list, most
    severe first. Layers that fail are skipped (flagged `partial`); error only if all of them fail.
    """
    wanted = [c for c in (categories or CATEGORY_TO_LAYER) if c in CATEGORY_TO_LAYER]
    now = time.time() if now is None else now
    items, updated, errors, partial, stale = [], [], [], False, False
    for category in wanted:
        r = build_layer_response(CATEGORY_TO_LAYER[category], now=now)
        if "error" in r:
            partial = True
            errors.append(r["error"])
            continue
        items.extend(r["items"])
        updated.append(_epoch(r["updated_at"]))
        partial = partial or r["partial"]
        stale = stale or r["stale"]
    if not updated:
        # Same upstream usually fails every layer: show each distinct reason once.
        return {"error": "; ".join(dict.fromkeys(errors)) or "hazard data unavailable"}

    floor = severity_rank(min_severity)
    selected = [i for i in items if severity_rank(i["severity"]) >= floor]
    selected.sort(key=_rank_key)
    by_category = {c: 0 for c in wanted}
    for i in items:
        by_category[i["category"]] = by_category.get(i["category"], 0) + 1
    return {
        "layer": "hazards",
        "source": "GDACS + NASA EONET",
        "updated_at": iso_from_ms(min(updated)),
        "stale": stale,
        "partial": partial,
        "min_severity": min_severity,
        "count": len(selected[:limit]),
        "total_matching": len(selected),
        "counts": {"by_category": by_category, "extreme": sum(1 for i in items if i["severity"] == "extreme")},
        "items": selected[:limit],
    }
