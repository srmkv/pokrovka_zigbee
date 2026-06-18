import React, { useMemo } from "react";
import { useOpenMeteo } from "../../hooks/useOpenMeteo";
import { useOpenMeteoAirQuality } from "../../hooks/useOpenMeteoAirQuality";
import LargeCard from "../LargeCard";
import SmallCard from "../SmallCard";
import { iconByWmo } from "./WeatherIconMap";
import SunProgressCard from "./SunCycleCard";
import LampBulbPrihozhaya from "../LightOsn/LampBulbPrihozhaya";
import LampBulbHoll from "../LightOsn/LampBulbHoll";
import LampBulbKitchen from "../LightOsn/LampBulbKitchen";
import LampBulbBath from "../LightOsn/LampBulbBath";
import LampBulbGarderob from "../LightOsn/LampBulbGarderob";

const LAT = 56.3269;
const LON = 44.0075;

const hpaToMm = (hpa?: number | null) =>
  hpa == null ? null : hpa * 0.750061683;

const toCardinalRu = (deg?: number | null) => {
  if (deg == null || isNaN(deg)) return "";
  const dirs = ["С","ССВ","СВ","ВСВ","В","ВЮВ","ЮВ","ЮЮВ","Ю","ЮЮЗ","ЮЗ","ЗЮЗ","З","ЗСЗ","СЗ","ССЗ","С"];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return dirs[idx];
};

const getDayTitle = (isoDate: string, idx: number) => {
  const d = new Date(`${isoDate}T00:00:00`);
  const days = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  if (idx === 0) return "Сегодня";
  if (idx === 1) return "Завтра";
  return `${days[d.getDay()]}, ${d.getDate()} ${d.toLocaleString("ru", { month: "short" })}`;
};

const aqiLabel = (aqi?: number | null) => {
  if (aqi == null) return "нет данных";
  if (aqi <= 20) return "отлично";
  if (aqi <= 40) return "хорошо";
  if (aqi <= 60) return "умеренно";
  if (aqi <= 80) return "средне";
  if (aqi <= 100) return "плохо";
  return "очень плохо";
};

