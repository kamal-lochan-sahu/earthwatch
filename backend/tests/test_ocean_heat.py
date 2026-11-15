import math
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.ocean_heat as oh
from main import app

client = TestClient(app)

LAT0, LON0 = -89.025, -179.975          # centres of the first (south-west) 1-degree cell
WHEN = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT12:00:00Z")   # NOAA runs ~2 days behind
COLUMNS = ["time", "latitude", "longitude", "CRW_SSTANOMALY", "CRW_BAA_7D_MAX"]


def lat_of(r):
    return round(LAT0 + r, 3)


def lon_of(c):
    return round(LON0 + c, 3)


def table(anom=None, baa=None, when=WHEN, default_anom=0.0, default_baa=0, columns=COLUMNS, keep=None):
    """ERDDAP .json answer for the 180 x 360 query: rows run north -> south like the real dataset's descending latitude.
    anom / baa map (row_from_south, col) -> value; keep(r, c) can drop cells."""
    anom, baa = anom or {}, baa or {}
    by_name = {}
    rows = []
    for r in range(oh.ROWS - 1, -1, -1):
        for c in range(oh.COLS):
            if keep and not keep(r, c):
                continue
            by_name = {"time": when, "latitude": lat_of(r), "longitude": lon_of(c),
                       "CRW_SSTANOMALY": anom.get((r, c), default_anom), "CRW_BAA_7D_MAX": baa.get((r, c), default_baa)}
            rows.append([by_name[n] for n in columns])
    return {"table": {"columnNames": columns, "columnTypes": ["String"] * len(columns),
                      "columnUnits": [None] * len(columns), "rows": rows}}


def fake_get(payload=None, status=200, raises=None, statuses=None):
    calls = []

    def get(url, headers=None, timeout=None):
        calls.append(url)
        if raises:
            raise raises
        r = type("R", (), {})()
        r.status_code = statuses[len(calls) - 1] if statuses else status
        body = payload if payload is not None else table()
        r.content = b"x" * 1000
        r.json = lambda: body
        return r

    get.calls = calls
    return get


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setattr(oh.time, "sleep", lambda s: None)
    oh._last.update(at=0.0, value=None)


def get_body():
    r = client.get("/api/ocean-heat")
    assert r.status_code == 200, r.text
    return r.json()


def test_query_is_percent_encoded_and_asks_for_both_variables():
    assert oh.URL.startswith("https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.json?")
    assert not any(ch in oh.URL for ch in "[]() ")
    assert "CRW_SSTANOMALY" in oh.URL and "CRW_BAA_7D_MAX" in oh.URL and "%28last%29" in oh.URL


def test_envelope_and_grid_shapes(monkeypatch):
    monkeypatch.setattr(oh.requests, "get", fake_get(table()))
    body = get_body()
    assert body["layer"] == "ocean-heat" and body["source"] == "NOAA Coral Reef Watch"
    assert body["count"] == 0 and body["items"] == [] and body["stale"] is False
    assert body["data_date"] == WHEN
    a, b = body["anomaly"], body["bleaching"]
    assert (a["rows"], a["cols"], a["step"], a["scale"]) == (90, 180, 2, 10)
    assert (b["rows"], b["cols"], b["step"]) == (180, 360, 1)
    assert len(a["values"]) == 90 and all(len(r) == 180 for r in a["values"])
    assert len(b["values"]) == 180 and all(len(r) == 360 for r in b["values"])
    assert b["lat0"] == LAT0 and b["lon0"] == LON0
    assert a["lat0"] == LAT0 + 0.5 and a["lon0"] == LON0 + 0.5          # centre of each 2 x 2 block
    assert set("".join(b["values"])) == {"0"}


def test_rows_are_south_to_north_and_columns_west_to_east(monkeypatch):
    monkeypatch.setattr(oh.requests, "get", fake_get(table(baa={(0, 5): 4, (100, 0): 3, (179, 359): 1})))
    v = get_body()["bleaching"]["values"]
    assert v[0][5] == "4"                 # r=0 is the southernmost row even though ERDDAP sent it last
    assert v[100][0] == "3"
    assert v[179][359] == "1"


def test_missing_and_invalid_levels_become_dots(monkeypatch):
    bad = {(10, 0): None, (10, 1): 5, (10, 2): 251, (10, 3): -5, (10, 4): "x", (10, 5): 2.5, (10, 6): 2, (10, 7): 0}
    monkeypatch.setattr(oh.requests, "get", fake_get(table(baa=bad)))
    assert get_body()["bleaching"]["values"][10][:8] == "....." + "." + "20"


