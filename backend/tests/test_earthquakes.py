import time
from unittest.mock import MagicMock

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.earthquakes as eq
from main import app

client = TestClient(app)

# "Current time" for the window maths. Anchored to the real clock (taken once) because the cached
# feed records its own real fetch time, and `stale` compares the two.
NOW = time.time()


def feature(quake_id, mag, minutes_ago, place="10 km N of Testville, Japan", lon=140.0, lat=36.0,
            depth=10.0, **props):
    base = {
        "mag": mag,
        "place": place,
        "time": int((NOW - minutes_ago * 60) * 1000),
        "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{quake_id}",
        "felt": None,
        "alert": None,
        "tsunami": 0,
        "magType": "mb",
        "type": "earthquake",
    }
    base.update(props)
    return {"type": "Feature", "id": quake_id, "properties": base,
            "geometry": {"type": "Point", "coordinates": [lon, lat, depth]}}


def response(features, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {"type": "FeatureCollection", "features": features}
    return r


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(eq.time, "sleep", lambda s: None)


@pytest.fixture
def usgs(monkeypatch):
    """Patch the upstream call; returns the mock so tests can set side effects / count calls."""
    mock = MagicMock(return_value=response([]))
    monkeypatch.setattr(eq.requests, "get", mock)
    return mock


SAMPLE = [
    feature("a_new", 5.2, 10),                                       # 10 min ago, M5.2
    feature("b_hour", 3.1, 50, place="5 km SW of Ridgecrest, CA", lon=-117.7, lat=35.6),
    feature("c_day", 6.4, 600, place="south of the Fiji Islands", lon=-178.0, lat=-24.0, depth=500.0),
    feature("d_week", 4.6, 3 * 24 * 60, place="Mid-Atlantic Ridge", lon=-30.0, lat=10.0),
    feature("e_old", 7.1, 9 * 24 * 60),                               # older than 7 days
    feature("f_small_jp", 2.6, 30),                                   # Japan again
]


# ---------- severity + region helpers ----------

@pytest.mark.parametrize("mag,expected", [
    (2.5, "info"), (4.4, "info"), (4.5, "mild"), (5.9, "mild"),
    (6.0, "moderate"), (6.9, "moderate"), (7.0, "extreme"), (9.1, "extreme"),
])
def test_severity_thresholds(mag, expected):
    assert eq.severity_for_magnitude(mag) == expected


@pytest.mark.parametrize("place,expected", [
    ("12 km NNE of Fukushima, Japan", "Japan"),
    ("5 km SW of Ridgecrest, CA", "California"),
    ("30 km E of Anchorage, Alaska", "Alaska"),
    ("south of the Fiji Islands", "Fiji Islands"),
    ("Mid-Atlantic Ridge", "Mid-Atlantic Ridge"),
    ("Fiji region", "Fiji region"),
    ("10 km SW of Hawthorne", "Hawthorne"),
    ("", "Unknown"),
    (None, "Unknown"),
])
def test_region_from_place(place, expected):
    assert eq.region_from_place(place) == expected


# ---------- parsing ----------

def test_parse_drops_bad_rows_and_dedups():
    bad = [
        feature("blast", 3.0, 5, type="quarry blast"),
        feature("nomag", None, 5),
        feature("badlat", 4.0, 5, lat=123.0),
        feature("dup", 4.0, 5),
        feature("dup", 4.0, 6),
        {"id": "nogeom", "properties": {"mag": 3, "time": 1, "type": "earthquake"}, "geometry": None},
        "not-a-dict",
        feature("ok", 4.8, 1, felt=42, alert="orange", tsunami=1),
    ]
    events = eq._parse_features({"features": bad})
    assert [e["id"] for e in events] == ["ok", "dup"]  # newest first
    ok = events[0]
    assert ok["felt"] == 42 and ok["alert"] == "orange" and ok["tsunami"] is True


def test_parse_handles_garbage_payload():
    assert eq._parse_features(None) == []
    assert eq._parse_features({}) == []
    assert eq._parse_features({"features": None}) == []


def test_parse_ignores_unknown_pager_alert_values():
    events = eq._parse_features({"features": [feature("x", 4.0, 1, alert="purple")]})
    assert events[0]["alert"] is None


# ---------- response builder ----------

def test_envelope_shape_and_item_fields(usgs):
    usgs.return_value = response(SAMPLE)
    data = eq.build_earthquake_response(window="24h", now=NOW)
    assert data["layer"] == "earthquakes"
    assert data["source"].startswith("USGS")
    assert data["stale"] is False
    assert data["count"] == len(data["items"]) == data["total_matching"] == 4
    item = data["items"][0]
    for key in ("id", "lat", "lon", "title", "severity", "value", "unit", "time", "url", "source",
                "place", "region", "depth_km", "mag_type", "felt", "alert", "tsunami"):
        assert key in item
    assert item["id"] == "a_new"
    assert item["title"] == "M 5.2 — 10 km N of Testville, Japan"
    assert item["severity"] == "mild" and item["unit"] == "M" and item["source"] == "USGS"
    assert item["time"].endswith("Z") and item["region"] == "Japan"


def test_items_are_newest_first(usgs):
    usgs.return_value = response(SAMPLE)
    ids = [i["id"] for i in eq.build_earthquake_response(window="7d", now=NOW)["items"]]
    assert ids == ["a_new", "f_small_jp", "b_hour", "c_day", "d_week"]


def test_windows(usgs):
    usgs.return_value = response(SAMPLE)
    ids = lambda w: [i["id"] for i in eq.build_earthquake_response(window=w, now=NOW)["items"]]
    assert ids("1h") == ["a_new", "f_small_jp", "b_hour"]
    assert ids("24h") == ["a_new", "f_small_jp", "b_hour", "c_day"]
    assert "d_week" in ids("7d") and "e_old" not in ids("7d")


def test_min_mag_filter(usgs):
    usgs.return_value = response(SAMPLE)
    data = eq.build_earthquake_response(window="7d", min_mag=4.5, now=NOW)
    assert [i["id"] for i in data["items"]] == ["a_new", "c_day", "d_week"]


def test_region_filter_is_case_insensitive_and_uses_derived_region(usgs):
    usgs.return_value = response(SAMPLE)
    jp = eq.build_earthquake_response(window="24h", region="japan", now=NOW)
    assert [i["id"] for i in jp["items"]] == ["a_new", "f_small_jp"]
    ca = eq.build_earthquake_response(window="24h", region="California", now=NOW)
    assert [i["id"] for i in ca["items"]] == ["b_hour"]
    assert eq.build_earthquake_response(window="24h", region="Atlantis", now=NOW)["items"] == []


def test_counts_ignore_filters(usgs):
    usgs.return_value = response(SAMPLE)
    unfiltered = eq.build_earthquake_response(window="24h", now=NOW)["counts"]
    filtered = eq.build_earthquake_response(window="1h", min_mag=6, region="Japan", now=NOW)["counts"]
    assert unfiltered == filtered
    assert unfiltered["last_hour"] == 3 and unfiltered["last_24h"] == 4 and unfiltered["last_7d"] == 5
    assert unfiltered["m4_5_24h"] == 2 and unfiltered["m6_24h"] == 1
    assert unfiltered["strongest_24h"] == {"id": "c_day", "mag": 6.4, "place": "south of the Fiji Islands"}


def test_counts_when_nothing_recent(usgs):
    usgs.return_value = response([feature("old", 5.0, 5 * 24 * 60)])
    counts = eq.build_earthquake_response(window="24h", now=NOW)["counts"]
    assert counts["last_24h"] == 0 and counts["strongest_24h"] is None


def test_regions_list_is_sorted_by_count_and_respects_window(usgs):
    usgs.return_value = response(SAMPLE)
    regions = eq.build_earthquake_response(window="24h", now=NOW)["regions"]
    assert regions[0] == {"name": "Japan", "count": 2}
    assert {r["name"] for r in regions} == {"Japan", "California", "Fiji Islands"}


def test_limit_keeps_strongest_but_returns_newest_first(usgs):
    usgs.return_value = response([feature(f"q{i}", 3.0 + i / 10, i) for i in range(10)])
    data = eq.build_earthquake_response(window="24h", limit=3, now=NOW)
    assert data["count"] == 3 and data["total_matching"] == 10
    # q9 is the strongest but the OLDEST (i minutes ago); the kept three come back newest first
    assert [i["id"] for i in data["items"]] == ["q7", "q8", "q9"]


# ---------- caching, retry, staleness ----------

def test_one_upstream_call_serves_many_queries(usgs):
    usgs.return_value = response(SAMPLE)
    for window in ("1h", "24h", "7d"):
        eq.build_earthquake_response(window=window, now=NOW)
    eq.build_earthquake_response(window="7d", min_mag=5, region="Japan", now=NOW)
    assert usgs.call_count == 1


def test_retries_once_on_5xx_then_succeeds(usgs):
    usgs.side_effect = [response([], status=503), response(SAMPLE)]
    data = eq.build_earthquake_response(window="7d", now=NOW)
    assert usgs.call_count == 2 and data["count"] == 5


def test_retries_once_on_network_error(usgs):
    usgs.side_effect = [requests.ConnectionError("boom"), response(SAMPLE)]
    assert eq.build_earthquake_response(window="7d", now=NOW)["count"] == 5


def test_does_not_retry_on_4xx(usgs):
    usgs.return_value = response([], status=404)
    assert "error" in eq.build_earthquake_response(now=NOW)
    assert usgs.call_count == 1


def test_error_when_upstream_down_and_nothing_cached(usgs):
    usgs.side_effect = requests.ConnectionError("down")
    result = eq.build_earthquake_response(now=NOW)
    assert "error" in result and usgs.call_count == 2


def test_serves_last_good_copy_and_flags_stale_when_upstream_fails(usgs):
    usgs.return_value = response(SAMPLE)
    fresh = eq.build_earthquake_response(window="7d", now=time.time())
    assert fresh["stale"] is False

    # expire the cached entry, then make USGS fail: we must keep serving the old data
    for key, (stored_at, value) in list(cache_module._store.items()):
        cache_module._store[key] = (stored_at - 10_000, value)
    usgs.side_effect = requests.ConnectionError("down")

    later = eq.build_earthquake_response(window="7d", now=time.time() + 3600)
    assert "error" not in later and later["count"] == fresh["count"]
    assert later["stale"] is True


# ---------- HTTP endpoint ----------

def test_endpoint_returns_envelope(usgs):
    usgs.return_value = response([feature("live", 5.5, 2)])  # 2 minutes ago on the real clock
    r = client.get("/api/earthquakes", params={"window": "1h"})
    assert r.status_code == 200
    body = r.json()
    assert body["layer"] == "earthquakes" and body["count"] == 1
    assert body["counts"]["last_hour"] == 1


@pytest.mark.parametrize("params", [
    {"window": "30d"},
    {"window": ""},
    {"min_mag": -1},
    {"min_mag": 11},
    {"min_mag": "nan"},
    {"region": "x" * 81},
])
def test_endpoint_rejects_bad_params_before_any_upstream_call(usgs, params):
    assert client.get("/api/earthquakes", params=params).status_code == 400
    assert usgs.call_count == 0


def test_endpoint_502_when_usgs_unavailable(usgs):
    usgs.side_effect = requests.ConnectionError("down")
    r = client.get("/api/earthquakes")
    assert r.status_code == 502
    assert "USGS" in r.json()["detail"]


def test_endpoint_is_gzip_compressed_when_large(usgs):
    usgs.return_value = response([feature(f"q{i}", 3.0, i % 600) for i in range(400)])
    r = client.get("/api/earthquakes", params={"window": "24h"}, headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    assert r.json()["count"] == 400
