"""
EarthWatch — in-memory TTL cache for slow external API calls (NASA POWER etc.)
Thread-safe, process-local. Not shared across multiple worker processes —
that's a fine tradeoff for a single-instance Render deployment.
"""
import time
import threading

_lock = threading.Lock()
_store = {}


def ttl_cache(ttl_seconds=600, key_fn=None):
    """
    Decorator that caches a function's return value for ttl_seconds.
    - key_fn(*args, **kwargs) -> hashable key. Defaults to raw args/kwargs.
    - Results that look like {"error": ...} are never cached, so a transient
      upstream failure doesn't get stuck for the full TTL.
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

            if not (isinstance(result, dict) and "error" in result):
                with _lock:
                    _store[cache_key] = (now, result)

            return result
        wrapper.__name__ = func.__name__
        return wrapper
    return decorator
