from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from data.fetcher import fetch_live_temperature, fetch_historical_temperature, fetch_global_temperature

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
def get_anomalies():
    return {"status": "coming soon", "description": "ML-detected climate anomalies"}

@app.get("/api/co2")
def get_co2():
    return {"status": "coming soon", "description": "Real-time CO2 concentration data"}

@app.get("/api/events")
def get_events():
    return {"status": "coming soon", "description": "Extreme weather events feed"}

@app.get("/api/trends")
def get_trends():
    return {"status": "coming soon", "description": "Historical climate trend analysis"}