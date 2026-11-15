"""
EarthWatch — ocean heat: sea-surface-temperature anomaly + coral bleaching heat stress
(NOAA Coral Reef Watch, CoralTemp v3.1, 5 km, daily, near real time).

One request to NOAA CoastWatch's ERDDAP (griddap dataset NOAA_DHW) returns two variables for the latest day:
  * CRW_SSTANOMALY      sea-surface temperature minus NOAA's daily climatology, in °C
  * CRW_BAA_7D_MAX      Bleaching Alert Area, 7-day maximum: 0 no stress, 1 watch, 2 warning,
                        3 alert level 1, 4 alert level 2 (the product CRW's own heat-stress map shows)
The 5 km grid (3600 x 7200) is sampled every 20th pixel = a 1-degree grid, 180 x 360 cells. Land, ice and
missing pixels come back null. The query is ~3.5 MB of JSON, so it runs at most once per TTL (data is daily),
concurrent callers share one download, and the last good copy is served if NOAA is down.

Heat stress is drawn for the whole ocean, but coral reefs are a tiny part of it: a watch/warning cell says
"the water here is hot enough to stress reefs if there are any", not "reefs here are bleaching".

Response (no point items; the frontend paints the grids as colour washes):
    {layer, source, url, updated_at, data_date, stale, count: 0, items: [],
     counts: {mean_anomaly_c, warm_pct, stressed_tropics_pct, alert_cells, ocean_cells},
     anomaly:   {lat0, lon0, step: 2, rows: 90,  cols: 180, scale: 10, values: [[tenths of °C | null] per latitude row]},
     bleaching: {lat0, lon0, step: 1, rows: 180, cols: 360, values: ["0123.…" one string per latitude row]}}
Rows run south -> north, columns west -> east from lon0 (cell centres). In `bleaching` each character is a
level 0-4, or "." for land / ice / no data.
"""
import math
import threading
import time
from urllib.parse import quote

import requests

from data.cache import ttl_cache
from data.hazards.common import iso_from_ms, num, parse_iso_ms

ERDDAP_URL = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.json"
SOURCE_URL = "https://coralreefwatch.noaa.gov/product/5km/index.php"
USER_AGENT = "EarthWatch/1.0 (+https://github.com/kamal-lochan-sahu/earthwatch)"

STRIDE = 20                                   # 0.05 deg x 20 = 1 deg
ROWS, COLS = 180, 360
ANOM_STEP, ANOM_ROWS, ANOM_COLS = 2, ROWS // 2, COLS // 2
ANOM_SCALE = 10                               # anomaly grid is in tenths of a degree
ANOM_LIMIT = 150                              # clamp to +-15.0 C (the dataset's own valid range)

TTL_SECONDS = 6 * 3600                        # CRW publishes once a day, ~2 days behind
STALE_AFTER_SECONDS = int(TTL_SECONDS * 1.5)  # our copy older than this -> NOAA was unreachable
DATA_MAX_AGE_DAYS = 5                         # NOAA's own latest day older than this -> stalled
SINGLE_FLIGHT_SECONDS = 60                    # a second caller within this window reuses the download
MAX_BYTES = 20_000_000
MIN_ROWS = int(ROWS * COLS * 0.95)
TROPICS = 30                                  # |lat| <= 30 is where reefs live

_BOX = f"[(last)][(89.975):{STRIDE}:(-89.975)][(-179.975):{STRIDE}:(179.975)]"
QUERY = f"CRW_SSTANOMALY{_BOX},CRW_BAA_7D_MAX{_BOX}"
URL = f"{ERDDAP_URL}?{quote(QUERY, safe='')}"  # Tomcat refuses raw [ ] ( ) in a query string
NEEDED = ("time", "latitude", "longitude", "CRW_SSTANOMALY", "CRW_BAA_7D_MAX")


def _level(value):
    v = num(value)
    return int(v) if v is not None and v in (0, 1, 2, 3, 4) else None


def _anomaly(value):
    v = num(value)
    return v if v is not None and -15 <= v <= 15 else None


def parse_table(payload):
    """ERDDAP .json table -> (data_ms, lat0, lon0, anomaly[ROWS][COLS] (C | None), level[ROWS][COLS] (0-4 | None)),
    or None when it is not the 180 x 360 grid we asked for."""
    table = payload.get("table") if isinstance(payload, dict) else None
    if not isinstance(table, dict) or not isinstance(table.get("columnNames"), list) or not isinstance(table.get("rows"), list):
        return None
    index = {name: i for i, name in enumerate(table["columnNames"])}
    if any(name not in index for name in NEEDED):
        return None
    i_time, i_lat, i_lon, i_anom, i_baa = (index[n] for n in NEEDED)
    rows = table["rows"]
    if len(rows) < MIN_ROWS or len(rows) > ROWS * COLS:
        return None

    cells = []
    lat0 = lon0 = math.inf
    data_ms = None
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) <= max(i_time, i_lat, i_lon, i_anom, i_baa):
            continue
        lat, lon = num(row[i_lat]), num(row[i_lon])
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        cells.append((lat, lon, row[i_anom], row[i_baa]))
        lat0, lon0 = min(lat0, lat), min(lon0, lon)
        if data_ms is None:
            data_ms = parse_iso_ms(row[i_time])
    if len(cells) < MIN_ROWS or data_ms is None:
        return None

    anomaly = [[None] * COLS for _ in range(ROWS)]
    level = [[None] * COLS for _ in range(ROWS)]
    placed = 0
    for lat, lon, anom, baa in cells:
        r, c = round(lat - lat0), round(lon - lon0)
        if not (0 <= r < ROWS and 0 <= c < COLS):
            continue
        anomaly[r][c] = _anomaly(anom)
        level[r][c] = _level(baa)
        placed += 1
    if placed < MIN_ROWS:
        return None
    return data_ms, lat0, lon0, anomaly, level


