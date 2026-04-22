"use client";
import { useState, useEffect, useRef } from "react";
import { LANGUAGE_NAMES } from "../translations";

interface Props {
  currentLang: string;
  regionalLang: string | null;
  onLanguageChange: (lang: string) => void;
}

export default function LanguageToggle({ currentLang, regionalLang, onLanguageChange }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm font-bold text-gray-300 hover:text-white hover:border-green-500 transition-all flex items-center gap-2"
      >
        🌐 {LANGUAGE_NAMES[currentLang] || "English"}
        <span className="text-gray-500">▾</span>
      </button>

      {showDropdown && (
        <div className="absolute top-12 right-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-52 overflow-hidden">
          {/* English — always first */}
          <button
            onClick={() => { onLanguageChange("en"); setShowDropdown(false); }}
            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 transition-colors ${currentLang === "en" ? "text-green-400 font-bold" : "text-gray-300"}`}
          >
            🇬🇧 English
          </button>

          {/* Regional language — auto detected */}
          {regionalLang && regionalLang !== "en" && (
            <>
              <div className="border-t border-gray-800 mx-3" />
              <button
                onClick={() => { onLanguageChange(regionalLang); setShowDropdown(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 transition-colors ${currentLang === regionalLang ? "text-green-400 font-bold" : "text-gray-300"}`}
              >
                📍 {LANGUAGE_NAMES[regionalLang]} (Your Region)
              </button>
            </>
          )}

          {/* All other languages */}
          <div className="border-t border-gray-800 mx-3" />
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(LANGUAGE_NAMES)
              .filter(([code]) => code !== "en" && code !== regionalLang)
              .map(([code, name]) => (
                <button
                  key={code}
                  onClick={() => { onLanguageChange(code); setShowDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 transition-colors ${currentLang === code ? "text-green-400 font-bold" : "text-gray-300"}`}
                >
                  {name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}