from app.services.market_pulse import build_market_pulse


def make_signal(period, industry_code, value):
    year, quarter = map(int, period.replace("Q", " ").split())
    month = (quarter - 1) * 3 + 1
    # The tests only need dates that identify the relevant quarter.
    return {
        "source_id": "fso",
        "metric": "job_vacancies",
        "industry_code": industry_code,
        "period_start": f"{year:04d}-{month:02d}-01",
        "period_end": f"{year:04d}-{month + 2:02d}-28",
        "value": value,
    }


def test_builds_quarterly_market_pulse():
    signals = [
        make_signal("2025Q1", "5-96", 100_000),
        make_signal("2025Q1", "58-63", 4_000),
        make_signal("2025Q2", "5-96", 110_000),
        make_signal("2025Q2", "58-63", 4_400),
    ]

    result = build_market_pulse(signals)

    assert result["periods_available"] == 2
    assert result["latest"]["period"] == "2025Q2"
    assert result["latest"]["total_vacancies"] == 110_000
    assert result["latest"]["ict_vacancies"] == 4_400
    assert result["latest"]["ict_share_pct"] == 4.0
    assert result["latest"]["qoq_change_total_pct"] == 10.0
    assert result["latest"]["qoq_change_ict_pct"] == 10.0


def test_calculates_year_over_year_change():
    signals = [
        make_signal("2024Q2", "5-96", 100_000),
        make_signal("2024Q2", "58-63", 4_000),
        make_signal("2025Q2", "5-96", 120_000),
        make_signal("2025Q2", "58-63", 5_000),
    ]

    result = build_market_pulse(signals)
    latest = result["latest"]

    assert latest["yoy_change_total_pct"] == 20.0
    assert latest["yoy_change_ict_pct"] == 25.0
    assert latest["qoq_change_total_pct"] is None


def test_ignores_non_fso_and_unrelated_industry_signals():
    signals = [
        make_signal("2025Q1", "5-96", 100_000),
        make_signal("2025Q1", "58-63", 4_000),
        {
            **make_signal("2025Q1", "5-96", 999),
            "source_id": "other",
        },
        make_signal("2025Q1", "01-03", 500),
    ]

    result = build_market_pulse(signals)

    assert result["periods_available"] == 1
    assert result["latest"]["total_vacancies"] == 100_000


def test_skips_quarters_missing_one_of_the_two_series():
    signals = [
        make_signal("2025Q1", "5-96", 100_000),
        make_signal("2025Q2", "5-96", 110_000),
        make_signal("2025Q2", "58-63", 4_400),
    ]

    result = build_market_pulse(signals)

    assert result["periods_available"] == 1
    assert result["latest"]["period"] == "2025Q2"
    assert result["latest"]["qoq_change_total_pct"] is None


def test_empty_input_returns_empty_series():
    result = build_market_pulse([])

    assert result["periods_available"] == 0
    assert result["latest"] is None
    assert result["series"] == []