def test_anomaly_is_averaged_over_valid_cells_of_each_block(monkeypatch):
    anom = {(20, 40): 1.0, (20, 41): 2.0, (21, 40): None, (21, 41): 3.0,      # -> 2.0 C
            (30, 10): None, (30, 11): None, (31, 10): None, (31, 11): None,   # all missing -> null
            (0, 0): 14.96, (0, 1): 14.96, (1, 0): 14.96, (1, 1): 14.96,       # near the dataset's limit
            (40, 0): 40.0, (40, 1): -40.0, (41, 0): "hot", (41, 1): 0.34}     # out of range / junk are dropped
    monkeypatch.setattr(oh.requests, "get", fake_get(table(anom=anom)))
    v = get_body()["anomaly"]["values"]
    assert v[10][20] == 20
    assert v[15][5] is None
    assert v[0][0] == 150
    assert v[20][0] == 3                  # only the 0.34 survives
    assert v[1][1] == 0


def test_headline_counts(monkeypatch):
    # tropics = latitude rows with |lat| <= 30: r = 60..119 (60 rows x 360 cells = 21600)
    baa = {(r, c): 1 for r in range(60, 66) for c in range(360)}              # 2160 stressed -> 10.0 %
    baa.update({(80, 0): 3, (80, 1): 4, (150, 0): 3, (150, 1): 2})            # 3 alert cells (>= 3)
    land = {(r, c) for r in range(100, 102) for c in range(360)}              # two land rows: no data
    payload = table(anom={(r, c): 1.5 for r in range(100, 110) for c in range(360)}, baa=baa)
    for row in payload["table"]["rows"]:
        r = round(row[1] - LAT0)
        if (r, round(row[2] - LON0)) in land:
            row[3] = row[4] = None
    monkeypatch.setattr(oh.requests, "get", fake_get(payload))
    c = get_body()["counts"]
    tropics_valid = 21600 - 720
    assert c["ocean_cells"] == 64800 - 720
    assert c["alert_cells"] == 3
    assert c["stressed_tropics_pct"] == round(100 * (2160 + 2) / tropics_valid, 1)   # the two alert cells at r=80 are in the tropics
    assert c["warm_pct"] == round(100 * (8 * 360) / (64800 - 720), 1)          # 8 water rows at +1.5 C


def test_mean_anomaly_is_area_weighted(monkeypatch):
    # +2 C for |lat| < 45 (71 % of the sphere's area), -2 C beyond: cos(lat) weighting makes the mean clearly positive,
    # while a plain average of cells would give 0
    anom = {(r, c): (2.0 if 45 <= r < 135 else -2.0) for r in range(180) for c in range(360)}
    monkeypatch.setattr(oh.requests, "get", fake_get(table(anom=anom)))
    got = get_body()["counts"]["mean_anomaly_c"]
    w = [math.cos(math.radians(LAT0 + r)) for r in range(180)]
    expected = sum(wi * (2.0 if 45 <= r < 135 else -2.0) for r, wi in enumerate(w)) / sum(w)
    assert got == round(expected, 2) and got > 0.7


def test_column_order_does_not_matter(monkeypatch):
    cols = ["CRW_BAA_7D_MAX", "longitude", "time", "CRW_SSTANOMALY", "latitude"]
    monkeypatch.setattr(oh.requests, "get", fake_get(table(baa={(7, 9): 2}, anom={(7, 9): 1.0}, columns=cols)))
    body = get_body()
    assert body["bleaching"]["values"][7][9] == "2"
    assert body["anomaly"]["values"][3][4] > 0                 # cell (7, 9) sits in 2-degree block (3, 4)


@pytest.mark.parametrize("payload", [
    {}, [], "x", {"table": None}, {"table": {"columnNames": COLUMNS, "rows": "nope"}},
    {"table": {"columnNames": ["time", "latitude", "longitude"], "rows": [[WHEN, 0, 0]] * 70000}},
    {"table": {"columnNames": COLUMNS, "rows": [[WHEN, 0, 0, 0, 0]] * 100}},
    {"message": "Your query produced no matching results."},
])
def test_unexpected_format_is_a_502(monkeypatch, payload):
    monkeypatch.setattr(oh.requests, "get", fake_get(payload))
    r = client.get("/api/ocean-heat")
    assert r.status_code == 502 and "unexpected format" in r.json()["detail"]


