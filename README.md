# 🌍 EarthWatch
### Real-Time Climate Anomaly Detection & Environmental Intelligence Platform

![Status](https://img.shields.io/badge/Status-Live-green)
![Python](https://img.shields.io/badge/Python-3.12-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![ML](https://img.shields.io/badge/ML-Isolation%20Forest-purple)

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

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Globe.gl |
| Backend | FastAPI, Python 3.12, Uvicorn |
| ML | Scikit-learn (Isolation Forest), SciPy (Linear Regression) |
| Data | NASA POWER API, Open-Meteo API |
| Deploy | Vercel (Frontend), Render (Backend) |

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