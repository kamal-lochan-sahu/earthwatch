# 🌍 EarthWatch

### Real-Time Climate Anomaly Detection & Environmental Intelligence Platform

![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active--development-orange)
![Python](https://img.shields.io/badge/Python-3.12-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

---

## 🚀 What is EarthWatch?

EarthWatch is an end-to-end climate intelligence platform that combines **live NASA/NOAA data**, **ML-powered anomaly detection**, and **interactive 3D globe visualization** to make climate change visible and understandable.

> "This temperature is 3.2σ above the 50-year average" — EarthWatch tells you what the numbers actually mean.

---

## 🔍 The Problem

Climate change is producing increasingly frequent anomalies — unexpected temperature spikes, CO₂ surges, extreme weather events. Current tools are either:
- Too scientific (hard to understand for general public)
- Too simple (no real ML, no live data)

**No platform combines live climate data + ML anomaly detection + visual storytelling in one place.**

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌐 Interactive 3D Globe | Live anomalies shown on a rotating world map |
| 🤖 ML Anomaly Detection | Isolation Forest detects climate anomalies in real-time |
| 📈 Historical Trends | 50+ years of climate data visualized |
| 🌡️ CO₂ Tracker | Real-time CO₂ concentration + temperature correlation |
| ⚡ Extreme Weather Feed | Live disaster and extreme weather event updates |
| 📊 Statistical Analysis | Z-score based deviation from historical norms |

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** — App Router
- **Tailwind CSS** — Styling
- **Globe.gl** — 3D interactive globe
- **Recharts** — Time series charts
- **D3.js** — Custom visualizations

### Backend
- **FastAPI** — REST API
- **Isolation Forest** — ML anomaly detection
- **Statsmodels** — Statistical trend analysis
- **APScheduler** — Automated data fetching
- **Pandas + NumPy** — Data processing

### Data Sources (All Free)
- **Open-Meteo API** — Live weather + historical climate
- **NASA POWER API** — Solar radiation + temperature data
- **Global Carbon Project** — CO₂ emissions data
- **NOAA CDO API** — Historical climate records
- **ReliefWeb API** — Disaster event tracking

---

## 📁 Project Structure

earthwatch/
├── frontend/          # Next.js 14 application
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── components/
│   └── lib/
├── backend/           # FastAPI + ML pipeline
│   ├── main.py
│   ├── data/          # API fetchers + scheduler
│   ├── ml/            # Anomaly detection models
│   └── models/        # Saved ML models
└── notebooks/         # Google Colab training notebooks

---

## 🚀 Getting Started

### Backend
```bash
cd backend
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

## 📡 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/anomalies` | Latest detected climate anomalies |
| `GET /api/temperature` | Current temperature data by location |
| `GET /api/co2` | Real-time CO₂ concentration |
| `GET /api/events` | Extreme weather events feed |
| `GET /api/trends` | Historical climate trend analysis |

---

## 🌱 Why EarthWatch?

- **Real data** — NASA, NOAA, Open-Meteo APIs
- **Real ML** — Not just charts, actual anomaly detection
- **Real impact** — Climate intelligence for everyone
- **Production ready** — Deployed live, not just on GitHub

---

## 👨‍💻 Author

**Kamal Lochan Sahu**
- GitHub: [@kamal-lochan-sahu](https://github.com/kamal-lochan-sahu)
- Location: Berhampur, Odisha, India
- Goal: IT/Robotics Ausbildung in Germany 🇩🇪

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.