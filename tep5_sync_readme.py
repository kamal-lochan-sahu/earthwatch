[1mdiff --git a/README.md b/README.md[m
[1mindex 89a0350..7ce7a09 100644[m
[1m--- a/README.md[m
[1m+++ b/README.md[m
[36m@@ -2,7 +2,7 @@[m
 ### Real-Time Climate Anomaly Detection & Environmental Intelligence Platform[m
 [m
 ![Status](https://img.shields.io/badge/Status-Live-green)[m
[31m-![Python](https://img.shields.io/badge/Python-3.12-blue)[m
[32m+[m[32m![Python](https://img.shields.io/badge/Python-3.11-blue)[m[41m[m
 ![Next.js](https://img.shields.io/badge/Next.js-14-black)[m
 ![ML](https://img.shields.io/badge/ML-Isolation%20Forest-purple)[m
 ![PWA](https://img.shields.io/badge/PWA-Enabled-orange)[m
[36m@@ -37,7 +37,7 @@[m [mEarthWatch is a full-stack climate intelligence platform that:[m
 | Layer | Technology |[m
 |-------|-----------|[m
 | Frontend | Next.js 14, TypeScript, Tailwind CSS, Globe.gl |[m
[31m-| Backend | FastAPI, Python 3.12, Uvicorn |[m
[32m+[m[32m| Backend | FastAPI, Python 3.11, Uvicorn |[m[41m[m
 | ML | Scikit-learn (Isolation Forest), SciPy (Linear Regression) |[m
 | Data Sources | NASA POWER, Open-Meteo, NOAA CO2, GDACS Events |[m
 | Deploy | Vercel (Frontend), Render (Backend) |[m
[36m@@ -78,14 +78,30 @@[m [mGerman, French, Japanese, Spanish, Arabic, Portuguese, Chinese, Korean, Italian,[m
 | Endpoint | Description |[m
 |----------|-------------|[m
 | `GET /` | API info |[m
[31m-| `GET /health` | Health check |[m
[32m+[m[32m| `GET /health` | Health check (also used by the frontend keep-alive ping) |[m[41m[m
 | `GET /api/temperature` | Live temperature (Open-Meteo) |[m
[31m-| `GET /api/temperature/global` | 9 major cities live data |[m
[31m-| `GET /api/historical` | NASA POWER historical data |[m
[31m-| `GET /api/anomalies` | ML anomaly detection |[m
[31m-| `GET /api/trends` | Climate trend analysis |[m
[31m-| `GET /api/co2` | Live CO2 from NOAA |[m
[31m-| `GET /api/events` | Live disaster events from GDACS |[m
[32m+[m[32m| `GET /api/temperature/global` | 9 major cities — live data |[m[41m[m
[32m+[m[32m| `GET /api/historical` | Historical temperature (NASA POWER, cached 10 min) |[m[41m[m
[32m+[m[32m| `GET /api/anomalies` | ML anomaly detection (Isolation Forest + Z-Score) |[m[41m[m
[32m+[m[32m| `GET /api/trends` | Warming/cooling trend analysis (SciPy linear regression) |[m[41m[m
[32m+[m[32m| `GET /api/co2` | Live CO2 concentration (NOAA Mauna Loa) |[m[41m[m
[32m+[m[32m| `GET /api/events` | Live extreme weather events (ReliefWeb) |[m[41m[m
[32m+[m[32m| `GET /api/export/csv` | Historical data export (JSON; frontend converts to CSV) |[m[41m[m
[32m+[m[32m| `GET /api/climate-index` | El Niño / La Niña detection (NOAA ONI Index) |[m[41m[m
[32m+[m[32m| `GET /api/arctic-ice` | Arctic sea ice extent (NSIDC) |[m[41m[m
[32m+[m[32m| `GET /api/seasonal` | Seasonal decomposition — trend + seasonality + residual |[m[41m[m
[32m+[m[32m| `GET /api/correlation` | Correlation matrix — CO2 vs temperature vs sea level |[m[41m[m
[32m+[m[32m| `GET /api/air-quality` | Real-time air quality index (Open-Meteo) |[m[41m[m
[32m+[m[32m| `GET /api/heat-index` | Heat index calculation |[m[41m[m
[32m+[m[32m| `GET /api/tipping-points` | Climate tipping-point indicators |[m[41m[m
[32m+[m[32m| `GET /api/uv-solar` | UV index and solar radiation |[m[41m[m
[32m+[m[32m| `GET /api/compare-cities` | Side-by-side climate comparison of two cities |[m[41m[m
[32m+[m[32m| `GET /api/year-comparison` | Year-over-year temperature comparison |[m[41m[m
[32m+[m[32m| `GET /api/anomaly-calendar` | Calendar view of temperature anomalies |[m[41m[m
[32m+[m[32m| `GET /api/forecast` | Temperature forecast |[m[41m[m
[32m+[m[32m| `GET /api/health-dashboard` | Upstream API status dashboard |[m[41m[m
[32m+[m[41m[m
[32m+[m[32mFull interactive docs (request/response schemas): https://earthwatch.onrender.com/docs[m[41m[m
 [m
 ---[m
 [m
[36m@@ -114,7 +130,7 @@[m [mGerman, French, Japanese, Spanish, Arabic, Portuguese, Chinese, Korean, Italian,[m
 ```bash[m
 cd backend[m
 python -m venv venv[m
[31m-venv\Scripts\activate[m
[32m+[m[32msource venv/bin/activate   # Windows: venv\Scripts\activate[m[41m[m
 pip install -r requirements.txt[m
 uvicorn main:app --reload[m
 ```[m
