from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.fetcher as fetcher
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    cache_module._store.clear()
    monkeypatch.setattr(fetcher.time, "sleep", lambda s: None)
    yield
    cache_module._store.clear()


def entry(i, temp=20.0):
    return {"current": {"time": "2026-10-22T08:00", "temperature_2m": temp + i,
                        "relative_humidity_2m": 50, "wind_speed_10m": 9.5}}


def ok(payload, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = payload
    return r


def full_payload():
    return [entry(i) for i in range(len(fetcher.MAJOR_CITIES))]


def test_one_request_for_all_cities_asking_only_for_what_the_globe_needs():
    with patch.object(fetcher.requests, "get", return_value=ok(full_payload())) as get:
        result = fetcher.fetch_global_temperature()
    assert get.call_count == 1
    params = get.call_args.kwargs["params"]
    assert len(params["latitude"].split(",")) == len(fetcher.MAJOR_CITIES)
    assert len(params["longitude"].split(",")) == len(fetcher.MAJOR_CITIES)
    assert params["current"] == "temperature_2m,relative_humidity_2m,wind_speed_10m"
    assert "hourly" not in params and "daily" not in params and "timezone" not in params
    assert len(result) == len(fetcher.MAJOR_CITIES)


def test_result_shape_and_order_match_the_city_list():
    with patch.object(fetcher.requests, "get", return_value=ok(full_payload())):
        result = fetcher.fetch_global_temperature()
    first, city = result[0], fetcher.MAJOR_CITIES[0]
    assert first == {"city": city["name"], "latitude": city["lat"], "longitude": city["lon"],
                     "temperature": 20.0, "humidity": 50.0, "wind_speed": 9.5,
                     "timestamp": "2026-10-22T08:00"}
    assert result[3]["city"] == fetcher.MAJOR_CITIES[3]["name"] and result[3]["temperature"] == 23.0


def test_a_city_with_missing_data_is_skipped_not_fatal():
    payload = full_payload()
    payload[1] = {"current": {"time": "x", "temperature_2m": None, "relative_humidity_2m": 1, "wind_speed_10m": 1}}
    payload[2] = {}
    with patch.object(fetcher.requests, "get", return_value=ok(payload)):
        result = fetcher.fetch_global_temperature()
    assert len(result) == len(fetcher.MAJOR_CITIES) - 2
    assert fetcher.MAJOR_CITIES[1]["name"] not in [c["city"] for c in result]


def test_single_object_payload_is_accepted(monkeypatch):
    monkeypatch.setattr(fetcher, "MAJOR_CITIES", fetcher.MAJOR_CITIES[:1])
    with patch.object(fetcher.requests, "get", return_value=ok(entry(0))):
        assert len(fetcher.fetch_global_temperature()) == 1


def test_second_call_within_ttl_makes_no_request():
    with patch.object(fetcher.requests, "get", return_value=ok(full_payload())) as get:
        fetcher.fetch_global_temperature()
        fetcher.fetch_global_temperature()
    assert get.call_count == 1


def test_retries_once_on_429_then_succeeds():
    with patch.object(fetcher.requests, "get", side_effect=[ok({}, 429), ok(full_payload())]) as get:
        result = fetcher.fetch_global_temperature()
    assert get.call_count == 2 and len(result) == len(fetcher.MAJOR_CITIES)


def test_failure_is_an_error_and_is_not_cached_then_recovers():
    with patch.object(fetcher.requests, "get", side_effect=requests.ConnectionError("down")) as get:
        assert "error" in fetcher.fetch_global_temperature()
        assert "error" in fetcher.fetch_global_temperature()
    assert get.call_count == 4  # 2 attempts per call: the failure was not cached
    with patch.object(fetcher.requests, "get", return_value=ok(full_payload())):
        assert len(fetcher.fetch_global_temperature()) == len(fetcher.MAJOR_CITIES)


def test_empty_upstream_response_is_an_error_not_a_cached_empty_list():
    with patch.object(fetcher.requests, "get", return_value=ok([{}, {}])):
        assert "error" in fetcher.fetch_global_temperature()


def test_serves_last_good_list_when_upstream_fails_after_ttl():
    with patch.object(fetcher.requests, "get", return_value=ok(full_payload())):
        good = fetcher.fetch_global_temperature()
    for key, (stored_at, value) in list(cache_module._store.items()):
        cache_module._store[key] = (stored_at - 10_000, value)  # expire it
    with patch.object(fetcher.requests, "get", return_value=ok({}, 429)):
        assert fetcher.fetch_global_temperature() == good


def test_endpoint_502_when_no_city_data():
    with patch("main.fetch_global_temperature", return_value={"error": "down"}):
        assert client.get("/api/temperature/global").status_code == 502


def test_endpoint_shape_when_cities_available():
    with patch("main.fetch_global_temperature", return_value=[{"city": "Delhi"}]):
        r = client.get("/api/temperature/global")
    assert r.status_code == 200 and r.json() == {"cities": [{"city": "Delhi"}], "total": 1}
