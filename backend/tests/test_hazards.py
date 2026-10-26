import time
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
import requests
from fastapi.testclient import TestClient

import data.hazards.eonet as eonet
import data.hazards.gdacs as gdacs
from data.hazards.feeds import build_hazards_response, build_layer_response
from main import app

client = TestClient(app)
NOW = time.time()


def iso(hours_ago):
    return datetime.fromtimestamp(NOW - hours_ago * 3600, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ev(eid, cat, title, hours_ago=2, coords=(10.0, 20.0), mag=None, unit=None, gtype="Point", **extra):
    geom = {"date": iso(hours_ago), "type": gtype, "coordinates": list(coords) if gtype == "Point" else coords}
    if mag is not None:
        geom.update(magnitudeValue=mag, magnitudeUnit=unit)
    base = {"id": eid, "title": title, "closed": None, "link": f"https://eonet.gsfc.nasa.gov/api/v3/events/{eid}",
            "categories": [{"id": cat, "title": cat}], "sources": [{"id": "X", "url": f"https://example.org/{eid}"}],
            "geometry": [geom]}
    base.update(extra)
    return base


def tc(eid, name, alert="Orange", wind=150, lon=130.0, lat=15.0, current="true", todate=None):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
        "eventtype": "TC", "eventid": eid, "name": name, "description": f"Typhoon <b>{name}</b>", "alertlevel": alert,
        "fromdate": todate or iso(48), "todate": todate or iso(1), "iscurrent": current, "country": "Philippines",
        "severitydata": {"severity": wind, "severityunit": "km/h"}, "url": {"report": f"https://www.gdacs.org/r/{eid}"}}}


