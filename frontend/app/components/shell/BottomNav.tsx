"use client";
import { useEffect, useRef } from "react";
import { useAppState } from "../../context/AppState";
import { TABS } from "./tabs";

export default function BottomNav() {
  const { view, setView } = useAppState();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--bottomnav-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <nav
      ref={ref}
      aria-label="Views"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#05070d]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          aria-current={view === tab.id ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
            view === tab.id ? "text-green-400" : "text-gray-500"
          }`}
        >
          <span className="text-lg leading-none" aria-hidden>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
