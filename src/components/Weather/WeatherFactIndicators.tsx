// src/components/Weather/WeatherFactIndicators.tsx
import React, { useEffect, useMemo, useState } from "react";

interface Props {
  lat: number;
  lon: number;
}

type OMResp = {
  current_weather?: {
    time: string;
    temperature: number;
    windspeed: number;     // km/h
    winddirection: number; // degrees
    weathercode: number;
  };
  hourly?: {
    time: string[];
    relative_humidity_2m?: number[]; // %
    surface_pressure?: number[];     // hPa
    pressure_msl?: number[];         // hPa (fallback)
  };
};

const tz =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";

function toCardinalRu(deg?: number): string | undefined {
  if (deg == null || isNaN(deg)) return undefined;
  const dirs = ["С","ССВ","СВ","ВСВ","В","ВЮВ","ЮВ","ЮЮВ","Ю","ЮЮЗ","ЮЗ","ЗЮЗ","З","ЗСЗ","СЗ","ССЗ"];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

function round(n?: number | null, d = 0): string {
  if (n == null || !isFinite(n)) return "--";
  const p = Math.pow(10, d);
  return String(Math.round(n * p) / p);
}

const WeatherFactIndicators: React.FC<Props> = ({ lat, lon }) => {
  const [hum, setHum] = useState<number | null>(null);
  const [pressMm, setPressMm] = useState<number | null>(null);
  const [windMs, setWindMs] = useState<number | null>(null);
  const [windDir, setWindDir] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: tz,
      current_weather: "true",
      hourly: ["relative_humidity_2m", "surface_pressure", "pressure_msl"].join(","),
      forecast_days: "1",
      past_days: "0",
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  }, [lat, lon]);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setErr(null);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j: OMResp = await r.json();

        // Ветер из current_weather
        const wsKph = j.current_weather?.windspeed ?? null;
        const wdDeg = j.current_weather?.winddirection ?? null;
        const wsMs = wsKph != null ? wsKph / 3.6 : null; // km/h -> m/s

        // Индекс текущего часа в hourly: точное совпадение или ближайший
        let idx = 0;
        if (j.hourly?.time?.length) {
          if (j.current_weather?.time) {
            idx = j.hourly.time.indexOf(j.current_weather.time);
          }
          if (idx < 0) {
            const nowMs = Date.now();
            idx = j.hourly.time
              .map((t) => Math.abs(new Date(t).getTime() - nowMs))
              .reduce((best, dist, i, arr) => (dist < arr[best] ? i : best), 0);
          }
        }

        const rh = j.hourly?.relative_humidity_2m?.[idx] ?? null;
        const pHpa =
          j.hourly?.surface_pressure?.[idx] ??
          j.hourly?.pressure_msl?.[idx] ??
          null;
        const pMm = pHpa != null ? pHpa * 0.750061683 : null; // hPa -> мм рт. ст.

        if (!abort) {
          setHum(rh);
          setPressMm(pMm);
          setWindMs(wsMs);
          setWindDir(toCardinalRu(wdDeg ?? undefined));
        }
      } catch (e: any) {
        if (!abort) setErr(e?.message || "fetch failed");
      }
    })();
    return () => {
      abort = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center text-gray-350 text-lg mt-2 space-y-1">
      {err && <div className="text-red-400 text-sm">Ошибка погоды: {err}</div>}
      <div>💧 Влажность: {hum != null ? `${round(hum)}%` : "--"}</div>
      <div>🌡 Давление: {pressMm != null ? `${round(pressMm)} мм` : "--"}</div>
      <div>
        💨 Ветер: {windMs != null ? `${round(windMs, 1)} м/с` : "--"}
        {windDir ? `, ${windDir}` : ""}
      </div>
    </div>
  );
};

export default WeatherFactIndicators;
