from datetime import datetime, timedelta

from ml.trend_analyzer import TrendAnalyzer


def _make_records(n=60, start_temp=20.0, daily_change=0.05):
    start = datetime(2024, 1, 1)
    records = []
    for i in range(n):
        d = start + timedelta(days=i)
        temp = start_temp + i * daily_change
        records.append({
            "date": d.strftime("%Y%m%d"),
            "avg_temp": temp,
            "max_temp": temp + 2,
            "min_temp": temp - 2,
        })
    return records


def test_warming_trend_detected():
    analyzer = TrendAnalyzer()
    analyzer.load(_make_records(daily_change=0.05))
    trend = analyzer.linear_trend()
    assert trend["trend"] == "warming"
    assert trend["slope_per_day"] > 0
    assert trend["significant"] is True


def test_cooling_trend_detected():
    analyzer = TrendAnalyzer()
    analyzer.load(_make_records(daily_change=-0.05))
    trend = analyzer.linear_trend()
    assert trend["trend"] == "cooling"
    assert trend["slope_per_day"] < 0


def test_summary_has_expected_keys():
    analyzer = TrendAnalyzer()
    analyzer.load(_make_records())
    summary = analyzer.summary()
    assert set(["total_days", "trend", "monthly_averages", "hottest_day", "coldest_day"]) <= set(summary.keys())


def test_no_data_loaded_returns_error():
    analyzer = TrendAnalyzer()
    assert analyzer.linear_trend() == {"error": "No data loaded"}
    assert analyzer.monthly_averages() == []
    assert analyzer.summary() == {"error": "No data loaded"}
