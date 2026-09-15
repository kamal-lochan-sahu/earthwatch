from ml.anomaly_detector import AnomalyDetector


def _tight_cluster(n=100, center=20.0, spread=0.5):
    return [center + spread * ((i % 7) - 3) / 3 for i in range(n)]


def test_train_and_detect_normal_temperature():
    detector = AnomalyDetector()
    detector.train(_tight_cluster())
    result = detector.detect(20.1)
    assert result["is_anomaly"] is False
    assert result["severity"] == "normal"


def test_detect_extreme_anomaly():
    detector = AnomalyDetector()
    detector.train(_tight_cluster())
    result = detector.detect(60.0)  # far outside the training cluster
    assert result["is_anomaly"] is True
    assert result["severity"] in ("moderate", "extreme")


def test_detect_before_train_returns_error():
    detector = AnomalyDetector()
    result = detector.detect(25.0)
    assert result == {"error": "Model not trained yet"}


def test_detect_batch_returns_one_result_per_input():
    detector = AnomalyDetector()
    detector.train(_tight_cluster())
    results = detector.detect_batch([20.0, 20.2, 19.8])
    assert len(results) == 3
    assert all("is_anomaly" in r for r in results)
