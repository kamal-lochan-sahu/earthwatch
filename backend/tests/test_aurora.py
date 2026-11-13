import time

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.aurora as aurora
from main import app

client = TestClient(app)


def ovation(cells=None, observed="2026-10-30T11:30:00Z", forecast="2026-10-30T12:05:00Z", fill=0):
    """A full 360 x 181 OVATION payload; `cells` = {(lon, lat): percent} overrides `fill`."""
    cells = cells or {}
    coords = [[lon, lat, cells.get((lon, lat), fill)] for lon in range(360) for lat in range(-90, 91)]
    return {"Observation Time": observed, "Forecast Time": forecast,
            "Data Format": "[Longitude, Latitude, Aurora]", "coordinates": coords}


KP_DICTS = [
    {"time_tag": "2026-10-30T06:00:00", "Kp": 2.33, "a_running": 9, "station_count": 8},
    {"time_tag": "2026-10-30T09:00:00", "Kp": 5.33, "a_running": 56, "station_count": 8},
]
KP_TABLE = [["time_tag", "Kp", "a_running", "station_count"],
            ["2026-10-30 06:00:00.000", "1.33", "5", "6"],
            ["2026-10-30 09:00:00.000", "6.00", "39", "6"]]


def fake_get(aurora_payload=None, kp_payload=KP_DICTS, aurora_status=200, kp_status=200, raises=None):
    calls = []

    def get(url, headers=None, timeout=None):
        calls.append(url)
        if raises:
            raise raises
        r = type("R", (), {})()
        if url == aurora.OVATION_URL:
            r.status_code = aurora_status
            r.json = lambda: aurora_payload if aurora_payload is not None else ovation()
        else:
            r.status_code = kp_status
            r.json = lambda: kp_payload
        return r

    get.calls = calls
    return get


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(aurora.time, "sleep", lambda s: None)


def test_g_scale():
    assert aurora.g_scale(None) == 0
    assert aurora.g_scale(4.67) == 0
    assert aurora.g_scale(5) == 1 and aurora.g_scale(5.67) == 1
    assert aurora.g_scale(6) == 2 and aurora.g_scale(7.33) == 3
    assert aurora.g_scale(8.67) == 4 and aurora.g_scale(9) == 5


