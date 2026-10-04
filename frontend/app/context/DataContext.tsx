"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { apiGet } from "../hooks/useApi";

export interface WeatherEvent {
  title: string;
  type: any;
  severity: any;
  date: string;
  location?: string;
  description?: string;
}

interface DataState {
  temperature: any;
  anomaly: any;
  trends: any;
  cities: any[];
  co2: any;
  events: WeatherEvent[];
  loadingTemp: boolean;
  loadingCo2: boolean;
  loadingCities: boolean;
  loadingEvents: boolean;
  loadingTrends: boolean;
}

const DataContext = createContext<DataState | null>(null);

/** Fetches the shared headline datasets once, so switching tabs never refetches. */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [temperature, setTemperature] = useState<any>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [co2, setCo2] = useState<any>(null);
  const [events, setEvents] = useState<WeatherEvent[]>([]);

  const [loadingTemp, setLoadingTemp] = useState(true);
  const [loadingCo2, setLoadingCo2] = useState(true);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    async function fetchTemp() {
      try {
        const [tempData, anomalyData] = await Promise.all([
          apiGet("/api/temperature"),
          apiGet("/api/anomalies"),
        ]);
        setTemperature(tempData);
        setAnomaly(anomalyData);
      } catch {
        console.error("Temp error:");
      } finally {
        setLoadingTemp(false);
      }
    }
    async function fetchCo2() {
      try {
        setCo2(await apiGet("/api/co2"));
      } catch {
        console.error("CO2 error:");
      } finally {
        setLoadingCo2(false);
      }
    }
    async function fetchCities() {
      try {
        const data = await apiGet("/api/temperature/global");
        setCities(data.cities || []);
      } catch {
        console.error("Cities error:");
      } finally {
        setLoadingCities(false);
      }
    }
    async function fetchEvents() {
      try {
        const data = await apiGet("/api/events");
        setEvents(data.events || []);
      } catch {
        console.error("Events error:");
      } finally {
        setLoadingEvents(false);
      }
    }
    async function fetchTrends() {
      try {
        setTrends(await apiGet("/api/trends"));
      } catch {
        console.error("Trends error:");
      } finally {
        setLoadingTrends(false);
      }
    }

    // Staggered so the shared free-tier backend isn't hit all at once.
    const timers = [
      setTimeout(fetchCo2, 100),
      setTimeout(fetchCities, 200),
      setTimeout(fetchEvents, 300),
      setTimeout(fetchTrends, 400),
    ];
    fetchTemp();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <DataContext.Provider
      value={{
        temperature, anomaly, trends, cities, co2, events,
        loadingTemp, loadingCo2, loadingCities, loadingEvents, loadingTrends,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
