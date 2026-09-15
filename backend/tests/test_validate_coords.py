import pytest
from fastapi import HTTPException

from main import validate_coords


def test_valid_coords_do_not_raise():
    validate_coords(28.61, 77.21)
    validate_coords(-90, -180)
    validate_coords(90, 180)


def test_invalid_latitude_raises_400():
    with pytest.raises(HTTPException) as exc:
        validate_coords(200.0, 77.21)
    assert exc.value.status_code == 400


def test_invalid_longitude_raises_400():
    with pytest.raises(HTTPException) as exc:
        validate_coords(28.61, 400.0)
    assert exc.value.status_code == 400


def test_invalid_years_raises_400():
    with pytest.raises(HTTPException) as exc:
        validate_coords(28.61, 77.21, years=50)
    assert exc.value.status_code == 400


def test_years_within_range_does_not_raise():
    validate_coords(28.61, 77.21, years=1)
    validate_coords(28.61, 77.21, years=10)
