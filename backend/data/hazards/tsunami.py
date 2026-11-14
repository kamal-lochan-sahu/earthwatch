"""
EarthWatch — tsunami messages (NOAA tsunami warning centers).

The two U.S. tsunami warning centers publish an Atom feed that holds ONLY their latest message:
  * NTWC (Palmer, Alaska)  — Alaska, British Columbia and the U.S. West Coast
        https://www.tsunami.gov/events/xml/PAAQAtom.xml
  * PTWC (Honolulu)        — Hawaii, the Pacific, the Caribbean and the Indian Ocean
        https://www.tsunami.gov/events/xml/PHEBAtom.xml
Each <entry> carries the epicentre (geo:lat / geo:long) and an xhtml summary with labelled fields
(Category, Preliminary Magnitude, Affected Region, Note ...). Category is Information, Advisory, Watch,
Threat or Warning. Most days the latest message is an "information statement": an earthquake happened
and there is NO tsunami threat. A feed keeps showing its last message until the next one, so we only
keep messages from the last 48 hours; usually that leaves zero real alerts, and that is the good news.

This is a relay of the official messages, not a warning system: the UI says so.

Response envelope (shared with the other hazard layers):
    {layer, source, updated_at, stale, count, counts: {active, last_48h, feeds_ok, feeds_total, highest},
     items: [{id, lat, lon, title, severity, value, unit, time, url, source, category, kind, message,
              region, note, product, centre}]}
`active` counts real alerts (advisory, watch, threat, warning). `stale` is also true when one of the two
feeds could not be read, because then an alert might be missing.
"""
import re
import time
import xml.etree.ElementTree as ET

import requests

from data.cache import ttl_cache
from data.hazards.common import http_url, iso_from_ms, max_severity, num, parse_iso_ms, severity_rank, valid_coords

FEEDS = [
    {"centre": "NTWC", "url": "https://www.tsunami.gov/events/xml/PAAQAtom.xml", "source": "NOAA NTWC"},
    {"centre": "PTWC", "url": "https://www.tsunami.gov/events/xml/PHEBAtom.xml", "source": "NOAA PTWC"},
]
SOURCE_URL = "https://www.tsunami.gov/"
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

TTL_SECONDS = 300
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)
MAX_AGE_SECONDS = 48 * 3600       # a feed keeps its last message for days; older ones are not news
MAX_FEED_BYTES = 1_000_000

NS = {"a": "http://www.w3.org/2005/Atom", "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#"}

KIND_SEVERITY = {
    "cancellation": "info",
    "information": "info",
    "advisory": "mild",
    "watch": "moderate",
    "threat": "moderate",
    "warning": "extreme",
    "other": "mild",       # an unknown message type is shown rather than hidden
}
KIND_LABEL = {
    "cancellation": "Tsunami cancellation",
    "information": "Tsunami information statement",
    "advisory": "Tsunami advisory",
    "watch": "Tsunami watch",
    "threat": "Tsunami threat message",
    "warning": "Tsunami warning",
    "other": "Tsunami message",
}
# NOAA product codes of information statements; every other code (…40, …41) can carry an alert.
INFO_PRODUCTS = re.compile(r"^WE[A-Z]{2}(42|43|53)$|^SE[A-Z]{2}71$")
_PRODUCT_PATH = re.compile(r"/events/([A-Z]+/\d{4}/\d{2}/\d{2}/[^/]+/\d+/([A-Z0-9]+))/")
_MAGNITUDE = re.compile(r"(-?\d+(?:\.\d+)?)\s*(?:\(\s*([A-Za-z]+)\s*\))?")
_ISSUE_TIME = re.compile(r"(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})")


def classify(text):
    """Message kind from a Category or title text, or None when it says nothing we recognise."""
    t = (text or "").lower()
    for word, kind in (("cancel", "cancellation"), ("warning", "warning"), ("watch", "watch"),
                       ("threat", "threat"), ("advisory", "advisory"), ("information", "information")):
        if word in t:
            return kind
    return None


def _clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _summary_fields(entry):
    """{label: text} from the xhtml summary: <strong>Label:</strong> text<br/> ..."""
    summary = entry.find("a:summary", NS)
    fields = {}
    if summary is None:
        return fields
    for el in summary.iter():
        if _local(el.tag) in ("strong", "b") and el.text:
            label = el.text.strip().rstrip(":").strip().lower()
            if label:
                fields[label] = _clean(el.tail)
    return fields


def _magnitude(text):
    m = _MAGNITUDE.search(text or "")
    if not m:
        return None, None
    value = num(float(m.group(1)))
    return (round(value, 1), m.group(2)) if value is not None else (None, None)


def _issue_time_ms(text):
    m = _ISSUE_TIME.search(text or "")
    return parse_iso_ms("{}-{}-{}T{}:{}:{}Z".format(*m.groups())) if m else None


