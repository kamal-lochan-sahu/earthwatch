"use client";
import ViewContainer from "../components/ViewContainer";
import Skeleton from "../components/Skeleton";
import { useAppState } from "../context/AppState";
import { useData } from "../context/DataContext";
import { getEventIcon, getSeverityColor } from "../lib/format";

export default function HazardsView() {
  const { t } = useAppState();
  const { events, loadingEvents } = useData();

  return (
    <ViewContainer>
      {loadingEvents ? <Skeleton className="h-48 mb-8" /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-1">🚨 {t.events}</h2>
          <p className="text-gray-500 text-xs mb-4">Source: GDACS — Global Disaster Alert & Coordination System</p>
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">{t.noEvents}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {events.map((event, i) => (
                <div key={i} className={`bg-gray-800 border rounded-lg p-4 flex items-start gap-4 ${getSeverityColor(event.severity)}`}>
                  <span className="text-2xl mt-0.5">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-white font-bold text-sm">{event.title}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getSeverityColor(event.severity)}`}>
                        {isNaN(Number(event.severity)) ? String(event.severity ?? "").toUpperCase() : "⚠️ ALERT"}
                      </span>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {event.type && <p className="text-gray-400 text-xs">📌 {event.type}</p>}
                      {event.location && <p className="text-gray-400 text-xs">📍 {event.location}</p>}
                      {event.date && <p className="text-gray-500 text-xs">🕐 {event.date}</p>}
                    </div>
                    {event.description && (
                      <p className="text-gray-400 text-xs mt-1 line-clamp-2">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ViewContainer>
  );
}