def _downsample_anomaly(anomaly):
    """1-degree anomalies -> 2-degree tenths of a degree: the mean of the valid cells of each 2 x 2 block."""
    out = []
    for r in range(ANOM_ROWS):
        row = []
        for c in range(ANOM_COLS):
            vals = [anomaly[rr][cc] for rr in (2 * r, 2 * r + 1) for cc in (2 * c, 2 * c + 1) if anomaly[rr][cc] is not None]
            if not vals:
                row.append(None)
            else:
                tenths = round(sum(vals) / len(vals) * ANOM_SCALE)
                row.append(max(-ANOM_LIMIT, min(ANOM_LIMIT, tenths)))
        out.append(row)
    return out


def _stats(lat0, anomaly, level):
    num_w = den_w = 0.0
    warm = valid = 0
    tropics = stressed = alert = ocean = 0
    for r in range(ROWS):
        lat = lat0 + r
        w = math.cos(math.radians(lat))
        for c in range(COLS):
            a, b = anomaly[r][c], level[r][c]
            if a is not None:
                num_w += a * w
                den_w += w
                valid += 1
                warm += a >= 1
            if b is not None:
                ocean += 1
                alert += b >= 3
                if abs(lat) <= TROPICS:
                    tropics += 1
                    stressed += b >= 1
    return {
        "mean_anomaly_c": round(num_w / den_w, 2) if den_w else None,
        "warm_pct": round(100 * warm / valid, 1) if valid else None,
        "stressed_tropics_pct": round(100 * stressed / tropics, 1) if tropics else None,
        "alert_cells": alert,
        "ocean_cells": ocean,
    }


def _download():
    """The shrunk grids, or {"error": ...}."""
    last_error = "unknown error"
    for attempt in range(2):
        try:
            r = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=(10, 90))
            if r.status_code == 200:
                if len(r.content) > MAX_BYTES:
                    return {"error": "NOAA ocean-heat response was unexpectedly large"}
                parsed = parse_table(r.json())
                if parsed is None:
                    return {"error": "NOAA ocean-heat data had an unexpected format"}
                data_ms, lat0, lon0, anomaly, level = parsed
                return {
                    "fetched_at": time.time(),
                    "data_ms": data_ms,
                    "lat0": lat0,
                    "lon0": lon0,
                    "stats": _stats(lat0, anomaly, level),
                    "anomaly": _downsample_anomaly(anomaly),
                    "bleaching": ["".join("." if v is None else str(v) for v in row) for row in level],
                }
            last_error = f"HTTP {r.status_code}"
            if r.status_code != 429 and r.status_code < 500:
                break
        except (requests.RequestException, ValueError) as e:
            last_error = type(e).__name__
        if attempt == 0:
            time.sleep(2)
    return {"error": f"NOAA Coral Reef Watch data unavailable ({last_error})"}


_flight = threading.Lock()
_last = {"at": 0.0, "value": None}


@ttl_cache(ttl_seconds=TTL_SECONDS, key_fn=lambda: "ocean-heat", stale_ok=True)
def fetch_ocean_heat():
    # Two layers share this endpoint and are usually switched on together: one download serves both.
    with _flight:
        if _last["value"] is not None and time.time() - _last["at"] < SINGLE_FLIGHT_SECONDS:
            return _last["value"]
        result = _download()
        if "error" not in result:
            _last["at"], _last["value"] = time.time(), result
        return result


def build_ocean_heat_response(now=None):
    data = fetch_ocean_heat()
    if "error" in data:
        return data
    now = time.time() if now is None else now
    age_days = (now - data["data_ms"] / 1000) / 86400
    return {
        "layer": "ocean-heat",
        "source": "NOAA Coral Reef Watch",
        "url": SOURCE_URL,
        "updated_at": iso_from_ms(data["fetched_at"] * 1000),
        "data_date": iso_from_ms(data["data_ms"]),
        "stale": now - data["fetched_at"] > STALE_AFTER_SECONDS or age_days > DATA_MAX_AGE_DAYS,
        "count": 0,
        "items": [],
        "counts": data["stats"],
        "anomaly": {
            "lat0": data["lat0"] + 0.5, "lon0": data["lon0"] + 0.5, "step": ANOM_STEP,
            "rows": ANOM_ROWS, "cols": ANOM_COLS, "scale": ANOM_SCALE, "values": data["anomaly"],
        },
        "bleaching": {
            "lat0": data["lat0"], "lon0": data["lon0"], "step": 1,
            "rows": ROWS, "cols": COLS, "values": data["bleaching"],
        },
    }