def test_a_partial_grid_is_refused(monkeypatch):
    monkeypatch.setattr(oh.requests, "get", fake_get(table(keep=lambda r, c: r % 2 == 0)))
    assert client.get("/api/ocean-heat").status_code == 502


def test_rows_with_bad_coordinates_are_skipped(monkeypatch):
    payload = table()
    payload["table"]["rows"][:5] = [[WHEN, 95, 0, 1, 1], [WHEN, 0, 999, 1, 1], [WHEN, "x", 0, 1, 1], [WHEN, 0, 0], None]
    monkeypatch.setattr(oh.requests, "get", fake_get(payload))
    assert get_body()["counts"]["ocean_cells"] == 64800 - 5      # the five bad rows leave their cells empty


def test_a_grid_bigger_than_asked_for_is_refused(monkeypatch):
    payload = table()
    payload["table"]["rows"].append([WHEN, 0, 0, 1, 1])
    monkeypatch.setattr(oh.requests, "get", fake_get(payload))
    assert client.get("/api/ocean-heat").status_code == 502


def test_oversized_response_is_refused(monkeypatch):
    big = fake_get()

    def get(url, headers=None, timeout=None):
        r = big(url, headers=headers, timeout=timeout)
        r.content = b"x" * (oh.MAX_BYTES + 1)
        return r

    monkeypatch.setattr(oh.requests, "get", get)
    assert client.get("/api/ocean-heat").status_code == 502


def test_upstream_down_is_a_502_and_server_errors_are_retried(monkeypatch):
    getter = fake_get(status=503)
    monkeypatch.setattr(oh.requests, "get", getter)
    r = client.get("/api/ocean-heat")
    assert r.status_code == 502 and "HTTP 503" in r.json()["detail"] and len(getter.calls) == 2
    cache_module._store.clear()
    monkeypatch.setattr(oh.requests, "get", fake_get(raises=requests.Timeout()))
    assert "Timeout" in client.get("/api/ocean-heat").json()["detail"]


def test_a_503_then_success_is_served(monkeypatch):
    getter = fake_get(statuses=[503, 200])
    monkeypatch.setattr(oh.requests, "get", getter)
    assert get_body()["counts"]["ocean_cells"] == 64800 and len(getter.calls) == 2


def test_a_client_error_is_not_retried(monkeypatch):
    getter = fake_get(status=400)
    monkeypatch.setattr(oh.requests, "get", getter)
    assert client.get("/api/ocean-heat").status_code == 502 and len(getter.calls) == 1


def test_noaa_that_is_days_behind_is_flagged_stale(monkeypatch):
    old = (datetime.now(timezone.utc) - timedelta(days=9)).strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(oh.requests, "get", fake_get(table(when=old)))
    assert get_body()["stale"] is True


def test_a_recent_day_is_not_stale(monkeypatch):
    recent = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(oh.requests, "get", fake_get(table(when=recent)))
    assert get_body()["stale"] is False


def test_serves_last_good_copy_and_flags_it_stale(monkeypatch):
    recent = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(oh.requests, "get", fake_get(table(when=recent, baa={(5, 5): 4})))
    assert get_body()["stale"] is False
    (key,) = [k for k in cache_module._store if k[0] == "fetch_ocean_heat"]
    stamp, value = cache_module._store[key]
    old = time.time() - (oh.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old - 1, value)           # expired and old
    oh._last.update(at=0.0, value=None)
    monkeypatch.setattr(oh.requests, "get", fake_get(status=503))
    body = get_body()
    assert body["stale"] is True and body["bleaching"]["values"][5][5] == "4"


def test_one_download_per_ttl(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(oh.requests, "get", getter)
    for _ in range(3):
        assert client.get("/api/ocean-heat").status_code == 200
    assert len(getter.calls) == 1


def test_concurrent_callers_share_one_download(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(oh.requests, "get", getter)
    assert client.get("/api/ocean-heat").status_code == 200
    cache_module._store.clear()                            # the 6 h cache expires ...
    assert client.get("/api/ocean-heat").status_code == 200   # ... but a download from the last minute is reused
    assert len(getter.calls) == 1
    oh._last["at"] = time.time() - oh.SINGLE_FLIGHT_SECONDS - 1
    cache_module._store.clear()
    assert client.get("/api/ocean-heat").status_code == 200   # an older one is not
    assert len(getter.calls) == 2


def test_a_failed_download_is_not_reused(monkeypatch):
    monkeypatch.setattr(oh.requests, "get", fake_get(status=503))
    assert client.get("/api/ocean-heat").status_code == 502
    assert oh._last["value"] is None
