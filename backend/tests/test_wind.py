import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.openmeteo as om
import data.hazards.wind as wind
from main import app

client = TestClient(app)


def current_row(speed=20.0, direction=270, gusts=35.0, time_text="2026-10-27T10:00"):
    return {"latitude": 0.0, "longitude": 0.0,
            "current": {"time": time_text, "interval": 900, "wind_speed_10m": speed,
                        "wind_direction_10m": direction, "wind_gusts_10m": gusts}}


def fake_get(row_factory=None, status=200):
    """requests.get stand-in: answers each chunk with one row per requested coordinate."""
    calls = []

    def get(url, params=None, headers=None, timeout=None):
        calls.append(params)
        r = MagicMock()
        r.status_code = status
        n = len(params["latitude"].split(","))
        if status == 200:
            factory = row_factory or (lambda i: current_row())
            r.json.return_value = [factory(i) for i in range(n)]
        else:
            r.json.return_value = {"error": True, "reason": "Daily API request limit exceeded"}
        return r

    get.calls = calls
    return get


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(om.time, "sleep", lambda s: None)


def test_severity_thresholds():
    assert wind.severity_for_speed(0) == "info"
    assert wind.severity_for_speed(29.9) == "info"
    assert wind.severity_for_speed(30) == "mild"
    assert wind.severity_for_speed(50) == "moderate"
    assert wind.severity_for_speed(75) == "extreme"


def test_compass_points():
    assert wind.compass(0) == "N"
    assert wind.compass(359) == "N"
    assert wind.compass(90) == "E"
    assert wind.compass(225) == "SW"


def test_grid_is_global_and_valid():
    assert len(wind.GRID) == 264
    assert len(set(wind.GRID)) == 264
    assert all(-90 <= lat <= 90 and -180 <= lon <= 180 for lat, lon in wind.GRID)


def test_endpoint_envelope_and_bearing(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(lambda i: current_row(speed=42.0, direction=270)))
    r = client.get("/api/wind")
    assert r.status_code == 200
    body = r.json()
    assert body["layer"] == "wind" and body["source"] == "Open-Meteo"
    assert body["count"] == 264 and body["stale"] is False
    first = body["items"][0]
    # wind FROM the west (270) blows TOWARDS the east (90)
    assert first["direction"] == 270 and first["bearing"] == 90
    assert first["value"] == 42.0 and first["unit"] == "km/h" and first["severity"] == "mild"
    assert first["title"] == "Wind 42 km/h from W"
    assert first["time"] == "2026-10-27T10:00:00Z"
    assert body["counts"] == {"max_kmh": 42.0, "strong": 0}
    ids = [it["id"] for it in body["items"]]
    assert len(set(ids)) == len(ids)


def test_requests_are_chunked_and_batched(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(om.requests, "get", getter)
    assert client.get("/api/wind").status_code == 200
    sizes = [len(p["latitude"].split(",")) for p in getter.calls]
    assert sizes == [80, 80, 80, 24]
    assert all(len(p["latitude"].split(",")) == len(p["longitude"].split(",")) for p in getter.calls)
    assert all("timezone" not in p for p in getter.calls)  # UTC default works for any number of points


def test_malformed_rows_are_skipped(monkeypatch):
    def factory(i):
        if i % 3 == 0:
            return {"latitude": 0, "longitude": 0}                       # no current block
        if i % 3 == 1:
            return current_row(speed=None)                                # null speed
        return current_row(speed=12.0, direction=45)
    monkeypatch.setattr(om.requests, "get", fake_get(factory))
    body = client.get("/api/wind").json()
    assert 0 < body["count"] < 264
    assert all(it["value"] == 12.0 for it in body["items"])


def test_rate_limit_is_a_502_with_reason(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))
    r = client.get("/api/wind")
    assert r.status_code == 502
    assert "limit" in r.json()["detail"].lower()


def test_serves_last_good_copy_when_upstream_fails_and_flags_it_stale(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get())
    assert client.get("/api/wind").json()["stale"] is False

    # age the cached copy past its TTL and past the stale threshold, then break the upstream
    (key,) = [k for k in cache_module._store if k[0] == "fetch_wind_grid"]
    stamp, value = cache_module._store[key]
    old = time.time() - (wind.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old, value)
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))

    body = client.get("/api/wind").json()
    assert body["count"] == 264 and body["stale"] is True


def test_one_failed_chunk_fails_the_whole_grid(monkeypatch):
    good = fake_get()
    state = {"n": 0}

    def flaky(url, params=None, headers=None, timeout=None):
        state["n"] += 1
        if state["n"] == 2:
            return fake_get(status=429)(url, params)
        return good(url, params)

    monkeypatch.setattr(om.requests, "get", flaky)
    assert client.get("/api/wind").status_code == 502
