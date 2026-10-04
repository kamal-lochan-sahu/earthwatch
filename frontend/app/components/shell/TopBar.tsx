"use client";
import { useState } from "react";
import { useAppState } from "../../context/AppState";
import { useData } from "../../context/DataContext";
import LanguageToggle from "../LanguageToggle";
import { TABS } from "./tabs";

export default function TopBar() {
  const {
    view, setView, openCity, isFahrenheit, toggleUnits,
    currentLang, setCurrentLang, regionalLang, t,
  } = useAppState();
  const { temperature, co2 } = useData();
  const [query, setQuery] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    openCity(query);
    setQuery("");
  };

  const share = () => {
    const url = `https://earthwatch.vercel.app${window.location.pathname}${window.location.search}`;
    if (navigator.share) {
      navigator.share({
        title: "EarthWatch 🌍",
        text: `Delhi temperature: ${temperature?.current_temperature}°C | CO2: ${co2?.latest_co2_ppm} ppm | Check live climate data!`,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied! Share EarthWatch 🌍");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05070d]/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 md:px-6">
        <button
          onClick={() => setView("mission")}
          className="flex items-center gap-2 text-xl font-bold text-green-400"
          aria-label="EarthWatch home"
        >
          <span aria-hidden>🌍</span>
          <span>{t.title}</span>
        </button>

        <nav aria-label="Views" className="hidden gap-1 md:flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === tab.id
                  ? "bg-green-400/15 text-green-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <form
          onSubmit={submitSearch}
          role="search"
          className="order-last w-full md:order-none md:ml-auto md:w-64"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`🔍 ${t.searchTitle}`}
            aria-label={t.searchTitle}
            className="w-full rounded-full border border-white/10 bg-gray-900 px-4 py-1.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
          />
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            onClick={toggleUnits}
            aria-label="Toggle temperature unit"
            className="rounded-full border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-bold"
          >
            <span className={isFahrenheit ? "text-gray-500" : "text-green-400"}>°C</span>
            <span className="mx-1.5 text-gray-600">|</span>
            <span className={isFahrenheit ? "text-green-400" : "text-gray-500"}>°F</span>
          </button>
          <button
            onClick={share}
            aria-label={t.share}
            className="rounded-full border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-bold text-gray-300 transition-all hover:border-green-500 hover:text-white"
          >
            🔗<span className="hidden lg:inline"> {t.share}</span>
          </button>
          <LanguageToggle
            currentLang={currentLang}
            regionalLang={regionalLang}
            onLanguageChange={setCurrentLang}
          />
        </div>
      </div>
    </header>
  );
}
