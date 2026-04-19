"use client";
import { useEffect, useRef } from "react";

const PING_INTERVAL_MS = 14 * 60 * 1000;

export default function KeepAlive() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingCountRef = useRef(0);

  const pingBackend = async () => {
    try {
      pingCountRef.current += 1;
      const res = await fetch("https://earthwatch.onrender.com/health", { cache: "no-store" });
      console.log(`[KeepAlive] Ping #${pingCountRef.current} — ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.warn("[KeepAlive] Ping failed:", err);
    }
  };

  useEffect(() => {
    pingBackend();
    intervalRef.current = setInterval(pingBackend, PING_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}