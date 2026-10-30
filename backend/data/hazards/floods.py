"""
EarthWatch — river flood watch layer (Open-Meteo Flood API, GloFAS).

~50 of the world's big rivers, each sampled at one well-known point on its main channel (a city
or gauging station). The Flood API only gives DAILY river discharge (m3/s): the last 30 days plus
a 7-day forecast. There is no "flood level" in it, so the layer does not pretend to know one.
Instead it compares how high the river is expected to get in the next week with how much water
it carried over the last 30 days (the median): a river heading for 4x its recent normal is the
sort of rise worth watching. A big river seasonally swelling shows up the same way, which is
accurate: that is exactly when it is rising.

One batched request feeds the whole layer and is cached for 6 hours (the data is daily); if
Open-Meteo rate-limits us the last good copy is served and flagged `stale`.

Response envelope (shared with the other layers):
    {layer, source, updated_at, stale, count, counts, items: [{id, lat, lon, title, severity,
     value, unit, time, url, source, river, name, baseline, peak, peak_date, ratio, trend, regulated}]}
`value` is today's discharge in m3/s, `baseline` the 30-day median, `peak` the highest forecast
value in the next 7 days and `ratio` peak / baseline. `regulated` marks heavily dammed rivers.
"""
import re
import statistics
import time
from datetime import datetime, timezone

from data.cache import ttl_cache
from data.hazards.common import iso_from_ms
from data.hazards.openmeteo import fetch_points

OPEN_METEO_FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
SOURCE_URL = "https://open-meteo.com/en/docs/flood-api"

PAST_DAYS = 30
FORECAST_DAYS = 7
MIN_BASELINE_DAYS = 10     # fewer past values than this: no trustworthy "normal"
MIN_BASELINE_M3S = 20.0    # below this the river is too small for a 5 km grid to say anything

TTL_SECONDS = 6 * 3600
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)

# (river, place on its main channel, lat, lon)
RIVERS = [
    ("Mississippi", "Vicksburg", 32.325, -90.975),
    ("Mississippi", "St. Louis", 38.425, -90.375),
    ("Missouri", "Hermann", 38.71, -91.44),
    ("Ohio", "Cairo", 36.775, -89.175),
    ("Columbia", "The Dalles", 45.61, -121.17),
    ("St. Lawrence", "Quebec", 46.81, -71.20),
    ("Mackenzie", "Fort Simpson", 61.86, -121.35),
    ("Yukon", "Pilot Station", 61.93, -162.88),
    ("Amazon", "Obidos", -2.125, -55.375),
    ("Madeira", "Porto Velho", -8.975, -64.125),
    ("Orinoco", "Ciudad Bolivar", 8.225, -63.425),
    ("Magdalena", "Barrancabermeja", 7.07, -73.85),
    ("Parana", "Rosario", -33.175, -60.475),
    ("Paraguay", "Asuncion", -25.475, -57.625),
    ("Sao Francisco", "Juazeiro", -9.40, -40.50),
    ("Danube", "Vienna", 48.20, 16.40),
    ("Danube", "Budapest", 47.425, 18.975),
    ("Rhine", "Cologne", 50.775, 7.025),
    ("Elbe", "Dresden", 51.125, 13.525),
    ("Vistula", "Warsaw", 52.23, 21.03),
    ("Po", "Pontelagoscuro", 44.925, 11.375),
    ("Rhone", "Arles", 43.625, 4.625),
    ("Seine", "Paris", 48.975, 2.125),
    ("Ebro", "Tortosa", 40.675, 0.725),
    ("Volga", "Volgograd", 48.70, 44.50),
    ("Nile", "Khartoum", 15.60, 32.50),
    ("Nile", "Aswan", 23.925, 32.825),
    ("Congo", "Kinshasa", -4.225, 15.475),
    ("Niger", "Niamey", 13.575, 1.875),
    ("Niger", "Lokoja", 7.80, 6.75),
    ("Senegal", "Bakel", 15.075, -12.625),
    ("Zambezi", "Victoria Falls", -17.825, 25.625),
    ("Orange", "Upington", -28.45, 21.25),
    ("Tigris", "Baghdad", 33.30, 44.40),
    ("Euphrates", "Hit", 33.64, 42.83),
    ("Indus", "Sukkur", 27.70, 68.85),
    ("Ganges", "Varanasi", 25.32, 83.03),
    ("Ganges", "Farakka", 24.80, 87.90),
    ("Brahmaputra", "Guwahati", 26.175, 91.575),
    ("Mahanadi", "Cuttack", 20.47, 85.88),
    ("Godavari", "Rajahmundry", 16.775, 81.825),
    ("Narmada", "Bharuch", 21.70, 73.00),
    ("Irrawaddy", "Pyay", 18.625, 95.025),
    ("Chao Phraya", "Nakhon Sawan", 15.525, 100.075),
    ("Mekong", "Vientiane", 17.975, 102.825),
    ("Mekong", "Phnom Penh", 11.475, 105.125),
    ("Yangtze", "Wuhan", 30.575, 114.525),
    ("Yellow River", "Jinan", 36.925, 117.175),
    ("Amur", "Khabarovsk", 48.675, 135.125),
    ("Lena", "Yakutsk", 62.225, 129.875),
    ("Yenisei", "Krasnoyarsk", 56.00, 92.90),
    ("Ob", "Salekhard", 66.625, 66.675),
    ("Murray", "Mildura", -34.425, 142.325),
]
POINTS = [(lat, lon) for _, _, lat, lon in RIVERS]

