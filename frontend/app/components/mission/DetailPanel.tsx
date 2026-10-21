"use client";
import { useEffect } from "react";
import { useAppState } from "../../context/AppState";
import { useLayerStore } from "../../context/LayerStore";

/** Details of the selected map item. Content comes from the layer's own toDetail(). */
export default function DetailPanel() {
  const { t, select, openCity, convertTemp, tempUnit } = useAppState();
  const { selected } = useLayerStore();

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  if (!selected) return null;
  const d = selected.def.toDetail(selected.item, { convertTemp, tempUnit });

  return (
    <div role="region" aria-label={t.selectedItem}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-white">{d.title}</h2>
          {d.subtitle && <p className="text-xs text-gray-400">{d.subtitle}</p>}
        </div>
        <button
          onClick={() => select("")}
          aria-label={t.close}
          className="h-8 w-8 shrink-0 rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      {d.headline && (
        <p className="my-3 font-mono text-4xl font-bold" style={{ color: d.headlineColor }}>
          {d.headline}
        </p>
      )}
      <dl className="space-y-1.5 text-sm">
        {d.rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-gray-400">{r.label}</dt>
            <dd className="text-right font-mono text-gray-100">{r.value}</dd>
          </div>
        ))}
      </dl>
      {d.action && (
        <button
          onClick={() => openCity(d.action!.city)}
          className="mt-4 w-full rounded-full bg-green-400/15 px-4 py-2 text-sm font-semibold text-green-400 hover:bg-green-400/25"
        >
          {d.action.label} →
        </button>
      )}
      {d.link && /^https:\/\//i.test(d.link.href) && (
        <a
          href={d.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full rounded-full bg-white/10 px-4 py-2 text-center text-sm font-semibold text-gray-100 hover:bg-white/15"
        >
          {d.link.label} ↗
        </a>
      )}
    </div>
  );
}