def resp(payload, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = payload
    return r


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(eonet.time, "sleep", lambda s: None)
    monkeypatch.setattr(gdacs.time, "sleep", lambda s: None)


@pytest.fixture
def upstream(monkeypatch):
    """Patch both upstreams. Set .eonet / .gdacs to the feature lists to return."""
    state = MagicMock()
    state.eonet, state.gdacs = [], []
    state.eonet_status = state.gdacs_status = 200

    def eonet_get(url, **kw):
        return resp({"events": state.eonet}, state.eonet_status)

    def gdacs_get(url, **kw):
        return resp({"features": state.gdacs}, state.gdacs_status)

    state.eonet_mock, state.gdacs_mock = MagicMock(side_effect=eonet_get), MagicMock(side_effect=gdacs_get)

    def dispatch(url, **kw):          # eonet.requests and gdacs.requests are the same module object
        return (state.gdacs_mock if "gdacs" in url else state.eonet_mock)(url, **kw)

    monkeypatch.setattr(requests, "get", dispatch)
    return state


# ---------------- EONET ----------------

def test_wildfire_units_and_severity(upstream):
    upstream.eonet = [
        ev("EONET_1", "wildfires", "Big Fire", mag=100000, unit="acres"),   # ~40,469 ha -> extreme
        ev("EONET_2", "wildfires", "Medium Fire", mag=20000, unit="acres"),  # ~8,094 ha -> moderate
        ev("EONET_3", "wildfires", "Unknown Fire"),
    ]
    r = build_layer_response("wildfires")
    by_id = {i["id"]: i for i in r["items"]}
    assert by_id["EONET_1"]["severity"] == "extreme" and by_id["EONET_1"]["unit"] == "ha"
    assert by_id["EONET_2"]["severity"] == "moderate"
    assert by_id["EONET_3"]["severity"] == "info" and by_id["EONET_3"]["value"] is None
    assert [i["id"] for i in r["items"]][0] == "EONET_1"       # most severe first
    assert r["counts"]["active"] == 3 and r["layer"] == "wildfires" and r["stale"] is False


def test_layers_are_split_by_category(upstream):
    upstream.eonet = [
        ev("EONET_1", "wildfires", "Fire"),
        ev("EONET_2", "volcanoes", "Etna"),
        ev("EONET_3", "seaLakeIce", "Iceberg A23A", mag=1000, unit="NM^2"),
        ev("EONET_4", "seaLakeIce", "Sea ice extent"),               # not an iceberg -> ignored
        ev("EONET_5", "floods", "Flood"),                            # unknown category -> ignored
    ]
    assert [i["id"] for i in build_layer_response("volcanoes")["items"]] == ["EONET_2"]
    ice = build_layer_response("icebergs")["items"]
    assert [i["id"] for i in ice] == ["EONET_3"] and ice[0]["unit"] == "km²" and ice[0]["value"] == 3430
    assert upstream.eonet_mock.call_count == 1                      # one shared upstream call


def test_old_closed_future_and_malformed_events_are_dropped(upstream):
    upstream.eonet = [
        ev("EONET_OLD", "wildfires", "Quiet fire", hours_ago=24 * 40),
        ev("EONET_FUT", "wildfires", "Future fire", hours_ago=-48),
        ev("EONET_CLOSED", "wildfires", "Closed", closed="2026-01-01T00:00:00Z"),
        ev("EONET_BAD", "wildfires", "Bad coords", coords=(999, 999)),
        {"id": "EONET_NOGEO", "title": "x", "categories": [{"id": "wildfires"}], "geometry": []},
        "garbage",
        ev("EONET_OK", "wildfires", "Fine"),
    ]
    assert [i["id"] for i in build_layer_response("wildfires")["items"]] == ["EONET_OK"]


def test_polygon_centroid_and_antimeridian(upstream):
    ring = [[179.0, 10.0], [-179.0, 10.0], [-179.0, 12.0], [179.0, 12.0]]
    upstream.eonet = [ev("EONET_P", "seaLakeIce", "Iceberg B", coords=[ring], gtype="Polygon")]
    item = build_layer_response("icebergs")["items"][0]
    assert abs(abs(item["lon"]) - 180) < 1.1 and item["lat"] == 11.0


def test_eonet_storm_wind_conversion(upstream):
    upstream.eonet = [ev("EONET_S", "severeStorms", "Cyclone Zeta", mag=100, unit="kts")]   # 185 km/h
    item = build_layer_response("storms")["items"][0]
    assert item["value"] == 185 and item["unit"] == "km/h" and item["severity"] == "extreme"


# ---------------- GDACS + storms merge ----------------

def test_gdacs_cyclone_parsing(upstream):
    upstream.gdacs = [tc("1001", "RAGASA-25", alert="Red", wind=230), tc("1002", "OLD-25", current="false", todate=iso(24 * 10))]
    items = build_layer_response("storms")["items"]
    assert [i["id"] for i in items] == ["gdacs-TC-1001"]            # the finished cyclone is dropped
    i = items[0]
    assert i["severity"] == "extreme" and i["value"] == 230 and i["title"] == "Typhoon RAGASA-25"
    assert i["source"] == "GDACS" and i["alert"] == "red" and i["url"].startswith("https://")


def test_alert_level_and_wind_take_the_higher_severity(upstream):
    upstream.gdacs = [tc("1", "A-25", alert="Green", wind=200)]     # wind says extreme, alert says mild
    assert build_layer_response("storms")["items"][0]["severity"] == "extreme"


def test_storms_dedupe_eonet_against_gdacs(upstream):
    upstream.gdacs = [tc("1001", "RAGASA-25", lon=130.0, lat=15.0)]
    upstream.eonet = [
        ev("EONET_DUP_NAME", "severeStorms", "Typhoon Ragasa", coords=(160.0, 30.0)),   # same name, far away
        ev("EONET_DUP_NEAR", "severeStorms", "Tropical Storm 22W", coords=(130.5, 15.5)),  # same place & time
        ev("EONET_OTHER", "severeStorms", "Cyclone Zeta", coords=(-60.0, 20.0)),            # a different storm
    ]
    ids = {i["id"] for i in build_layer_response("storms")["items"]}
    assert ids == {"gdacs-TC-1001", "EONET_OTHER"}


def test_gdacs_falls_back_to_second_query_shape(upstream):
    first = resp({}, 400)
    second = resp({"features": [tc("7", "BETA-25")]})
    upstream.gdacs_mock.side_effect = [first, second]
    assert build_layer_response("storms")["items"][0]["id"] == "gdacs-TC-7"
    assert upstream.gdacs_mock.call_count == 2


# ---------------- resilience ----------------

def test_one_source_down_still_serves_the_other_and_flags_partial(upstream):
    upstream.gdacs_status = 500
    upstream.eonet = [ev("EONET_S", "severeStorms", "Cyclone Zeta", coords=(-60.0, 20.0))]
    r = build_layer_response("storms")
    assert r["count"] == 1 and r["partial"] is True and r["stale"] is True


def test_everything_down_and_uncached_returns_error(upstream):
    upstream.eonet_status = upstream.gdacs_status = 503
    assert "error" in build_layer_response("storms")
    assert "error" in build_layer_response("wildfires")
    assert client.get("/api/wildfires").status_code == 502


def test_serves_last_good_copy_when_eonet_fails_later(upstream, monkeypatch):
    upstream.eonet = [ev("EONET_1", "wildfires", "Fire")]
    assert build_layer_response("wildfires")["count"] == 1
    for key in list(eonet.ttl_cache.__globals__["_store"]):          # expire the TTL, keep the copy
        t, v = eonet.ttl_cache.__globals__["_store"][key]
        eonet.ttl_cache.__globals__["_store"][key] = (t - 10_000, v)
    upstream.eonet_status = 500
    r = build_layer_response("wildfires", now=NOW + 10_000)
    assert r["count"] == 1 and r["stale"] is True


def test_network_exception_is_retried_then_reported(upstream):
    upstream.eonet_mock.side_effect = requests.ConnectionError("boom")
    assert "error" in build_layer_response("volcanoes")
    assert upstream.eonet_mock.call_count == 2


# ---------------- /api/hazards + endpoints ----------------

def test_hazards_combined_filters_and_orders(upstream):
    upstream.eonet = [
        ev("EONET_F", "wildfires", "Small fire"),
        ev("EONET_V", "volcanoes", "Etna"),
        ev("EONET_I", "seaLakeIce", "Iceberg A23A"),
    ]
    upstream.gdacs = [tc("1", "RAGASA-25", alert="Red", wind=230)]
    r = build_hazards_response()
    assert r["items"][0]["category"] == "storm" and r["counts"]["by_category"]["wildfire"] == 1
    assert build_hazards_response(categories=["volcano"])["count"] == 1
    assert {i["category"] for i in build_hazards_response(min_severity="mild")["items"]} == {"storm", "volcano"}


def test_endpoints_and_validation(upstream):
    upstream.eonet = [ev("EONET_F", "wildfires", "Fire")]
    for path in ("/api/wildfires", "/api/volcanoes", "/api/icebergs", "/api/storms", "/api/hazards"):
        assert client.get(path).status_code == 200
    assert client.get("/api/hazards?category=bogus").status_code == 400
    assert client.get("/api/hazards?min_severity=huge").status_code == 400
    assert client.get("/api/hazards?limit=0").status_code == 400
    assert client.get("/api/hazards?category=wildfire&limit=5").json()["count"] == 1
