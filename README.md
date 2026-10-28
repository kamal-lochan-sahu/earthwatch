# 🌍 EarthWatch
### Real-Time Climate Anomaly Detection & Environmental Intelligence Platform

![Status](https://img.shields.io/badge/Status-Live-green)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![ML](https://img.shields.io/badge/ML-Isolation%20Forest-purple)
![PWA](https://img.shields.io/badge/PWA-Enabled-orange)
![Languages](https://img.shields.io/badge/Languages-21-brightgreen)

## 🚀 Live Demo
- **Frontend:** https://earthwatch.vercel.app
- **Backend API:** https://earthwatch.onrender.com
- **API Docs:** https://earthwatch.onrender.com/docs

---

## 📌 What is EarthWatch?
EarthWatch is a full-stack climate intelligence platform that:
- Fetches **real-time temperature data** from Open-Meteo API
- Uses **NASA POWER API** for 2+ years of historical climate data
- Detects **climate anomalies** using Isolation Forest + Z-Score ML model
- Analyzes **warming/cooling trends** using linear regression
- Displays a **3D interactive globe** with live global city temperatures
- Shows **live CO2 levels** from NOAA Mauna Loa Observatory
- Tracks **real-time disaster events** from GDACS (UN System)
- Shows **live earthquakes** (USGS, M2.5+) on the globe with pulse rings, a live ticker and a filterable Hazards list
- Shows **wildfires, cyclones & storms, volcanoes and icebergs** (NASA EONET + GDACS) as toggleable globe layers with one shared severity scale, merged into the live ticker
- Shows a **global wind field** (Open-Meteo) as direction arrows on the globe and the 2D map, coloured by speed
- Shows **open-ocean wave height** (Open-Meteo Marine) as dots sized and coloured by height
- **Search any city** in the world for live temperature + anomaly
- **PWA enabled** — installable on mobile as an app
- **21 languages** — auto-detects user region and shows regional language
- **°C/°F toggle** — switch between Celsius and Fahrenheit
- **Entry animation** — smooth loading screen on startup

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Globe.gl |
| Backend | FastAPI, Python 3.11, Uvicorn |
| ML | Scikit-learn (Isolation Forest), SciPy (Linear Regression) |
| Data Sources | NASA POWER, Open-Meteo (city temperatures fall back to MET Norway when rate-limited; also the global wind grid; Open-Meteo Marine for ocean waves), NOAA CO2, GDACS Events & Cyclones, USGS Earthquakes, NASA EONET (wildfires, volcanoes, icebergs, storms) |
| Deploy | Vercel (Frontend), Render (Backend) |
| PWA | Web App Manifest, Custom Icons |
| i18n | 21 Languages — Auto region detection via ipapi.co |

---

## 🤖 ML Features

### Anomaly Detection
- **Model:** Isolation Forest + Z-Score (dual method)
- **Training Data:** 700+ days of NASA historical temperature data
- **Detection:** Real-time anomaly scoring for any global location
- **Severity Levels:** Normal → Mild → Moderate → Extreme

### Trend Analysis
- **Method:** Linear Regression (SciPy stats)
- **Output:** Warming/cooling trend in °C/year
- **Statistics:** R-squared, p-value, statistical significance

---

## 🌐 Supported Languages (21)

### Indian Languages (11)
Hindi, Odia, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Punjabi, Gujarati, English

### International Languages (10)
German, French, Japanese, Spanish, Arabic, Portuguese, Chinese, Korean, Italian, Russian

**Auto-detection:** Site detects user's region and shows regional language in toggle. Default is always English.

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | API info |
| `GET /health` | Health check (also used by the frontend keep-alive ping) |
| `GET /api/temperature` | Live temperature (Open-Meteo) |
| `GET /api/temperature/global` | 9 major cities — live data |
| `GET /api/historical` | Historical temperature (NASA POWER, cached 10 min) |
| `GET /api/anomalies` | ML anomaly detection (Isolation Forest + Z-Score) |
| `GET /api/trends` | Warming/cooling trend analysis (SciPy linear regression) |
| `GET /api/co2` | Live CO2 concentration (NOAA Mauna Loa) |
| `GET /api/events` | Live extreme weather events (ReliefWeb) |
| `GET /api/earthquakes` | Earthquakes from USGS (M2.5+, up to 7 days). Query: `window` (`1h`/`24h`/`7d`), `min_mag`, `region`. Includes 24h counters; cached 2 min, serves the last good copy if USGS is down |
| `GET /api/wildfires` | Active wildfires from NASA EONET; severity by burned area. Cached 15 min, serves the last good copy if EONET is down |
| `GET /api/storms` | Tropical cyclones from GDACS (alert levels) plus EONET severe storms GDACS does not cover |
| `GET /api/volcanoes` | Volcanoes currently erupting or in notable unrest (NASA EONET) |
| `GET /api/icebergs` | Tracked icebergs (NASA EONET / U.S. National Ice Center) |
| `GET /api/hazards` | All of the above in one list, most severe first. Query: `category` (`wildfire,storm,volcano,iceberg`), `min_severity` (`info`/`mild`/`moderate`/`extreme`), `limit` |
| `GET /api/wind` | Global wind field (Open-Meteo, 15° grid, 264 points): speed, direction and gusts per point. Cached 3 h, serves the last good copy if Open-Meteo rate-limits |
| `GET /api/waves` | Open-ocean wave height, direction and period (Open-Meteo Marine, ~111 ocean grid points). Cached 3 h, serves the last good copy if Open-Meteo rate-limits |
| `GET /api/export/csv` | Historical data export (JSON; frontend converts to CSV) |
| `GET /api/climate-index` | El Niño / La Niña detection (NOAA ONI Index) |
| `GET /api/arctic-ice` | Arctic sea ice extent (NSIDC) |
| `GET /api/seasonal` | Seasonal decomposition — trend + seasonality + residual |
| `GET /api/correlation` | Correlation matrix — CO2 vs temperature vs sea level |
| `GET /api/air-quality` | Real-time air quality index (Open-Meteo) |
| `GET /api/heat-index` | Heat index calculation |
| `GET /api/tipping-points` | Climate tipping-point indicators |
| `GET /api/uv-solar` | UV index and solar radiation |
| `GET /api/compare-cities` | Side-by-side climate comparison of two cities |
| `GET /api/year-comparison` | Year-over-year temperature comparison |
| `GET /api/anomaly-calendar` | Calendar view of temperature anomalies |
| `GET /api/forecast` | Temperature forecast |
| `GET /api/health-dashboard` | Upstream API status dashboard |

Full interactive docs (request/response schemas): https://earthwatch.onrender.com/docs

---

## ✨ Features

- 🌡️ **Live Temperature** — Delhi default, any city searchable
- 🤖 **ML Anomaly Detection** — Isolation Forest + Z-Score
- 📈 **Climate Trends** — Warming/Cooling analysis
- 🏭 **CO2 Tracker** — Live Mauna Loa data
- 🌍 **3D Globe** — Interactive global temperature map
- 🌐 **9 Global Cities** — Real-time temperatures
- 🚨 **Disaster Events** — GDACS live feed (last 90 days)
- 🫨 **Earthquakes** — USGS live feed: globe layer sized by magnitude, pulse rings on fresh quakes, live ticker, filterable list (window / magnitude / region)
- ⚠️ **Active hazards** — wildfires, cyclones & storms, volcanoes, icebergs (EONET + GDACS): globe layers sized by severity, merged live ticker, filterable list (category / severity)
- 💨 **Wind** — Open-Meteo 15° global grid drawn as direction arrows (colour by speed) on the globe and the 2D map; off by default, toggle it in the layer panel
- 🌊 **Ocean waves** — Open-Meteo Marine open-ocean grid: dots sized and coloured by wave height; off by default, toggle it in the layer panel
- 🔍 **City Search** — Any city worldwide
- 🌐 **21 Languages** — Auto region detection
- 🌡️ **°C/°F Toggle** — Unit switching
- 🔗 **Share Button** — Share EarthWatch
- 📱 **PWA** — Install on mobile
- 🎬 **Entry Animation** — Smooth loading screen
- 🎨 **Skeleton Loading** — No blank screens

---

## 🏃 Run Locally

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 👨‍💻 Author
**Kamal Lochan Sahu**
- GitHub: [@kamal-lochan-sahu](https://github.com/kamal-lochan-sahu)
- Location: Berhampur, Odisha, India

---

*Built with ❤️ from Odisha, India 🇮🇳*
