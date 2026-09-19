from unittest.mock import patch, MagicMock

import data.fetcher as fetcher_module


def _make_hourly(n=72):
    times = [f"2026-09-19T{h % 24:02d}:00" for h in range(n)]
    return {
        "time": times,
        "temperature_2m": [30.0 + (i % 5) for i in range(n)],
        "relative_humidity_2m": [55.0 + (i % 10) for i in range(n)],
        "wind_speed_10m": [10.0 + (i % 3) for i in range(n)],
        "apparent_temperature": [32.0 + (i % 5) for i in range(n)],
        "uv_index": [6.5 for _ in range(n)],
        "uv_index_clear_sky": [7.0 for _ in range(n)],
        "shortwave_radiation": [400.0 for _ in range(n)],
        "direct_radiation": [300.0 for _ in range(n)],
        "precipitation_probability": [10 for _ in range(n)],
        "weather_code": [1 for _ in range(n)],
    }


MOCK_RESPONSE = {
    "latitude": 28.61,
    "longitude": 77.21,
    "timezone": "Asia/Kolkata",
    "current": {
        "time": "2026-09-19T14:00",
        "temperature_2m": 33.2,
        "relative_humidity_2m": 48.0,
        "apparent_temperature": 36.1,
        "wind_speed_10m": 12.4,
        "precipitation": 0.0,
        "weather_code": 1,
    },
    "hourly": _make_hourly(),
    "daily": {
        "uv_index_max": [7.2, 7.5, 6.9],
        "sunrise": ["2026-09-19T06:05", "2026-09-20T06:06", "2026-09-21T06:07"],
        "sunset": ["2026-09-19T18:10", "2026-09-20T18:09", "2026-09-21T18:08"],
    },
}


def _fake_get(url, params=None, timeout=None):
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: MOCK_RESPONSE
    return resp


def test_live_temperature_heat_index_and_uv_solar_share_one_upstream_call():
    """
    fetch_live_temperature, fetch_heat_index, and fetch_uv_solar all read
    from the same cached fetch_open_meteo_current() call for the same
    location. Only one real HTTP request should happen across all three.
    """
    with patch.object(fetcher_module.requests, "get", side_effect=_fake_get) as mock_get:
        temp = fetcher_module.fetch_live_temperature(28.61, 77.21)
        heat = fetcher_module.fetch_heat_index(28.61, 77.21)
        uv = fetcher_module.fetch_uv_solar(28.61, 77.21)

        assert "error" not in temp
        assert temp["current_temperature"] == 33.2
        assert temp["current_humidity"] == 48.0
        assert temp["current_wind_speed"] == 12.4

        assert "error" not in heat
        assert "heat_index" in heat
        assert len(heat["hourly_forecast"]) == 24

        assert "error" not in uv
        assert uv["current_uv"] == 6.5
        assert uv["today_max_uv"] == 7.2

        assert mock_get.call_count == 1