const WeatherTab: React.FC = () => {
  const { hourly, daily, loading, error } = useOpenMeteo(LAT, LON, 48, 7);
  const air = useOpenMeteoAirQuality(LAT, LON);

  const now = useMemo(() => {
    if (Array.isArray(hourly) && hourly.length) {
      type Pt = {
        time?: string; iso?: string; datetime?: string;
        tC?: number | null; apparentTC?: number | null;
        windMs?: number | null; windDirDeg?: number | null;
        rh?: number | null; pressureHpa?: number | null;
        pressureMslHpa?: number | null; visibilityM?: number | null;
        uvIndex?: number | null;
      };
      const getMs = (p: Pt) => {
        const s = p.time || p.iso || p.datetime;
        const d = s ? new Date(s) : null;
        return d && isFinite(d.getTime()) ? d.getTime() : Number.POSITIVE_INFINITY;
      };
      const idx = hourly.reduce<{ i: number; diff: number }>(
        (acc, p: any, i: number) => {
          const diff = Math.abs(getMs(p) - Date.now());
          return diff < acc.diff ? { i, diff } : acc;
        },
        { i: 0, diff: Number.POSITIVE_INFINITY }
      ).i;

      const p = hourly[idx] as Pt;
      const windMs = p.windMs == null ? 0 : +Number(p.windMs).toFixed(1);
      const windDirDeg = p.windDirDeg == null ? null : Number(p.windDirDeg);
      const humidity = p.rh == null ? 0 : Math.round(Number(p.rh));
      const pressureHpa = p.pressureHpa ?? p.pressureMslHpa ?? null;
      const pressureMm = pressureHpa == null ? 0 : Math.round(hpaToMm(Number(pressureHpa))!);
      const visibility = p.visibilityM == null ? 0 : Math.round(Number(p.visibilityM));
      const tempC = p.tC == null ? 0 : Math.round(Number(p.tC));
      const feelsC = p.apparentTC == null ? null : Math.round(Number(p.apparentTC));
      const uvIndex = p.uvIndex == null ? 0 : +Number(p.uvIndex).toFixed(1);

      return { windMs, windDirDeg, humidity, pressureMm, visibility, tempC, feelsC, uvIndex };
    }

    return { windMs: 0, windDirDeg: null, humidity: 0, pressureMm: 0, visibility: 0, tempC: 0, feelsC: null, uvIndex: 0 };
  }, [hourly]);

  const rise = daily?.[0]?.sunrise ?? null;
  const set = daily?.[0]?.sunset ?? null;

  const visibilityNum = now.visibility >= 5000 ? +(now.visibility / 1000).toFixed(1) : now.visibility;
  const visibilityUnit = now.visibility >= 5000 ? " км" : " м";

  const next12Hours = useMemo(() => {
    const currentHourTs = Date.now();
    return (hourly || [])
      .filter((point) => new Date(point.time).getTime() >= currentHourTs)
      .slice(0, 12);
  }, [hourly]);

  const rainMax = useMemo(() => {
    return next12Hours.reduce((max, item) => Math.max(max, item.pop ?? 0), 0);
  }, [next12Hours]);

  const rainTotal = useMemo(() => {
    return +next12Hours.reduce((sum, item) => sum + (item.precipMm ?? 0), 0).toFixed(1);
  }, [next12Hours]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
      <div className="w-full mt-1 mb-4 shrink-0">
        {loading && (
          <div className="flex justify-center items-center w-full h-32">Загрузка прогноза…</div>
        )}
        {error && !loading && (
          <div className="flex justify-center items-center w-full h-32 text-red-400">
            Не удалось получить данные погоды
          </div>
        )}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3 w-full">
            {(daily ?? []).slice(0, 7).map((d: any, idx: number) => {
              const icon = `/images/${iconByWmo(d.wcode)}`;
              const tMax = d.tMaxC == null ? 0 : Math.round(d.tMaxC);
              const tMin = d.tMinC == null ? 0 : Math.round(d.tMinC);
              return (
                <SmallCard
                  key={d.date}
                  dayTitle={getDayTitle(d.date, idx)}
                  img={icon}
                  max={tMax}
                  min={tMin}
                  temp="C"
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
        <div className="grid grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
          <div className="col-span-12 xl:col-span-3 grid grid-cols-1 gap-4 auto-rows-[1fr]">
            <LargeCard className="h-full" title="Ощущается как" num={(now.feelsC ?? now.tempC ?? 0)} desc="°C" />
            <div className="h-full">
              {rise || set ? (
                <SunProgressCard sunrise={rise} sunset={set} />
              ) : (
                <div className="bg-[#22243c] rounded-xl p-5 text-gray-350 h-full flex items-center justify-center">
                  Данные о восходе/закате недоступны
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 xl:col-span-5 grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-[1fr]">
            <LargeCard className="h-full" title="Ветер" num={now.windMs ?? 0} desc="м/с">
              <div className="flex justify-between space-x-5 items-center">
                <div className="bg-gray-500 rounded-full w-[30px] h-[30px] flex justify-center items-center">
                  <i className="fas fa-location-arrow" />
                </div>
                <p className="text-gray-150 text-sm">{toCardinalRu(now.windDirDeg) || ""}</p>
              </div>
            </LargeCard>

            <LargeCard className="h-full" title="Влажность" num={now.humidity ?? 0} desc="%">
              <div className="self-stretch text-gray-250 text-xs space-y-1">
                <div className="flex justify-between space-x-5 items-center px-1">
                  <p>0</p><p>50</p><p>100</p>
                </div>
                <div className="w-full h-2 bg-gray-150 rounded-full overflow-hidden">
                  <div className="bg-[#FFEC65] h-2" style={{ width: `${now.humidity ?? 0}%` }} />
                </div>
                <p className="text-right">%</p>
              </div>
            </LargeCard>

            <LargeCard className="h-full" title="Видимость" num={visibilityNum ?? 0} desc={visibilityUnit} />
            <LargeCard className="h-full" title="Давление" num={now.pressureMm ?? 0} desc=" мм" />
          </div>

          <div className="col-span-12 xl:col-span-4 grid grid-cols-1 gap-4 auto-rows-[1fr]">
            <div className="bg-[#22243c] rounded-xl py-5 px-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-gray-250 text-sm">Осадки ближайшие 12 часов</div>
                  <div className="text-gray-400 text-xs mt-1">Новый погодный блок</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-150">{rainMax}%</div>
                  <div className="text-xs text-gray-400">макс. вероятность</div>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {next12Hours.slice(0, 6).map((point) => (
                  <div key={point.time} className="rounded-lg bg-[#1b1d31] p-2 text-center">
                    <div className="text-[11px] text-gray-400">
                      {new Date(point.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-150">{point.pop ?? 0}%</div>
                    <div className="text-[11px] text-gray-400 mt-1">{(point.precipMm ?? 0).toFixed(1)} мм</div>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-4 text-sm text-gray-300">Суммарно за 12 часов: <span className="font-semibold">{rainTotal} мм</span></div>
            </div>

            <div className="bg-[#22243c] rounded-xl py-5 px-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-gray-250 text-sm">УФ и качество воздуха</div>
                  <div className="text-gray-400 text-xs mt-1">Новый погодный блок</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-150">{now.uvIndex}</div>
                  <div className="text-xs text-gray-400">УФ-индекс</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-[#1b1d31] p-3">
                  <div className="text-xs text-gray-400">AQI</div>
                  <div className="text-xl font-semibold text-gray-150 mt-2">{air.current?.europeanAqi ?? "—"}</div>
                  <div className="text-xs text-gray-300 mt-1">{aqiLabel(air.current?.europeanAqi)}</div>
                </div>
                <div className="rounded-lg bg-[#1b1d31] p-3">
                  <div className="text-xs text-gray-400">PM2.5</div>
                  <div className="text-xl font-semibold text-gray-150 mt-2">{air.current?.pm25 ?? "—"}</div>
                  <div className="text-xs text-gray-300 mt-1">мкг/м³</div>
                </div>
                <div className="rounded-lg bg-[#1b1d31] p-3">
                  <div className="text-xs text-gray-400">PM10</div>
                  <div className="text-xl font-semibold text-gray-150 mt-2">{air.current?.pm10 ?? "—"}</div>
                  <div className="text-xs text-gray-300 mt-1">мкг/м³</div>
                </div>
              </div>
              <div className="mt-auto pt-4 text-sm text-gray-300">
                {air.loading ? "Обновляю данные по воздуху…" : air.error ? "Данные по воздуху недоступны" : "Показатели полезны для прогулок и проветривания."}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 shrink-0">
        <div className="rounded-2xl border border-[#2a2b46] bg-[#22243c] px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                <path d="M9 18h6" />
                <path d="M10 22h4" />
              </svg>
            </span>
            <div className="text-base font-semibold text-gray-150">Освещение</div>
          </div>
          <div className="flex flex-wrap items-start justify-around gap-x-6 gap-y-3" style={{ zoom: 0.82 }}>
            <LampBulbPrihozhaya />
            <LampBulbHoll />
            <LampBulbKitchen />
            <LampBulbBath />
            <LampBulbGarderob />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherTab;
