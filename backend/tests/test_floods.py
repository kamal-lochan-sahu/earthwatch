import time
from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.floods as floods
import data.hazards.openmeteo as om
from main import app

client = TestClient(app)
TODAY = floods._today()


def daily(past=1000.0, ahead=None, past_days=30, forecast_days=8):
    """A Flood API 'daily' block: `past_days` flat days before today, then today + 7 forecast days."""
    ahead = ahead if ahead is not None else [1000.0] * forecast_days
    t0 = date.fromisoformat(TODAY)
    days = [(t0 - timedelta(days=past_days - i)).isoformat() for i in range(past_days)]
    days += [(t0 + timedelta(days=i)).isoformat() for i in range(len(ahead))]
    past_vals = past if isinstance(past, list) else [past] * past_days
    return {"time": days, "river_discharge": list(past_vals) + list(ahead)}


def row(**kw):
    return {"latitude": 1.0, "longitude": 2.0, "daily": daily(**kw)}


def fake_get(row_factory=None, status=200):
    calls = []

    def get(url, params=None, headers=None, timeout=None):
        calls.append((url, params))
        r = MagicMock()
        r.status_code = status
        n = len(params["latitude"].split(","))
        if status == 200:
            factory = row_factory or (lambda i: row())
            r.json.return_value = [factory(i) for i in range(n)]
        else:
            r.json.return_value = {"error": True, "reason": "Daily API request limit exceeded"}
        return r

    get.calls = calls
    return get


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(om.time, "sleep", lambda s: None)


def item(**kw):
    return floods._item("Test River", "Testville", 10.0, 20.0, row(**kw), TODAY)


def test_severity_thresholds():
    assert floods.severity_for_ratio(None) == "info"
    assert floods.severity_for_ratio(1.59) == "info"
    assert floods.severity_for_ratio(1.6) == "mild"
    assert floods.severity_for_ratio(2.5) == "moderate"
    assert floods.severity_for_ratio(4) == "extreme"


def test_rivers_table_is_valid():
    assert 40 <= len(floods.RIVERS) <= 80
    assert all(-90 <= la <= 90 and -180 <= lo <= 180 for la, lo in floods.POINTS)
    ids = [f"{floods._slug(r)}-{floods._slug(p)}" for r, p, _, _ in floods.RIVERS]
    assert len(set(ids)) == len(ids)


def test_ratio_peak_and_baseline():
    it = item(past=1000.0, ahead=[1100.0, 1500.0, 3000.0, 2500.0, 2000.0, 1800.0, 1500.0, 1200.0])
    assert it["baseline"] == 1000.0 and it["value"] == 1100.0
    assert it["peak"] == 3000.0 and it["ratio"] == 3.0 and it["severity"] == "moderate"
    assert it["peak_date"] == (date.fromisoformat(TODAY) + timedelta(days=2)).isoformat()
    assert it["title"] == "Test River at Testville: 1,100 m³/s"
    assert it["time"] == f"{TODAY}T00:00:00Z"


def test_baseline_is_the_median_so_one_past_spike_does_not_move_it():
    past = [1000.0] * 29 + [90000.0]
    assert item(past=past)["baseline"] == 1000.0


def test_trend():
    assert item(ahead=[1000.0] * 7 + [1500.0])["trend"] == "rising"
    assert item(ahead=[1000.0] * 7 + [600.0])["trend"] == "falling"
    assert item(ahead=[1000.0] * 8)["trend"] == "steady"


def test_gaps_and_unusable_rivers_are_skipped():
    assert item(past=[None] * 30) is None                                  # no history at all
    assert item(past=[1000.0] * 5 + [None] * 25) is None                   # too little history
    assert item(ahead=[None] * 8) is None                                  # no forecast
    assert item(past=5.0, ahead=[5.0] * 8) is None                         # trickle: below the minimum flow
    assert floods._item("R", "P", 0, 0, {"latitude": 0}, TODAY) is None   # no daily block
    assert floods._item("R", "P", 0, 0, {"daily": {"time": ["x"], "river_discharge": []}}, TODAY) is None


def test_null_forecast_days_are_ignored_not_fatal():
    it = item(ahead=[1200.0, None, 2000.0, None, None, None, None, None])
    assert it["peak"] == 2000.0


def test_endpoint_envelope_sorted_by_ratio(monkeypatch):
    def factory(i):
        return row(past=1000.0, ahead=[1000.0] * 7 + [1000.0 * (1 + i % 5)])
    getter = fake_get(factory)
    monkeypatch.setattr(om.requests, "get", getter)
    r = client.get("/api/floods")
    assert r.status_code == 200
    body = r.json()
    assert body["layer"] == "floods" and body["count"] == len(floods.RIVERS) and body["stale"] is False
    ratios = [it["ratio"] for it in body["items"]]
    assert ratios == sorted(ratios, reverse=True)
    assert body["counts"]["max_ratio"] == 5.0
    assert body["counts"]["elevated"] == sum(1 for x in ratios if x >= 1.6)
    (url, params), = getter.calls
    assert url == "https://flood-api.open-meteo.com/v1/flood"
    assert params["daily"] == "river_discharge" and params["past_days"] == 30 and params["forecast_days"] == 7
    assert len(params["latitude"].split(",")) == len(floods.RIVERS)


def test_no_usable_data_is_a_502(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(lambda i: {"latitude": 0, "longitude": 0}))
    r = client.get("/api/floods")
    assert r.status_code == 502 and "no usable river data" in r.json()["detail"]


def test_rate_limit_is_a_502_with_reason(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))
    r = client.get("/api/floods")
    assert r.status_code == 502 and "limit" in r.json()["detail"].lower()


def test_serves_last_good_copy_and_flags_it_stale(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get())
    assert client.get("/api/floods").json()["stale"] is False
    (key,) = [k for k in cache_module._store if k[0] == "fetch_rivers"]
    stamp, value = cache_module._store[key]
    old = time.time() - (floods.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old, value)
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))
    body = client.get("/api/floods").json()
    assert body["count"] == len(floods.RIVERS) and body["stale"] is True
