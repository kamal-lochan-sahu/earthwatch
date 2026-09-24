import data.cache as cache_module
from data.cache import ttl_cache


def test_second_call_within_ttl_is_served_from_cache():
    calls = {"n": 0}

    @ttl_cache(ttl_seconds=60)
    def add(a, b):
        calls["n"] += 1
        return a + b

    assert add(1, 2) == 3
    assert add(1, 2) == 3
    assert calls["n"] == 1


def test_custom_key_fn_groups_nearby_args():
    calls = {"n": 0}

    @ttl_cache(ttl_seconds=60, key_fn=lambda lat, lon: (round(lat, 1), round(lon, 1)))
    def lookup(lat, lon):
        calls["n"] += 1
        return (lat, lon)

    lookup(10.001, 20.001)
    lookup(10.002, 20.002)  # rounds to the same cache key
    assert calls["n"] == 1


def test_error_results_are_never_cached():
    calls = {"n": 0}

    @ttl_cache(ttl_seconds=60)
    def flaky():
        calls["n"] += 1
        return {"error": "upstream boom"}

    flaky()
    flaky()
    assert calls["n"] == 2


def test_cache_expires_after_ttl(monkeypatch):
    calls = {"n": 0}
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(cache_module.time, "time", lambda: fake_time["t"])

    @ttl_cache(ttl_seconds=5)
    def add(a, b):
        calls["n"] += 1
        return a + b

    add(1, 2)
    fake_time["t"] += 10  # advance past the TTL
    add(1, 2)
    assert calls["n"] == 2


def test_stale_value_served_when_fresh_call_errors(monkeypatch):
    """
    A prior successful value should be served instead of a fresh error,
    even past its TTL — this is what keeps widgets populated when an
    upstream API (like a rate-limited Open-Meteo) temporarily 429s.
    """
    calls = {"n": 0}
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(cache_module.time, "time", lambda: fake_time["t"])

    responses = iter([42, {"error": "rate limited"}])

    @ttl_cache(ttl_seconds=5)
    def flaky():
        calls["n"] += 1
        return next(responses)

    assert flaky() == 42  # first call succeeds, gets cached
    fake_time["t"] += 10  # advance past the TTL
    assert flaky() == 42  # second call errors, but stale value is served
    assert calls["n"] == 2  # the function WAS called again (not just cache hit)


def test_stale_ok_false_returns_the_error_instead():
    calls = {"n": 0}
    responses = iter([42, {"error": "rate limited"}])

    @ttl_cache(ttl_seconds=0, stale_ok=False)
    def flaky():
        calls["n"] += 1
        return next(responses)

    assert flaky() == 42
    assert flaky() == {"error": "rate limited"}
