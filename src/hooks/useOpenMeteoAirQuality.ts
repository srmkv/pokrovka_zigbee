import { useEffect, useMemo, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type AirState = {
  loading: boolean;
  error?: string;
  current?: {
    europeanAqi: number | null;
    pm25: number | null;
    pm10: number | null;
  };
};

function num(x: any): number | null {
  const n = typeof x === "number" ? x : x == null ? null : Number(x);
  return Number.isFinite(n as number) ? (n as number) : null;
}

export function useOpenMeteoAirQuality(lat: number, lon: number) {
  const [state, setState] = useState<AirState>({ loading: true });

  const url = useMemo(() => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow",
      current: ["european_aqi", "pm2_5", "pm10"].join(","),
    });
    return `${API_BASE}/weather/air-quality?${params.toString()}`;
  }, [lat, lon]);

  useEffect(() => {
    let abort = false;
    (async () => {
      setState({ loading: true });
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!abort) {
          setState({
            loading: false,
            current: {
              europeanAqi: num(json.current?.european_aqi),
              pm25: num(json.current?.pm2_5),
              pm10: num(json.current?.pm10),
            },
          });
        }
      } catch (e: any) {
        if (!abort) {
          setState({ loading: false, error: e?.message || "fetch failed" });
        }
      }
    })();
    return () => {
      abort = true;
    };
  }, [url]);

  return state;
}
