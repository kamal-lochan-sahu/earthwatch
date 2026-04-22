# 🌍 EarthWatch
### Real-Time Climate Anomaly Detection & Environmental Intelligence Platform

![Status](https://img.shields.io/badge/Status-Live-green)
![Python](https://img.shields.io/badge/Python-3.12-blue)
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
| Backend | FastAPI, Python 3.12, Uvicorn |
| ML | Scikit-learn (Isolation Forest), SciPy (Linear Regression) |
| Data Sources | NASA POWER, Open-Meteo, NOAA CO2, GDACS Events |
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
| `GET /health` | Health check |
| `GET /api/temperature` | Live temperature (Open-Meteo) |
| `GET /api/temperature/global` | 9 major cities live data |
| `GET /api/historical` | NASA POWER historical data |
| `GET /api/anomalies` | ML anomaly detection |
| `GET /api/trends` | Climate trend analysis |
| `GET /api/co2` | Live CO2 from NOAA |
| `GET /api/events` | Live disaster events from GDACS |

---

## ✨ Features

- 🌡️ **Live Temperature** — Delhi default, any city searchable
- 🤖 **ML Anomaly Detection** — Isolation Forest + Z-Score
- 📈 **Climate Trends** — Warming/Cooling analysis
- 🏭 **CO2 Tracker** — Live Mauna Loa data
- 🌍 **3D Globe** — Interactive global temperature map
- 🌐 **9 Global Cities** — Real-time temperatures
- 🚨 **Disaster Events** — GDACS live feed (last 90 days)
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
venv\Scripts\activate
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
- Goal: Germany IT Ausbildung 🇩🇪

---

*Built with ❤️ from Odisha, India 🇮🇳*