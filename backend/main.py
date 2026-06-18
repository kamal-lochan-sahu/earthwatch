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

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "healthy"}

@app.get("/api/temperature")
def get_temperature(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude")
):
    data = fetch_live_temperature(lat, lon)
    return data

@app.get("/api/temperature/global")
def get_global_temperature():
    data = fetch_global_temperature()
    return {"cities": data, "total": len(data)}

@app.get("/api/historical")
def get_historical(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude"),
    years: int = Query(default=2, description="Number of years")
):
    data = fetch_historical_temperature(lat, lon, years)
    return data

@app.get("/api/anomalies")
def get_anomalies(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude")
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
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude"),
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

# ============================================
# NEW RESEARCH ENDPOINTS
# ============================================

@app.get("/api/export/csv")
def export_csv(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude"),
    years: int = Query(default=2, description="Years of data")
):
    """Download historical temperature data as JSON (frontend converts to CSV)"""
    from data.fetcher import fetch_csv_export
    return fetch_csv_export(lat, lon, years)


@app.get("/api/climate-index")
def get_climate_index():
    """El Nino / La Nina detection via NOAA ONI Index"""
    from data.fetcher import fetch_climate_index
    return fetch_climate_index()


@app.get("/api/arctic-ice")
def get_arctic_ice():
    """Arctic Sea Ice Extent from NSIDC"""
    from data.fetcher import fetch_arctic_ice
    return fetch_arctic_ice()


@app.get("/api/seasonal")
def get_seasonal(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude")
):
    """Seasonal decomposition: trend + seasonality + residual"""
    from data.fetcher import fetch_seasonal_decomposition
    return fetch_seasonal_decomposition(lat, lon)


@app.get("/api/correlation")
def get_correlation():
    """Correlation matrix: CO2 vs Temperature vs Sea Level"""
    from data.fetcher import fetch_correlation_data
    return fetch_correlation_data()


@app.get("/api/air-quality")
def get_air_quality(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude")
):
    """Real-time Air Quality Index from Open-Meteo"""
    from data.fetcher import fetch_air_quality
    return fetch_air_quality(lat, lon)


# ============================================
# V2 RESEARCH ENDPOINTS
# ============================================

@app.get("/api/heat-index")
def get_heat_index(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    from data.fetcher import fetch_heat_index
    return fetch_heat_index(lat, lon)

@app.get("/api/tipping-points")
def get_tipping_points():
    from data.fetcher import fetch_tipping_points
    return fetch_tipping_points()

@app.get("/api/uv-solar")
def get_uv_solar(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    from data.fetcher import fetch_uv_solar
    return fetch_uv_solar(lat, lon)

@app.get("/api/compare-cities")
def get_city_comparison(
    lat1: float = Query(default=28.61),
    lon1: float = Query(default=77.21),
    lat2: float = Query(default=19.08),
    lon2: float = Query(default=72.88),
    city1: str = Query(default="Delhi"),
    city2: str = Query(default="Mumbai")
):
    from data.fetcher import fetch_city_comparison
    return fetch_city_comparison(lat1, lon1, lat2, lon2, city1, city2)

@app.get("/api/year-comparison")
def get_year_comparison(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    from data.fetcher import fetch_year_comparison
    return fetch_year_comparison(lat, lon)

@app.get("/api/anomaly-calendar")
def get_anomaly_calendar(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    from data.fetcher import fetch_anomaly_calendar
    return fetch_anomaly_calendar(lat, lon)

@app.get("/api/forecast")
def get_forecast(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    from data.fetcher import fetch_temperature_forecast
    return fetch_temperature_forecast(lat, lon)

@app.get("/api/health-dashboard")
def get_health_dashboard():
    from data.fetcher import fetch_api_health
    return fetch_api_health()
