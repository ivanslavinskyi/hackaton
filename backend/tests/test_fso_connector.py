from datetime import date

import pytest

from app.services.fso_connector import get_quarter_dates


def test_get_quarter_dates_q1():
    start, end = get_quarter_dates("2026Q1")

    assert start == date(2026, 1, 1)
    assert end == date(2026, 3, 31)


def test_get_quarter_dates_q2():
    start, end = get_quarter_dates("2026Q2")

    assert start == date(2026, 4, 1)
    assert end == date(2026, 6, 30)


def test_get_quarter_dates_q3():
    start, end = get_quarter_dates("2026Q3")

    assert start == date(2026, 7, 1)
    assert end == date(2026, 9, 30)


def test_get_quarter_dates_q4():
    start, end = get_quarter_dates("2026Q4")

    assert start == date(2026, 10, 1)
    assert end == date(2026, 12, 31)


def test_invalid_quarter():
    with pytest.raises(ValueError):
        get_quarter_dates("2026Q5")