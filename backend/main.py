from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from data.fetcher import fetch_live_temperature, fetch_historical_temperature, fetch_global_temperature, fetch_co2_data, fetch_weather_events
from data.hazards.earthquakes import build_earthquake_response, WINDOWS as EARTHQUAKE_WINDOWS
from data.hazards.feeds import build_layer_response, build_hazards_response, CATEGORY_TO_LAYER
from ml.anomaly_detector import AnomalyDetector
from ml.trend_analyzer import TrendAnalyzer

app = FastAPI(
    title="EarthWatch API",
    description="Real-Time Climate Anomaly Detection & Environmental Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://earthwatch.vercel.app",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://earthwatch.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


def validate_coords(lat: float, lon: float, years: int = None):
    if not (-90 <= lat <= 90):
        raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
    if not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
    if years is not None and not (1 <= years <= 10):
        raise HTTPException(status_code=400, detail="Years must be between 1 and 10")

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
    validate_coords(lat, lon)
    data = fetch_live_temperature(lat, lon)
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return data

@app.get("/api/temperature/global")
def get_global_temperature():
    data = fetch_global_temperature()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return {"cities": data, "total": len(data)}

@app.get("/api/historical")
def get_historical(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude"),
    years: int = Query(default=2, description="Number of years")
):
    validate_coords(lat, lon, years)
    data = fetch_historical_temperature(lat, lon, years)
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return data

@app.get("/api/anomalies")
def get_anomalies(
    lat: float = Query(default=28.61, description="Latitude"),
    lon: float = Query(default=77.21, description="Longitude")
):
    validate_coords(lat, lon)
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
    validate_coords(lat, lon, years)
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

@app.get("/api/earthquakes")
def get_earthquakes(
    window: str = Query("24h", description="Time window: 1h, 24h or 7d"),
    min_mag: float = Query(2.5, description="Minimum magnitude (the USGS feed starts at 2.5)"),
    region: str = Query(None, description="Only this region, e.g. Japan or California (see `regions` in the response)"),
):
    """Recent earthquakes from USGS (M2.5+, up to 7 days) plus 24h counters"""
    if window not in EARTHQUAKE_WINDOWS:
        raise HTTPException(status_code=400, detail="Window must be one of: 1h, 24h, 7d")
    if not (0 <= min_mag <= 10):
        raise HTTPException(status_code=400, detail="min_mag must be between 0 and 10")
    if region is not None and len(region) > 80:
        raise HTTPException(status_code=400, detail="Region must be at most 80 characters")
    data = build_earthquake_response(window=window, min_mag=min_mag, region=region)
    if "error" in data:
        raise HTTPException(status_code=502, detail="Earthquake data source (USGS) is temporarily unavailable")
    return data

def _hazard_layer(layer: str, label: str):
    data = build_layer_response(layer)
    if "error" in data:
        raise HTTPException(status_code=502, detail=f"{label} data source is temporarily unavailable")
    return data

@app.get("/api/wildfires")
def get_wildfires():
    """Active wildfires (NASA EONET) with severity by burned area"""
    return _hazard_layer("wildfires", "Wildfire")

@app.get("/api/volcanoes")
def get_volcanoes():
    """Volcanoes currently erupting or in notable unrest (NASA EONET)"""
    return _hazard_layer("volcanoes", "Volcano")

@app.get("/api/icebergs")
def get_icebergs():
    """Tracked icebergs (NASA EONET / U.S. National Ice Center)"""
    return _hazard_layer("icebergs", "Iceberg")

@app.get("/api/storms")
def get_storms():
    """Active tropical cyclones and severe storms (GDACS alert levels + NASA EONET)"""
    return _hazard_layer("storms", "Storm")

@app.get("/api/hazards")
def get_hazards(
    category: str = Query(None, description="Comma list of: wildfire, volcano, storm, iceberg (default: all)"),
    min_severity: str = Query("info", description="info, mild, moderate or extreme"),
    limit: int = Query(200, description="Max items returned (1-1000)"),
):
    """All active non-earthquake hazards in one list, most severe first"""
    if min_severity not in ("info", "mild", "moderate", "extreme"):
        raise HTTPException(status_code=400, detail="min_severity must be one of: info, mild, moderate, extreme")
    if not (1 <= limit <= 1000):
        raise HTTPException(status_code=400, detail="limit must be between 1 and 1000")
    cats = None
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if not cats or any(c not in CATEGORY_TO_LAYER for c in cats):
            raise HTTPException(status_code=400, detail="category must be a comma list of: wildfire, volcano, storm, iceberg")
    data = build_hazards_response(categories=cats, min_severity=min_severity, limit=limit)
    if "error" in data:
        raise HTTPException(status_code=502, detail="Hazard data sources are temporarily unavailable")
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
    validate_coords(lat, lon, years)
    from data.fetcher import fetch_csv_export
    data = fetch_csv_export(lat, lon, years)
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return data


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
    validate_coords(lat, lon)
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
    validate_coords(lat, lon)
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
    validate_coords(lat, lon)
    from data.fetcher import fetch_heat_index
    data = fetch_heat_index(lat, lon)
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return data

@app.get("/api/tipping-points")
def get_tipping_points():
    from data.fetcher import fetch_tipping_points
    return fetch_tipping_points()

@app.get("/api/uv-solar")
def get_uv_solar(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    validate_coords(lat, lon)
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
    validate_coords(lat1, lon1)
    validate_coords(lat2, lon2)
    from data.fetcher import fetch_city_comparison
    return fetch_city_comparison(lat1, lon1, lat2, lon2, city1, city2)

@app.get("/api/year-comparison")
def get_year_comparison(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    validate_coords(lat, lon)
    from data.fetcher import fetch_year_comparison
    return fetch_year_comparison(lat, lon)

@app.get("/api/anomaly-calendar")
def get_anomaly_calendar(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    validate_coords(lat, lon)
    from data.fetcher import fetch_anomaly_calendar
    return fetch_anomaly_calendar(lat, lon)

@app.get("/api/forecast")
def get_forecast(
    lat: float = Query(default=28.61),
    lon: float = Query(default=77.21)
):
    validate_coords(lat, lon)
    from data.fetcher import fetch_temperature_forecast
    return fetch_temperature_forecast(lat, lon)

@app.get("/api/health-dashboard")
def get_health_dashboard():
    from data.fetcher import fetch_api_health
    return fetch_api_health()
