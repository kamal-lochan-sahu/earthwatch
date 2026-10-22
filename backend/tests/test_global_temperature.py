from unittest.mock import patch

from fastapi.testclient import TestClient

import data.fetcher as fetcher
from main import app

client = TestClient(app)

OK = {"current_temperature": 21.0, "current_humidity": 50, "current_wind_speed": 9, "timestamp": "2026-10-22T08:00"}


@patch.object(fetcher.time, "sleep", lambda s: None)
def test_all_cities_failing_returns_error_and_is_not_cached():
    calls = []

    def failing(lat, lon):
        calls.append(1)
        return {"error": "429"}

    with patch.object(fetcher, "fetch_live_temperature", failing):
        first = fetcher.fetch_global_temperature()
        n_first = len(calls)
        fetcher.fetch_global_temperature()
    assert "error" in first
    assert len(calls) == 2 * n_first  # the failure was NOT cached: second call retried every city


@patch.object(fetcher.time, "sleep", lambda s: None)
def test_recovers_after_a_failed_run():
    with patch.object(fetcher, "fetch_live_temperature", lambda lat, lon: {"error": "429"}):
        assert "error" in fetcher.fetch_global_temperature()
    with patch.object(fetcher, "fetch_live_temperature", lambda lat, lon: dict(OK)):
        result = fetcher.fetch_global_temperature()
    assert isinstance(result, list) and len(result) == len(fetcher.MAJOR_CITIES)


@patch.object(fetcher.time, "sleep", lambda s: None)
def test_partial_failure_still_returns_the_cities_that_worked():
    seen = {"n": 0}

    def flaky(lat, lon):
        seen["n"] += 1
        return dict(OK) if seen["n"] % 2 else {"error": "429"}

    with patch.object(fetcher, "fetch_live_temperature", flaky):
        result = fetcher.fetch_global_temperature()
    assert isinstance(result, list) and 0 < len(result) < len(fetcher.MAJOR_CITIES)


def test_endpoint_502_when_no_city_data():
    with patch("main.fetch_global_temperature", return_value={"error": "down"}):
        r = client.get("/api/temperature/global")
    assert r.status_code == 502


def test_endpoint_shape_when_cities_available():
    with patch("main.fetch_global_temperature", return_value=[{"city": "Delhi"}]):
        r = client.get("/api/temperature/global")
    assert r.status_code == 200 and r.json() == {"cities": [{"city": "Delhi"}], "total": 1}
