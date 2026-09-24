"""
EarthWatch — in-memory TTL cache for slow/rate-limited external API calls.
Thread-safe, process-local. Not shared across multiple worker processes —
that's a fine tradeoff for a single-instance Render deployment.
"""
import time
import threading

_lock = threading.Lock()
_store = {}


def ttl_cache(ttl_seconds=600, key_fn=None, stale_ok=True):
    """
    Decorator that caches a function's return value for ttl_seconds.
    - key_fn(*args, **kwargs) -> hashable key. Defaults to raw args/kwargs.
    - Results that look like {"error": ...} are never cached as the "good"
      value, so a transient upstream failure doesn't get stuck for the
      full TTL.
    - stale_ok (default True): if a fresh call errors but we have an
      earlier successful result for this key (even if its TTL has since
      expired), serve that stale value instead of the error. This matters
      for upstream APIs with shared/IP-based rate limits (e.g. Open-Meteo
      on a shared Render IP): a temporary 429 shouldn't blank out a widget
      that already has real data to show.
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs) if key_fn else (args, tuple(sorted(kwargs.items())))
            cache_key = (func.__name__, key)
            now = time.time()

            with _lock:
                cached = _store.get(cache_key)
                if cached and (now - cached[0] < ttl_seconds):
                    return cached[1]

            result = func(*args, **kwargs)

            if isinstance(result, dict) and "error" in result:
                if stale_ok and cached:
                    return cached[1]
                return result

            with _lock:
                _store[cache_key] = (now, result)

            return result
        wrapper.__name__ = func.__name__
        return wrapper
    return decorator
