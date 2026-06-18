import React, { createContext, useContext, useEffect, useState } from "react";

// Типы
type LeakState = "dry" | "leak" | "unknown";
interface LeakSensors {
  leakSensor: LeakState;
  lastLeak: string | null;
  washingMachineSensor: LeakState;
  lastLeakWashing: string | null;
  dishwasherSensor: LeakState;
  lastLeakDishwasher: string | null;
}

// Значения по умолчанию
const defaultState: LeakSensors = {
  leakSensor: "unknown",
  lastLeak: null,
  washingMachineSensor: "unknown",
  lastLeakWashing: null,
  dishwasherSensor: "unknown",
  lastLeakDishwasher: null,
};

const LeakSensorsContext = createContext<LeakSensors>(defaultState);

export const useLeakSensorsState = () => useContext(LeakSensorsContext);

export const LeakSensorsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LeakSensors>(defaultState);

  // базовый URL берём из env, но по умолчанию /api/home
  const API_BASE =
    (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "") + "/home";

  useEffect(() => {
    let mounted = true;

    async function fetchState() {
      try {
        const resp = await fetch(API_BASE);
        if (!resp.ok) throw new Error(String(resp.status));
        const json = await resp.json();
        if (!mounted) return;
        setState({
          leakSensor: json.leakSensor ?? "unknown",
          lastLeak: json.lastLeak ?? null,
          washingMachineSensor: json.washingMachineSensor ?? "unknown",
          lastLeakWashing: json.lastLeakWashing ?? null,
          dishwasherSensor: json.dishwasherSensor ?? "unknown",
          lastLeakDishwasher: json.lastLeakDishwasher ?? null,
        });
      } catch {
        if (mounted) setState(defaultState);
      }
    }

    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [API_BASE]);

  return (
    <LeakSensorsContext.Provider value={state}>
      {children}
    </LeakSensorsContext.Provider>
  );
};
