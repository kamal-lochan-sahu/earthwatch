import pytest

import data.cache as cache_module


@pytest.fixture(autouse=True)
def _clear_ttl_cache():
    """
    The TTL cache is a module-level global store keyed by function name.
    Different tests define same-named local functions (e.g. `add`), so
    without this the cache would leak state between tests. Clear it
    before and after every test for isolation.
    """
    cache_module._store.clear()
    yield
    cache_module._store.clear()
