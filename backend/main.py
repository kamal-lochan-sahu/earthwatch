from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from data.fetcher import fetch_live_temperature, fetch_historical_temperature, fetch_global_temperature, fetch_co2_data, fetch_weather_events
from ml.anomaly_detector import AnomalyDetector
from ml.trend_analyzer import TrendAnalyzer

app = FastAPI(
    title="EarthWatch API",
    description="Real-Time Climate Anomaly Detection & Environmental Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "name": "EarthWatch API",
        "version": "1.0.0",
        "status": "running",
        "message": "Real-Time Climate Anomaly Detection Platform"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/temperature")
def get_temperature(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude")
):
    data = fetch_live_temperature(lat, lon)
    return data

@app.get("/api/temperature/global")
def get_global_temperature():
    data = fetch_global_temperature()
    return {"cities": data, "total": len(data)}

@app.get("/api/historical")
def get_historical(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude"),
    years: int = Query(default=2, description="Number of years")
):
    data = fetch_historical_temperature(lat, lon, years)
    return data

@app.get("/api/anomalies")
def get_anomalies(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude")
):
    historical_data = fetch_historical_temperature(lat, lon, years=2)
    data_records = historical_data.get("data", [])
    temperatures = [record["avg_temp"] for record in data_records]

    if len(temperatures) < 10:
        return {"error": "Not enough historical data to train model"}

    detector = AnomalyDetector()
    detector.train(temperatures)

    live_data = fetch_live_temperature(lat, lon)
    live_temp = live_data.get("current_temperature")

    if live_temp is None:
        return {"error": "Could not fetch live temperature"}

    result = detector.detect(live_temp)

    return {
        "location": {"lat": lat, "lon": lon},
        "trained_on": len(temperatures),
        "live_temperature": live_temp,
        "anomaly_result": result
    }

@app.get("/api/trends")
def get_trends(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude"),
    years: int = Query(default=2, description="Number of years")
):
    historical_data = fetch_historical_temperature(lat, lon, years)
    data_records = historical_data.get("data", [])

    if len(data_records) < 10:
        return {"error": "Not enough data for trend analysis"}

    analyzer = TrendAnalyzer()
    analyzer.load(data_records)
    return analyzer.summary()

@app.get("/api/co2")
def get_co2():
    """Real CO2 concentration data from NOAA"""
    data = fetch_co2_data()
    return data

@app.get("/api/events")
def get_events():
    """Extreme weather events from ReliefWeb"""
    data = fetch_weather_events()
    return data