def test_endpoint_envelope_and_shrunk_grid(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(ovation({(3, 5): 50, (200, -70): 30})))
    r = client.get("/api/aurora")
    assert r.status_code == 200
    body = r.json()
    assert body["layer"] == "aurora" and body["source"] == "NOAA SWPC OVATION"
    assert body["count"] == 0 and body["items"] == []
    g = body["grid"]
    assert (g["rows"], g["cols"], g["step"], g["lat_min"], g["lon_min"]) == (91, 180, 2, -90, 0)
    assert len(g["values"]) == 91 and all(len(row) == 180 for row in g["values"])
    # 2 x 2 blocks keep the strongest cell: lat 5 -> row 47 (lat 4..5), lon 3 -> col 1 (lon 2..3)
    assert g["values"][(5 + 90) // 2][3 // 2] == 50
    assert g["values"][(-70 + 90) // 2][200 // 2] == 30
    assert body["counts"]["max_pct"] == 50
    assert body["counts"]["north_max_pct"] == 50 and body["counts"]["south_max_pct"] == 30
    assert body["observed_at"] == "2026-10-30T11:30:00Z" and body["forecast_at"] == "2026-10-30T12:05:00Z"
    assert body["counts"]["kp"] == 5.33 and body["counts"]["g_scale"] == 1
    assert body["counts"]["kp_time"] == "2026-10-30T09:00:00Z"


def test_pole_rows_and_equator_are_not_double_counted(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(ovation({(10, 90): 40, (10, -90): 25, (10, 0): 70})))
    body = client.get("/api/aurora").json()
    g = body["grid"]["values"]
    assert g[90][5] == 40 and g[0][5] == 25 and g[45][5] == 70   # lat 90 is its own last row
    c = body["counts"]
    assert c["north_max_pct"] == 40 and c["south_max_pct"] == 25 and c["max_pct"] == 70


def test_values_are_clamped_and_bad_rows_skipped(monkeypatch):
    payload = ovation({(0, 0): 250, (2, 2): -5})
    payload["coordinates"] += [[999, 0, 90], [0, 999, 90], ["x", 1, 2], [1, 1], None, [1, 1, None], [1, 1, "high"]]
    monkeypatch.setattr(aurora.requests, "get", fake_get(payload))
    g = client.get("/api/aurora").json()["grid"]["values"]
    assert g[45][0] == 100          # clamped
    assert g[46][1] == 0            # negative -> 0, nothing out of range leaked in
    assert max(max(r) for r in g) == 100


def test_kp_table_form_is_understood(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(kp_payload=KP_TABLE))
    c = client.get("/api/aurora").json()["counts"]
    assert c["kp"] == 6.0 and c["g_scale"] == 2


def test_kp_failure_still_serves_the_aurora(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(kp_status=503))
    r = client.get("/api/aurora")
    assert r.status_code == 200
    c = r.json()["counts"]
    assert c["kp"] is None and c["kp_time"] is None and c["g_scale"] == 0


def test_kp_out_of_range_is_ignored(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(kp_payload=[{"time_tag": "2026-10-30T09:00:00", "Kp": 42}]))
    assert client.get("/api/aurora").json()["counts"]["kp"] is None


@pytest.mark.parametrize("payload", [{"coordinates": "nope"}, {"coordinates": [[0, 0, 1]]}, ["x"], {}])
def test_unexpected_format_is_a_502(monkeypatch, payload):
    monkeypatch.setattr(aurora.requests, "get", fake_get(payload))
    r = client.get("/api/aurora")
    assert r.status_code == 502 and "unexpected format" in r.json()["detail"]


def test_upstream_down_is_a_502(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(aurora_status=503))
    r = client.get("/api/aurora")
    assert r.status_code == 502 and "HTTP 503" in r.json()["detail"]
    monkeypatch.setattr(aurora.requests, "get", fake_get(raises=requests.Timeout()))
    cache_module._store.clear()
    assert "Timeout" in client.get("/api/aurora").json()["detail"]


def test_a_client_error_is_not_retried(monkeypatch):
    getter = fake_get(aurora_status=404)
    monkeypatch.setattr(aurora.requests, "get", getter)
    assert client.get("/api/aurora").status_code == 502
    assert getter.calls.count(aurora.OVATION_URL) == 1


def test_serves_last_good_copy_and_flags_it_stale(monkeypatch):
    monkeypatch.setattr(aurora.requests, "get", fake_get(ovation({(3, 5): 50}, forecast=aurora.iso_from_ms(time.time() * 1000))))
    assert client.get("/api/aurora").json()["stale"] is False
    (key,) = [k for k in cache_module._store if k[0] == "fetch_aurora_grid"]
    stamp, value = cache_module._store[key]
    old = time.time() - (aurora.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old, value)
    monkeypatch.setattr(aurora.requests, "get", fake_get(aurora_status=503))
    body = client.get("/api/aurora").json()
    assert body["stale"] is True and body["counts"]["max_pct"] == 50


def test_noaa_that_stopped_publishing_is_flagged_stale(monkeypatch):
    old_forecast = aurora.iso_from_ms((time.time() - 5 * 3600) * 1000)
    monkeypatch.setattr(aurora.requests, "get", fake_get(ovation(forecast=old_forecast)))
    assert client.get("/api/aurora").json()["stale"] is True


def test_one_fetch_per_ttl(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(aurora.requests, "get", getter)
    for _ in range(3):
        assert client.get("/api/aurora").status_code == 200
    assert getter.calls.count(aurora.OVATION_URL) == 1 and getter.calls.count(aurora.KP_URL) == 1
