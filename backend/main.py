from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from data.fetcher import fetch_live_temperature, fetch_historical_temperature, fetch_global_temperature
from ml.anomaly_detector import AnomalyDetector

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
    """Live temperature data from Open-Meteo API"""
    data = fetch_live_temperature(lat, lon)
    return data

@app.get("/api/temperature/global")
def get_global_temperature():
    """Live temperature for major cities worldwide"""
    data = fetch_global_temperature()
    return {"cities": data, "total": len(data)}

@app.get("/api/historical")
def get_historical(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude"),
    years: int = Query(default=2, description="Number of years")
):
    """Historical climate data from NASA POWER API"""
    data = fetch_historical_temperature(lat, lon, years)
    return data

@app.get("/api/anomalies")
def get_anomalies(
    lat: float = Query(default=19.31, description="Latitude"),
    lon: float = Query(default=84.79, description="Longitude")
):
    """ML-based anomaly detection using NASA historical + live temperature"""

    # Step 1 — NASA se historical data lo
    historical_data = fetch_historical_temperature(lat, lon, years=2)
    data_records = historical_data.get("data", [])
    temperatures = [record["avg_temp"] for record in data_records]

    if len(temperatures) < 10:
        return {"error": "Not enough historical data to train model"}

    # Step 2 — Model train karo
    detector = AnomalyDetector()
    detector.train(temperatures)

    # Step 3 — Live temperature lo
    live_data = fetch_live_temperature(lat, lon)
    live_temp = live_data.get("current_temperature")

    if live_temp is None:
        return {"error": "Could not fetch live temperature"}

    # Step 4 — Anomaly check karo
    result = detector.detect(live_temp)

    return {
        "location": {"lat": lat, "lon": lon},
        "trained_on": len(temperatures),
        "live_temperature": live_temp,
        "anomaly_result": result
    }

@app.get("/api/co2")
def get_co2():
    return {"status": "coming soon", "description": "Real-time CO2 concentration data"}

@app.get("/api/events")
def get_events():
    return {"status": "coming soon", "description": "Extreme weather events feed"}

@app.get("/api/trends")
def get_trends():
    return {"status": "coming soon", "description": "Historical climate trend analysis"}