# Heavily dammed rivers: GloFAS does not model reservoir releases, so the "natural" flow it reports (and
# any rise it forecasts) can differ a lot from what the dams actually let through. Flagged in the item.
REGULATED = {
    ("Euphrates", "Hit"), ("Tigris", "Baghdad"), ("Nile", "Aswan"), ("Nile", "Khartoum"),
    ("Columbia", "The Dalles"), ("Volga", "Volgograd"), ("Missouri", "Hermann"), ("Yenisei", "Krasnoyarsk"),
    ("Ebro", "Tortosa"), ("Murray", "Mildura"), ("Orange", "Upington"), ("Narmada", "Bharuch"),
    ("Mahanadi", "Cuttack"), ("Indus", "Sukkur"), ("Yellow River", "Jinan"),
}


def severity_for_ratio(ratio) -> str:
    """Shared severity scale; the frontend legend uses the same thresholds."""
    if ratio is None:
        return "info"
    if ratio >= 4:
        return "extreme"
    if ratio >= 2.5:
        return "moderate"
    if ratio >= 1.6:
        return "mild"
    return "info"


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v else None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _fmt_flow(q: float) -> str:
    return f"{q:,.0f}"


def _item(river: str, place: str, lat: float, lon: float, row, today: str):
    daily = row.get("daily") if isinstance(row, dict) else None
    if not isinstance(daily, dict):
        return None
    days, values = daily.get("time"), daily.get("river_discharge")
    if not isinstance(days, list) or not isinstance(values, list) or len(days) != len(values):
        return None
    series = [(d, _num(v)) for d, v in zip(days, values)]
    # Past = everything before today; forecast = today and the following days.
    split = next((i for i, (d, _) in enumerate(series) if str(d) >= today), None)
    if split is None:
        return None
    past = [v for _, v in series[:split] if v is not None]
    ahead = [(d, v) for d, v in series[split:split + FORECAST_DAYS + 1] if v is not None]
    if not ahead or len(past) < MIN_BASELINE_DAYS:
        return None
    baseline = statistics.median(past)
    if baseline < MIN_BASELINE_M3S:
        return None
    now_day, now_q = ahead[0]
    peak_day, peak_q = max(ahead, key=lambda p: p[1])
    ratio = round(peak_q / baseline, 2)
    last_q = ahead[-1][1]
    trend = "rising" if last_q > now_q * 1.1 else "falling" if last_q < now_q * 0.9 else "steady"
    return {
        "id": f"{_slug(river)}-{_slug(place)}",
        "lat": lat,
        "lon": lon,
        "title": f"{river} at {place}: {_fmt_flow(now_q)} m³/s",
        "severity": severity_for_ratio(ratio),
        "value": round(now_q, 1),
        "unit": "m³/s",
        "time": f"{now_day}T00:00:00Z",
        "url": SOURCE_URL,
        "source": "Open-Meteo Flood (GloFAS)",
        "category": "floods",
        "river": river,
        "name": place,
        "baseline": round(baseline, 1),
        "peak": round(peak_q, 1),
        "peak_date": peak_day,
        "ratio": ratio,
        "trend": trend,
        "regulated": (river, place) in REGULATED,
    }


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "flood-rivers", stale_ok=True)
def fetch_rivers():
    """All rivers, or {"error": ...} (the cache then serves the last good copy)."""
    rows = fetch_points(
        OPEN_METEO_FLOOD_URL,
        POINTS,
        {"daily": "river_discharge", "past_days": PAST_DAYS, "forecast_days": FORECAST_DAYS},
    )
    if isinstance(rows, dict):
        return rows
    today = _today()
    items = [it for (river, place, lat, lon), row in zip(RIVERS, rows)
             if (it := _item(river, place, lat, lon, row, today))]
    if not items:
        return {"error": "Open-Meteo returned no usable river data"}
    return {"fetched_at": time.time(), "items": items}


def build_floods_response(now=None):
    data = fetch_rivers()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    items = sorted(data["items"], key=lambda it: it["ratio"], reverse=True)
    return {
        "layer": "floods",
        "source": "Open-Meteo Flood (GloFAS)",
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "stale": now - data["fetched_at"] > STALE_AFTER_SECONDS,
        "count": len(items),
        "counts": {
            "elevated": sum(1 for it in items if it["ratio"] >= 1.6),
            "max_ratio": items[0]["ratio"],
        },
        "items": items,
    }