def _entry_item(entry, feed, feed_kind, now_ms):
    """One Atom entry -> an item, or None (bad coordinates, too old, unreadable)."""
    try:
        lat, lon = num(float(entry.findtext("geo:lat", "", NS))), num(float(entry.findtext("geo:long", "", NS)))
    except ValueError:
        return None
    if not valid_coords(lat, lon):
        return None
    fields = _summary_fields(entry)
    time_ms = parse_iso_ms(entry.findtext("a:updated", "", NS)) or _issue_time_ms(fields.get("bulletin issue time"))
    if time_ms is None or now_ms - time_ms > MAX_AGE_SECONDS * 1000:
        return None
    bulletin = None
    for link in entry.findall("a:link", NS):
        if link.get("rel") == "alternate":
            bulletin = http_url(link.get("href"))
    path = _PRODUCT_PATH.search(bulletin or "")
    product = path.group(2) if path else None

    kind = classify(fields.get("category")) or feed_kind
    if kind is None and product:
        kind = "information" if INFO_PRODUCTS.match(product) else None
    kind = kind or "other"
    magnitude, magnitude_type = _magnitude(fields.get("preliminary magnitude"))
    region = fields.get("affected region") or _clean(entry.findtext("a:title", "", NS))
    note = re.sub(r"^[\s*]+", "", fields.get("note", ""))
    entry_id = path.group(1) if path else _clean(entry.findtext("a:id", "", NS)) or f"{feed['centre']}:{lat},{lon}:{time_ms}"
    return {
        "id": entry_id,
        "lat": lat,
        "lon": lon,
        "title": f"{KIND_LABEL[kind]} · {region}" if region else KIND_LABEL[kind],
        "severity": KIND_SEVERITY[kind],
        "value": magnitude,
        "unit": "M" if magnitude is not None else None,
        "time": iso_from_ms(time_ms),
        "url": bulletin or SOURCE_URL,
        "source": feed["source"],
        "category": "tsunami",
        "kind": kind,
        "message": None,
        "region": region or None,
        "note": note or None,
        "product": product,
        "centre": feed["centre"],
        "magnitude_type": magnitude_type,
    }


def parse_feed(content, feed, now_ms):
    """Atom bytes -> items, or None when the document is not a readable Atom feed."""
    if not content or len(content) > MAX_FEED_BYTES or b"<!DOCTYPE" in content or b"<!ENTITY" in content:
        return None
    try:
        root = ET.fromstring(content.strip())
    except ET.ParseError:
        return None
    if _local(root.tag) != "feed":
        return None
    message = _clean(root.findtext("a:title", "", NS))
    feed_kind = classify(message)
    items = []
    for entry in root.findall("a:entry", NS):
        item = _entry_item(entry, feed, feed_kind, now_ms)
        if item:
            item["message"] = message or None
            items.append(item)
    return items


def _fetch_feed(feed, now_ms):
    """Items of one feed, or None if it could not be read."""
    for attempt in range(2):
        try:
            r = requests.get(feed["url"], headers={"User-Agent": USER_AGENT}, timeout=10)
            if r.status_code == 200:
                return parse_feed(r.content, feed, now_ms)
            if r.status_code != 429 and r.status_code < 500:
                return None
        except requests.RequestException:
            pass
        if attempt == 0:
            time.sleep(1)
    return None


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "tsunami-feeds", stale_ok=True)
def fetch_tsunami_messages():
    """Recent messages from both centres, or {"error": ...} when neither feed could be read."""
    now = time.time()
    items, ok = [], 0
    for feed in FEEDS:
        got = _fetch_feed(feed, now * 1000)
        if got is not None:
            ok += 1
            items.extend(got)
    if ok == 0:
        return {"error": "NOAA tsunami warning center feeds unavailable"}
    return {"fetched_at": now, "items": items, "feeds_ok": ok}


def _sort_key(item):
    return (-severity_rank(item["severity"]), -(parse_iso_ms(item["time"]) or 0))


def build_tsunami_response(now=None):
    data = fetch_tsunami_messages()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    items = sorted(data["items"], key=_sort_key)
    alerts = [it for it in items if severity_rank(it["severity"]) >= severity_rank("mild")]
    complete = data["feeds_ok"] == len(FEEDS)
    return {
        "layer": "tsunamis",
        "source": "NOAA NTWC / PTWC",
        "url": SOURCE_URL,
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "stale": (not complete) or now - data["fetched_at"] > STALE_AFTER_SECONDS,
        "count": len(items),
        "counts": {
            "active": len(alerts),
            "last_48h": len(items),
            "feeds_ok": data["feeds_ok"],
            "feeds_total": len(FEEDS),
            "highest": max_severity(*(it["severity"] for it in items)) if items else None,
        },
        "items": items,
    }
