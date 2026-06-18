// src/hooks/useOpenMeteo.ts
import { useEffect, useMemo, useState } from "react";

// Почасовая точка
export type WeatherPoint = {
  time: string;                 // ISO в вашей таймзоне
  tC: number | null;            // temperature_2m
  apparentTC?: number | null;   // apparent_temperature
  rh?: number | null;           // relative_humidity_2m, %
  pop?: number | null;          // precipitation_probability, %
  precipMm?: number | null;     // precipitation, мм
  uvIndex?: number | null;      // uv index
  wcode?: number | null;        // weathercode (WMO)
  windMs?: number | null;       // wind_speed_10m (м/с)
  windDirDeg?: number | null;   // wind_direction_10m (градусы)
  visibilityM?: number | null;  // visibility (м)
  pressureHpa?: number | null;  // surface_pressure (hPa)
  pressureMslHpa?: number | null; // pressure_msl (hPa) — запасной
};

// Суточная точка
export type DailyPoint = {
  date: string;                 // YYYY-MM-DD
  tMinC: number | null;
  tMaxC: number | null;
  wcode?: number | null;
  pop?: number | null;          // precipitation_probability_max, %
  precipMm?: number | null;     // precipitation_sum, мм
  sunrise?: string | null;      // ISO
  sunset?: string | null;       // ISO
};

// Состояние хука
export type OpenMeteoState = {
  loading: boolean;
  error?: string;
  now?: {
    time: string;
    tempC: number;
    wcode: number;
    windKph: number;
  };
  hourly: WeatherPoint[];
  daily: DailyPoint[];
};

const pickTZ = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";

// безопасный парсер чисел
function num(x: any): number | null {
  const n = typeof x === "number" ? x : x == null ? null : Number(x);
  return Number.isFinite(n as number) ? (n as number) : null;
}

export function useOpenMeteo(lat: number, lon: number, hours = 48, days = 7) {
  const [state, setState] = useState<OpenMeteoState>({
    loading: true,
    hourly: [],
    daily: [],
  });

  const url = useMemo(() => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: pickTZ(),                 // НЕ encodeURIComponent — URLSearchParams сам кодирует
      current_weather: "true",
      // чтобы единицы совпадали с интерфейсом
      windspeed_unit: "ms",               // м/с для почасового ветра
      temperature_unit: "celsius",
      precipitation_unit: "mm",

      // Почасовые поля
      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "precipitation_probability",
        "precipitation",
        "uv_index",
        "weathercode",
        "wind_speed_10m",
        "wind_direction_10m",
        "visibility",
        "surface_pressure",
        "pressure_msl",
      ].join(","),

      // Суточные поля (добавили sunrise/sunset)
      daily: [
        "temperature_2m_max",
        "temperature_2m_min",
        "weathercode",
        "precipitation_sum",
        "precipitation_probability_max",
        "sunrise",
        "sunset",
      ].join(","),

      forecast_days: String(days),
      past_days: "0",
    });

    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  }, [lat, lon, days]);

  useEffect(() => {
    let abort = false;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();

        // current_weather (ветер приходит в км/ч — это специфика current_weather)
        const now = j.current_weather
          ? {
              time: j.current_weather.time as string,
              tempC: j.current_weather.temperature as number,
              wcode: j.current_weather.weathercode as number,
              windKph: j.current_weather.windspeed as number, // km/h
            }
          : undefined;

        // hourly
        const hourly: WeatherPoint[] = [];
        if (j.hourly?.time?.length) {
          const len = Math.min(j.hourly.time.length, hours);
          for (let i = 0; i < len; i++) {
            hourly.push({
              time: j.hourly.time[i],
              tC: num(j.hourly.temperature_2m?.[i]),
              apparentTC: num(j.hourly.apparent_temperature?.[i]),
              rh: num(j.hourly.relative_humidity_2m?.[i]),
              pop: num(j.hourly.precipitation_probability?.[i]),
              precipMm: num(j.hourly.precipitation?.[i]),
              uvIndex: num(j.hourly.uv_index?.[i]),
              wcode: num(j.hourly.weathercode?.[i]),
              windMs: num(j.hourly.wind_speed_10m?.[i]),
              windDirDeg: num(j.hourly.wind_direction_10m?.[i]),
              visibilityM: num(j.hourly.visibility?.[i]),
              pressureHpa: num(j.hourly.surface_pressure?.[i]),
              pressureMslHpa: num(j.hourly.pressure_msl?.[i]),
            });
          }
        }

        // daily
        const daily: DailyPoint[] = [];
        if (j.daily?.time?.length) {
          const len = j.daily.time.length;
          for (let i = 0; i < len; i++) {
            daily.push({
              date: j.daily.time[i],
              tMinC: num(j.daily.temperature_2m_min?.[i]),
              tMaxC: num(j.daily.temperature_2m_max?.[i]),
              wcode: num(j.daily.weathercode?.[i]),
              precipMm: num(j.daily.precipitation_sum?.[i]),
              pop: num(j.daily.precipitation_probability_max?.[i]),
              sunrise: j.daily.sunrise?.[i] ?? null,
              sunset: j.daily.sunset?.[i] ?? null,
            });
          }
        }

        if (!abort) {
          setState({ loading: false, hourly, daily, now });
        }
      } catch (e: any) {
        if (!abort) {
          setState((s) => ({
            ...s,
            loading: false,
            error: e?.message || "fetch failed",
          }));
        }
      }
    })();

    return () => {
      abort = true;
    };
  }, [url, hours]);

  return state;
}
