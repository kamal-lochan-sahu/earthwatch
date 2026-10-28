import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.openmeteo as om
import data.hazards.waves as waves
from main import app

client = TestClient(app)


def wave_row(height=2.0, direction=270, period=9.5, time_text="2026-10-27T10:00"):
    return {"latitude": 0.0, "longitude": 0.0,
            "current": {"time": time_text, "interval": 3600, "wave_height": height,
                        "wave_direction": direction, "wave_period": period}}


def fake_get(row_factory=None, status=200):
    calls = []

    def get(url, params=None, headers=None, timeout=None):
        calls.append((url, params))
        r = MagicMock()
        r.status_code = status
        n = len(params["latitude"].split(","))
        if status == 200:
            factory = row_factory or (lambda i: wave_row())
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
    assert waves.severity_for_height(0.4) == "info"
    assert waves.severity_for_height(2.49) == "info"
    assert waves.severity_for_height(2.5) == "mild"
    assert waves.severity_for_height(4) == "moderate"
    assert waves.severity_for_height(6) == "extreme"


def test_grid_is_valid_and_open_ocean_only():
    assert 60 <= len(waves.GRID) <= 200          # a few hundred calls/day at most, see the quota maths
    assert len(set(waves.GRID)) == len(waves.GRID)
    assert all(-90 <= lat <= 90 and -180 <= lon <= 180 for lat, lon in waves.GRID)
    assert (-7.5, -22.5) in waves.GRID            # mid-Atlantic
    assert (7.5, 22.5) not in waves.GRID          # Central Africa
    assert (52.5, 7.5) not in waves.GRID          # North Sea coast


def test_endpoint_envelope(monkeypatch):
    getter = fake_get(lambda i: wave_row(height=3.2, direction=225, period=11.0))
    monkeypatch.setattr(om.requests, "get", getter)
    r = client.get("/api/waves")
    assert r.status_code == 200
    body = r.json()
    assert body["layer"] == "waves" and body["source"] == "Open-Meteo Marine"
    assert body["count"] == len(waves.GRID) and body["stale"] is False
    assert len({it["id"] for it in body["items"]}) == len(waves.GRID)
    assert body["items"][0]["id"] == "-52.5,-172.5"
    first = body["items"][0]
    assert first["value"] == 3.2 and first["unit"] == "m" and first["severity"] == "mild"
    assert first["direction"] == 225 and first["period"] == 11.0
    assert first["title"] == "Waves 3.2 m from SW · 11 s"
    assert first["time"] == "2026-10-27T10:00:00Z"
    assert body["counts"] == {"max_m": 3.2, "rough": len(waves.GRID)}
    assert all(u.startswith("https://marine-api.open-meteo.com/") for u, _ in getter.calls)
    assert all(p["current"] == "wave_height,wave_direction,wave_period" for _, p in getter.calls)


def test_requests_are_chunked(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(om.requests, "get", getter)
    assert client.get("/api/waves").status_code == 200
    sizes = [len(p["latitude"].split(",")) for _, p in getter.calls]
    assert sum(sizes) == len(waves.GRID) and max(sizes) <= om.CHUNK_SIZE


def test_points_without_data_are_left_out(monkeypatch):
    def factory(i):
        if i % 4 == 0:
            return wave_row(height=None, direction=None, period=None)   # e.g. under sea ice
        if i % 4 == 1:
            return {"latitude": 0, "longitude": 0}                       # no current block
        if i % 4 == 2:
            return wave_row(height=1.4, direction=None, period=None)     # height only
        return wave_row(height=1.4)
    monkeypatch.setattr(om.requests, "get", fake_get(factory))
    body = client.get("/api/waves").json()
    assert 0 < body["count"] < len(waves.GRID)
    assert all(it["value"] == 1.4 for it in body["items"])
    height_only = [it for it in body["items"] if it["direction"] is None]
    assert height_only and height_only[0]["title"] == "Waves 1.4 m"


def test_no_usable_data_is_a_502(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(lambda i: wave_row(height=None)))
    r = client.get("/api/waves")
    assert r.status_code == 502 and "no usable wave data" in r.json()["detail"]


def test_rate_limit_is_a_502_with_reason(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))
    r = client.get("/api/waves")
    assert r.status_code == 502 and "limit" in r.json()["detail"].lower()


def test_serves_last_good_copy_and_flags_it_stale(monkeypatch):
    monkeypatch.setattr(om.requests, "get", fake_get())
    assert client.get("/api/waves").json()["stale"] is False
    (key,) = [k for k in cache_module._store if k[0] == "fetch_wave_grid"]
    stamp, value = cache_module._store[key]
    old = time.time() - (waves.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old, value)
    monkeypatch.setattr(om.requests, "get", fake_get(status=429))
    body = client.get("/api/waves").json()
    assert body["count"] == len(waves.GRID) and body["stale"] is True
