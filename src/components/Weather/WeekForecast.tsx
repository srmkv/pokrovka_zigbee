// WeekForecast.tsx
import React, { useMemo } from "react";
import { useOpenMeteo } from "../../hooks/useOpenMeteo";      // проверь путь
import { iconByWmo } from "./WeatherIconMap";                 // проверь путь
import { conditionRuByWmo } from "./conditionMap";            // проверь путь

interface WeekForecastProps {
  lat: number;
  lon: number;
  days?: number; // по умолчанию 7
}

const WeekForecast: React.FC<WeekForecastProps> = React.memo(({ lat, lon, days = 7 }) => {
  // hours=48 для часовых данных (если твоему хуку это нужно), days — сколько сутокDaily
  const { daily, loading, error } = useOpenMeteo(lat, lon, 48, days);

  const items = useMemo(() => (daily ?? []).slice(0, days), [daily, days]);

  const titles = useMemo(
    () => items.map((d, i) => getDayOfWeek(d.date, i)),
    [items]
  );

  if (loading) {
    return (
      <div className="bg-darkblue rounded-xl p-5 mt-8">
        <h3 className="text-xl font-bold text-gray-150 mb-3">Прогноз на неделю</h3>
        <div className="text-gray-350">Загрузка прогноза…</div>
      </div>
    );
  }

  if (error || !items.length) {
    return (
      <div className="bg-darkblue rounded-xl p-5 mt-8">
        <h3 className="text-xl font-bold text-gray-150 mb-3">Прогноз на неделю</h3>
        <div className="text-red-400">Не удалось получить данные погоды</div>
      </div>
    );
  }

  return (
    <div className="bg-darkblue rounded-xl p-5 mt-8">
      <h3 className="text-xl font-bold text-gray-150 mb-3">Прогноз на неделю</h3>
      <div className="flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
        {items.map((d, i) => {
          const file = iconByWmo(d.wcode);
          const iconSrc = `/images/${file || "LightCloud.png"}`;
          const title = titles[i];
          const tMax = d.tMaxC == null ? "—" : Math.round(d.tMaxC);
          const tMin = d.tMinC == null ? "—" : Math.round(d.tMinC);
          const cond = conditionRuByWmo(d.wcode);

          return (
            <div
              key={`${d.date}-${d.wcode ?? "x"}`}
              className="flex-shrink-0 flex flex-col items-center bg-[#22243c] rounded-lg py-4 px-4 min-w-[100px] max-w-[120px]"
              style={{ width: 110 }}
            >
              <span className="font-semibold text-gray-150">{title}</span>
              <img
                src={iconSrc}
                alt={cond}
                title={cond}
                className="max-h-10 my-2"
                loading="lazy"
                decoding="async"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/LightCloud.png"; }}
              />
              <span className="text-lg text-gray-150">
                {tMax}&deg; / {tMin}&deg;
              </span>
              <span className="text-xs text-gray-350">{cond}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default WeekForecast;

// --- utils ---

function getDayOfWeek(isoDate: string, idx: number) {
  if (idx === 0 && isToday(isoDate)) return "Сегодня";
  const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const d = new Date(`${isoDate}T00:00:00`);
  return days[d.getDay()];
}

function isToday(isoDate: string) {
  const now = new Date();
  const d = new Date(`${isoDate}T00:00:00`);
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}
