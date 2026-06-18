import { useEffect, useState } from "react";

export interface LeakSensorsState {
  leakSensor: "dry" | "leak" | "unknown";
  washingMachineSensor: "dry" | "leak" | "unknown";
  dishwasherSensor: "dry" | "leak" | "unknown";
  lastLeak: string | null;
  lastLeakWashing: string | null;
  lastLeakDishwasher: string | null;
}

const emptyState: LeakSensorsState = {
  leakSensor: "unknown",
  washingMachineSensor: "unknown",
  dishwasherSensor: "unknown",
  lastLeak: null,
  lastLeakWashing: null,
  lastLeakDishwasher: null,
};

function getApiUrl() {
  const base = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");
  return `${base}/sensors`;
}

export function refreshLeakSensors() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sensors-registry-refresh"));
    window.dispatchEvent(new Event("leak-sensors-refresh"));
  }
}

export function useLeakSensorsState(): LeakSensorsState {
  const [state, setState] = useState<LeakSensorsState>(emptyState);

  useEffect(() => {
    let mounted = true;

    async function fetchState() {
      try {
        const resp = await fetch(getApiUrl());
        if (!resp.ok) throw new Error(String(resp.status));
        const sensors = await resp.json();
        if (!mounted) return;
        const byLegacy = new Map((Array.isArray(sensors) ? sensors : []).map((sensor: any) => [sensor.legacyKey, sensor]));
        const bathroom: any = byLegacy.get("leakSensor");
        const washing: any = byLegacy.get("washingMachineSensor");
        const dishwasher: any = byLegacy.get("dishwasherSensor");
        setState({
          leakSensor: bathroom?.state?.status ?? "unknown",
          washingMachineSensor: washing?.state?.status ?? "unknown",
          dishwasherSensor: dishwasher?.state?.status ?? "unknown",
          lastLeak: bathroom?.state?.lastTriggerAt ?? null,
          lastLeakWashing: washing?.state?.lastTriggerAt ?? null,
          lastLeakDishwasher: dishwasher?.state?.lastTriggerAt ?? null,
        });
      } catch {
        if (mounted) setState(emptyState);
      }
    }

    fetchState();
    const interval = setInterval(fetchState, 5000);
    const handler = () => void fetchState();

    if (typeof window !== "undefined") {
      window.addEventListener("leak-sensors-refresh", handler);
      window.addEventListener("sensors-registry-refresh", handler);
    }

    return () => {
      mounted = false;
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("leak-sensors-refresh", handler);
        window.removeEventListener("sensors-registry-refresh", handler);
      }
    };
  }, []);

  return state;
}
