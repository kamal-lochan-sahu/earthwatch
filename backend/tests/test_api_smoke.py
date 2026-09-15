from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root_returns_running_status():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_invalid_coords_returns_400_before_any_upstream_call():
    # lat=999 fails validate_coords before fetch_live_temperature is ever called,
    # so this test needs no network access and no mocking.
    response = client.get("/api/temperature", params={"lat": 999, "lon": 77.21})
    assert response.status_code == 400
