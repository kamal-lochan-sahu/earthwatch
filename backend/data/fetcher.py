import requests
import pandas as pd
import time
from datetime import datetime, timedelta

# ============================================
# OPEN-METEO API — Live Weather Data Fetcher
# ============================================

def fetch_live_temperature(latitude: float, longitude: float):
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
        df = pd.DataFrame({
            "time": data["hourly"]["time"],
            "temperature": data["hourly"]["temperature_2m"],
            "humidity": data["hourly"]["relative_humidity_2m"],
            "wind_speed": data["hourly"]["wind_speed_10m"]
        })
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
    url = "https://power.larc.nasa.gov/api/temporal/daily/point"
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
        t2m_data = data["properties"]["parameter"]["T2M"]
        t2m_max = data["properties"]["parameter"]["T2M_MAX"]
        t2m_min = data["properties"]["parameter"]["T2M_MIN"]
        df = pd.DataFrame({
            "date": list(t2m_data.keys()),
            "avg_temp": list(t2m_data.values()),
            "max_temp": list(t2m_max.values()),
            "min_temp": list(t2m_min.values())
        })
        df = df[df["avg_temp"] != -999.0]
        df = df[df["max_temp"] != -999.0]
        df = df[df["min_temp"] != -999.0]
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

MAJOR_CITIES = [
    {"name": "Delhi", "lat": 28.61, "lon": 77.21},
    {"name": "Berlin", "lat": 52.52, "lon": 13.41},
    {"name": "New York", "lat": 40.71, "lon": -74.01},
    {"name": "Tokyo", "lat": 35.68, "lon": 139.69},
    {"name": "Sydney", "lat": -33.87, "lon": 151.21},
    {"name": "Cairo", "lat": 30.06, "lon": 31.24},
    {"name": "São Paulo", "lat": -23.55, "lon": -46.63},
    {"name": "London", "lat": 51.51, "lon": -0.13},
    {"name": "Bhubaneswar", "lat": 20.30, "lon": 85.82},
]

def fetch_global_temperature():
    results = []
    for city in MAJOR_CITIES:
        data = fetch_live_temperature(city["lat"], city["lon"])
        time.sleep(0.5)
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


# ============================================
# NOAA — CO2 Data Fetcher
# ============================================

def fetch_co2_data():
    url = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        lines = response.text.strip().split("\n")
        data_lines = [l for l in lines if not l.startswith("#") and l.strip()]
        recent = data_lines[-12:]
        monthly = []
        for line in recent:
            parts = line.split(",")
            if len(parts) >= 4:
                try:
                    year = int(parts[0].strip())
                    month = int(parts[1].strip())
                    co2 = float(parts[3].strip())
                    if co2 > 0:
                        monthly.append({
                            "year": year,
                            "month": month,
                            "co2_ppm": round(co2, 2)
                        })
                except:
                    continue
        if not monthly:
            return {"error": "No CO2 data parsed"}
        latest = monthly[-1]
        first = monthly[0]
        return {
            "latest_co2_ppm": latest["co2_ppm"],
            "year": latest["year"],
            "month": latest["month"],
            "annual_increase": round(latest["co2_ppm"] - first["co2_ppm"], 2),
            "monthly_data": monthly,
            "safe_level_ppm": 350,
            "pre_industrial_ppm": 280,
            "current_status": "critical" if latest["co2_ppm"] > 420 else "warning"
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}


# ============================================
# GDACS — Extreme Weather Events
# ============================================

def fetch_weather_events():
    url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    params = {
        "eventtypes": "EQ,TC,FL,VO,DR,WF",
        "alertlevel": "Orange,Red",
        "limit": 10
    }
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        all_items = data.get("features", [])
        cutoff = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        all_items = [i for i in all_items if i.get("properties", {}).get("fromdate", "")[:10] >= cutoff]
        all_items = sorted(all_items, key=lambda x: x.get("properties", {}).get("fromdate", ""), reverse=True)[:10]
        events = []
        for item in all_items:
            props = item.get("properties", {})
            events.append({
                "id": props.get("eventid"),
                "title": props.get("htmldescription", "").replace("<b>", "").replace("</b>", ""),
                "type": props.get("eventtype", "Unknown"),
                "country": props.get("country", "Unknown"),
                "date": props.get("fromdate", "")[:10],
                "alert_level": props.get("alertlevel", ""),
                "severity": props.get("alertlevel", "Orange"),
                "url": props.get("url", {}).get("report", "")
            })
        return {
            "total": len(events),
            "events": events
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}