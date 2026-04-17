import requests
import pandas as pd
from datetime import datetime, timedelta

# ============================================
# OPEN-METEO API — Live Weather Data Fetcher
# ============================================

def fetch_live_temperature(latitude: float, longitude: float):
    """
    Open-Meteo se live temperature data fetch karta hai.
    Free API hai — koi key nahi chahiye.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "auto",
        "forecast_days": 1
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Data ko clean karke DataFrame banate hain
        df = pd.DataFrame({
            "time": data["hourly"]["time"],
            "temperature": data["hourly"]["temperature_2m"],
            "humidity": data["hourly"]["relative_humidity_2m"],
            "wind_speed": data["hourly"]["wind_speed_10m"]
        })
        
        # Current hour ka data nikaalte hain
        current_hour = datetime.now().strftime("%Y-%m-%dT%H:00")
        current_data = df[df["time"] == current_hour]
        
        if current_data.empty:
            current_data = df.iloc[-1]
        else:
            current_data = current_data.iloc[0]
        
        return {
    "latitude": latitude,
    "longitude": longitude,
    "current_temperature": float(current_data["temperature"]),
    "current_humidity": float(current_data["humidity"]),
    "current_wind_speed": float(current_data["wind_speed"]),
    "timestamp": current_hour,
    "hourly_data": df.to_dict(orient="records")
}
        
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}


# ============================================
# NASA POWER API — Historical Climate Data
# ============================================

def fetch_historical_temperature(latitude: float, longitude: float, years: int = 5):
    """
    NASA POWER API se historical temperature data fetch karta hai.
    Last N years ka daily data milega.
    Free API — koi key nahi chahiye.
    """
    url = "https://power.larc.nasa.gov/api/temporal/daily/point"
    
    # Date range calculate karte hain
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365 * years)
    
    params = {
        "parameters": "T2M,T2M_MAX,T2M_MIN",
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": start_date.strftime("%Y%m%d"),
        "end": end_date.strftime("%Y%m%d"),
        "format": "JSON"
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Data extract karte hain
        t2m_data = data["properties"]["parameter"]["T2M"]
        t2m_max = data["properties"]["parameter"]["T2M_MAX"]
        t2m_min = data["properties"]["parameter"]["T2M_MIN"]
        
        # DataFrame banate hain
        df = pd.DataFrame({
            "date": list(t2m_data.keys()),
            "avg_temp": list(t2m_data.values()),
            "max_temp": list(t2m_max.values()),
            "min_temp": list(t2m_min.values())
        })
        
        # Invalid values remove karte hain (-999 NASA ka null value hai)
        df = df[df["avg_temp"] != -999.0]
        df = df[df["max_temp"] != -999.0]
        df = df[df["min_temp"] != -999.0]
        
        # Statistics calculate karte hain
        stats = {
            "mean": df["avg_temp"].mean(),
            "std": df["avg_temp"].std(),
            "max": df["avg_temp"].max(),
            "min": df["avg_temp"].min(),
            "total_days": len(df)
        }
        
        return {
            "latitude": latitude,
            "longitude": longitude,
            "years_fetched": years,
            "statistics": stats,
            "data": df.to_dict(orient="records")
        }
        
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}


# ============================================
# MULTIPLE CITIES — Global Data Fetcher
# ============================================

# Yeh cities globe pe dikhayenge
MAJOR_CITIES = [
    {"name": "Delhi", "lat": 28.61, "lon": 77.21},
    {"name": "Berlin", "lat": 52.52, "lon": 13.41},
    {"name": "New York", "lat": 40.71, "lon": -74.01},
    {"name": "Tokyo", "lat": 35.68, "lon": 139.69},
    {"name": "Sydney", "lat": -33.87, "lon": 151.21},
    {"name": "Cairo", "lat": 30.06, "lon": 31.24},
    {"name": "São Paulo", "lat": -23.55, "lon": -46.63},
    {"name": "London", "lat": 51.51, "lon": -0.13},
    {"name": "Berhampur", "lat": 19.31, "lon": 84.79},
]

def fetch_global_temperature():
    """
    Saari major cities ka live temperature fetch karta hai.
    Globe visualization ke liye use hoga.
    """
    results = []
    
    for city in MAJOR_CITIES:
        data = fetch_live_temperature(city["lat"], city["lon"])
        
        if "error" not in data:
            results.append({
                "city": city["name"],
                "latitude": city["lat"],
                "longitude": city["lon"],
                "temperature": data["current_temperature"],
                "humidity": data["current_humidity"],
                "wind_speed": data["current_wind_speed"],
                "timestamp": data["timestamp"]
            })
    
    return results