from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.fetcher as fetcher
from main import app

client = TestClient(app)

OPEN_METEO = "api.open-meteo.com"
MET = "api.met.no"


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    cache_module._store.clear()
    monkeypatch.setattr(fetcher.time, "sleep", lambda s: None)
    yield
    cache_module._store.clear()


def resp(payload, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = payload
    return r


def om_entry(i, temp=20.0):
    return {"current": {"time": "2026-10-22T08:00", "temperature_2m": temp + i,
                        "relative_humidity_2m": 50, "wind_speed_10m": 9.5}}


def om_ok():
    return [om_entry(i) for i in range(len(fetcher.MAJOR_CITIES))]


def met_ok(temp=10.0, wind=3.0):
    return {"properties": {"timeseries": [{"time": "2026-10-22T09:00:00Z", "data": {"instant": {"details": {
        "air_temperature": temp, "relative_humidity": 70.0, "wind_speed": wind}}}}]}}


def router(open_meteo, met):
    """requests.get stand-in: `open_meteo` / `met` are a response, a list of responses, or an exception."""
    calls = {OPEN_METEO: [], MET: []}
    queues = {OPEN_METEO: open_meteo, MET: met}

    def fake_get(url, **kwargs):
        host = OPEN_METEO if OPEN_METEO in url else MET
        calls[host].append(kwargs)
        item = queues[host]
        if isinstance(item, list):
            item = item.pop(0) if len(item) > 1 else item[0]
        if isinstance(item, Exception):
            raise item
        return item

    fake_get.calls = calls
    return fake_get


def run(open_meteo, met):
    fake = router(open_meteo, met)
    with patch.object(fetcher.requests, "get", fake):
        return fetcher.fetch_global_temperature(), fake


# ---------- Open-Meteo (primary) ----------

def test_one_light_request_for_all_cities():
    result, fake = run(resp(om_ok()), resp({}, 500))
    assert len(fake.calls[OPEN_METEO]) == 1 and fake.calls[MET] == []
    params = fake.calls[OPEN_METEO][0]["params"]
    assert len(params["latitude"].split(",")) == len(fetcher.MAJOR_CITIES)
    assert params["current"] == "temperature_2m,relative_humidity_2m,wind_speed_10m"
    assert "hourly" not in params and "daily" not in params and "timezone" not in params
    assert len(result) == len(fetcher.MAJOR_CITIES)


def test_result_shape_and_order_match_the_city_list():
    result, _ = run(resp(om_ok()), resp({}, 500))
    city = fetcher.MAJOR_CITIES[0]
    assert result[0] == {"city": city["name"], "latitude": city["lat"], "longitude": city["lon"],
                         "temperature": 20.0, "humidity": 50.0, "wind_speed": 9.5,
                         "timestamp": "2026-10-22T08:00", "source": "open-meteo", "major": True}
    assert result[3]["city"] == fetcher.MAJOR_CITIES[3]["name"] and result[3]["temperature"] == 23.0


def test_a_city_with_missing_data_is_skipped_not_fatal():
    payload = om_ok()
    payload[1] = {"current": {"time": "x", "temperature_2m": None, "relative_humidity_2m": 1, "wind_speed_10m": 1}}
    payload[2] = {}
    result, _ = run(resp(payload), resp({}, 500))
    assert len(result) == len(fetcher.MAJOR_CITIES) - 2
    assert fetcher.MAJOR_CITIES[1]["name"] not in [c["city"] for c in result]


def test_single_object_payload_is_accepted(monkeypatch):
    monkeypatch.setattr(fetcher, "MAJOR_CITIES", fetcher.MAJOR_CITIES[:1])
    result, _ = run(resp(om_entry(0)), resp({}, 500))
    assert len(result) == 1


def test_second_call_within_ttl_makes_no_request():
    fake = router(resp(om_ok()), resp({}, 500))
    with patch.object(fetcher.requests, "get", fake):
        fetcher.fetch_global_temperature()
        fetcher.fetch_global_temperature()
    assert len(fake.calls[OPEN_METEO]) == 1


def test_retries_once_on_5xx():
    result, fake = run([resp({}, 503), resp(om_ok())], resp({}, 500))
    assert len(fake.calls[OPEN_METEO]) == 2 and result[0]["source"] == "open-meteo"
    assert fake.calls[MET] == []


# ---------- MET Norway (fallback) ----------

def test_falls_back_to_met_norway_when_open_meteo_is_rate_limited():
    result, fake = run(resp({"reason": "Daily API request limit exceeded"}, 429), resp(met_ok(temp=11.5, wind=3.0)))
    assert len(fake.calls[OPEN_METEO]) == 1          # a 429 is not retried
    assert len(fake.calls[MET]) == len(fetcher.MAJOR_CITIES)
    assert len(result) == len(fetcher.MAJOR_CITIES)
    first = result[0]
    assert first["source"] == "met.no" and first["temperature"] == 11.5
    assert first["wind_speed"] == 10.8                # 3.0 m/s -> km/h
    assert first["timestamp"] == "2026-10-22T09:00" and first["humidity"] == 70.0


def test_met_norway_requests_identify_the_app_and_round_coordinates():
    _, fake = run(resp({}, 429), resp(met_ok()))
    kwargs = fake.calls[MET][0]
    ua = kwargs["headers"]["User-Agent"]
    assert "EarthWatch" in ua and "github.com" in ua and "python-requests" not in ua
    assert all(len(str(v).split(".")[-1]) <= 4 for v in kwargs["params"].values())


def test_met_norway_failures_skip_only_those_cities():
    def flaky(url, **kwargs):
        if OPEN_METEO in url:
            return resp({}, 429)
        return resp(met_ok()) if kwargs["params"]["lat"] > 0 else resp({}, 500)
    with patch.object(fetcher.requests, "get", flaky):
        result = fetcher.fetch_global_temperature()
    northern = [c for c in fetcher.MAJOR_CITIES if round(c["lat"], 4) > 0]
    assert 0 < len(result) == len(northern) < len(fetcher.MAJOR_CITIES)


# ---------- both sources failing ----------

def test_both_failing_is_an_error_that_names_the_reason_and_is_not_cached():
    limit = resp({"reason": "Daily API request limit exceeded"}, 429)
    result, _ = run(limit, resp({}, 500))
    assert "error" in result
    assert "Daily API request limit exceeded" in result["error"] and "MET Norway" in result["error"]
    # not cached: a later healthy run recovers immediately
    result, _ = run(resp(om_ok()), resp({}, 500))
    assert len(result) == len(fetcher.MAJOR_CITIES)


def test_network_errors_on_both_are_an_error():
    result, _ = run(requests.ConnectionError("down"), requests.ConnectionError("down"))
    assert "error" in result


def test_empty_upstream_response_is_an_error_not_a_cached_empty_list():
    result, _ = run(resp([{}, {}]), resp({}, 500))
    assert "error" in result


def test_serves_last_good_list_when_both_fail_after_ttl():
    good, _ = run(resp(om_ok()), resp({}, 500))
    for key, (stored_at, value) in list(cache_module._store.items()):
        cache_module._store[key] = (stored_at - 10_000, value)  # expire it
    again, _ = run(resp({}, 429), resp({}, 500))
    assert again == good


# ---------- endpoint ----------

def test_endpoint_502_when_no_city_data():
    with patch("main.fetch_global_temperature", return_value={"error": "down"}):
        assert client.get("/api/temperature/global").status_code == 502


def test_endpoint_shape_when_cities_available():
    with patch("main.fetch_global_temperature", return_value=[{"city": "Delhi"}]):
        r = client.get("/api/temperature/global")
    assert r.status_code == 200 and r.json() == {"cities": [{"city": "Delhi"}], "total": 1}


# ---------- live temperature chip (single city) ----------

def test_live_temperature_falls_back_to_met_norway():
    fake = router(resp({}, 429), resp(met_ok(temp=18.2, wind=2.0)))
    with patch.object(fetcher.requests, "get", fake), patch.object(fetcher, "fetch_open_meteo_current", return_value={"error": "429"}):
        data = fetcher.fetch_live_temperature(28.6, 77.2)
    assert data["current_temperature"] == 18.2 and data["current_wind_speed"] == 7.2
    assert data["latitude"] == 28.6 and data["longitude"] == 77.2


def test_live_temperature_keeps_the_original_error_when_fallback_also_fails():
    fake = router(resp({}, 429), resp({}, 500))
    with patch.object(fetcher.requests, "get", fake), patch.object(fetcher, "fetch_open_meteo_current", return_value={"error": "429"}):
        assert fetcher.fetch_live_temperature(28.6, 77.2) == {"error": "429"}


# ---------- the city list itself ----------

def test_city_list_is_a_sane_global_spread():
    cities = fetcher.MAJOR_CITIES
    names = [c["name"] for c in cities]
    assert len(cities) >= 50 and len(names) == len(set(names))
    assert all(-90 <= c["lat"] <= 90 and -180 <= c["lon"] <= 180 for c in cities)
    assert 10 <= sum(1 for c in cities if c.get("major")) <= 20  # labels stay readable
    assert any(c["lat"] < -60 for c in cities) and any(c["lat"] > 60 for c in cities)  # both extremes
    assert len({round(c["lon"] / 60) for c in cities}) >= 6  # spread across longitudes


def test_only_major_cities_are_flagged_for_labels():
    result, _ = run(resp(om_ok()), resp({}, 500))
    flagged = {c["city"] for c in result if c["major"]}
    assert flagged == {c["name"] for c in fetcher.MAJOR_CITIES if c.get("major")}
    assert len(result) > len(flagged)
