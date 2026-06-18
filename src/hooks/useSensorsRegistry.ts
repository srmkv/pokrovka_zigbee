import { useEffect, useState } from "react";
import { SensorItem } from "../types/sensors";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

export function refreshSensorsRegistry() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sensors-registry-refresh"));
    window.dispatchEvent(new Event("leak-sensors-refresh"));
  }
}

export function useSensorsRegistry() {
  const [sensors, setSensors] = useState<SensorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const resp = await fetch(`${API_BASE}/sensors`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (!mounted) return;
        setSensors(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err: any) {
        if (!mounted) return;
        setSensors([]);
        setError(err?.message || "Ошибка загрузки датчиков");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 5000);
    const handler = () => void load();
    window.addEventListener("sensors-registry-refresh", handler);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("sensors-registry-refresh", handler);
    };
  }, []);

  return { sensors, loading, error };
}
