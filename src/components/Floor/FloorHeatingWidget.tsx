import React, { useState } from "react";
import { useFloorHeating } from "../../hooks/useFloorHeating";

const MIN_TEMP = 15;
const MAX_TEMP = 35;

function getTempGradient(temp: number) {
  // ... (градиент из твоей версии, не изменился)
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const t = clamp((temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP), 0, 1);

  if (t < 0.5) {
    const percent = t / 0.5;
    const r = Math.round(0x6c + (0xff - 0x6c) * percent);
    const g = Math.round(0xb6 + (0xe0 - 0xb6) * percent);
    const b = Math.round(0xec + (0x82 - 0xec) * percent);
    return `linear-gradient(90deg, #6cb6ec, rgb(${r},${g},${b}))`;
  } else {
    const percent = (t - 0.5) / 0.5;
    const r = Math.round(0xff + (0xfa - 0xff) * percent);
    const g = Math.round(0xe0 + (0x5a - 0xe0) * percent);
    const b = Math.round(0x82 + (0x3d - 0x82) * percent);
    return `linear-gradient(90deg, #ffe082, rgb(${r},${g},${b}))`;
  }
}

const FloorHeatingWidget: React.FC = () => {
  const { on, temp, currentTemp, loading, setTemp, setOn } = useFloorHeating("living");
  const [draft, setDraft] = useState<number>(temp);

  // Обновляем draft при изменении temp с сервера
  React.useEffect(() => {
    setDraft(temp);
  }, [temp]);

  const changed = draft !== temp;

  return (
    <div className="bg-[#22243c] rounded-xl p-6 flex flex-col items-center mb-8 w-full">
      <h4 className="text-lg font-semibold mb-3">Тёплый пол прихожая</h4>
      <div className="flex items-center gap-3 mb-3 w-full">
        <div
          className="rounded-2xl flex items-center justify-center shadow-lg transition-all"
          style={{
            width: 110,
            height: 54,
            background: getTempGradient(currentTemp),
            boxShadow:
              "0 4px 28px 0 rgba(250,90,61,0.20), 0 0 0 1.5px #6cb6ec33 inset",
            border: "2.5px solid #23243c",
          }}
        >
          <span className="text-3xl font-bold text-white drop-shadow">
            {currentTemp.toFixed(1)}°
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-gray-350">Текущая</span>
          <span className="text-xs text-gray-400">Температура пола</span>
        </div>
      </div>

      <div className="w-full flex flex-col items-center mb-3">
        <input
          type="range"
          min={MIN_TEMP}
          max={MAX_TEMP}
          step={0.5}
          value={draft}
          disabled={loading}
          onChange={e => setDraft(Number(e.target.value))}
          className="w-full accent-orange-400"
          style={{ accentColor: "#f7ad46" }}
        />
        <div className="flex justify-between w-full text-xs text-gray-350 mt-1">
          <span>{MIN_TEMP}°</span>
          <span>
            Заданная:{" "}
            <span className="font-semibold text-orange-200">
              {draft}°
            </span>
          </span>
          <span>{MAX_TEMP}°</span>
        </div>
        {changed && (
          <button
            className={`mt-4 px-6 py-2 rounded-lg text-white font-medium transition-all
              bg-gradient-to-r from-orange-400 to-amber-600 shadow-lg hover:scale-105 active:scale-95`}
            style={{ minWidth: 140 }}
            onClick={() => setTemp(draft)}
            disabled={loading}
          >
            {loading ? "Применяем..." : "Применить"}
          </button>
        )}
      </div>

      <button
        className={`mt-2 px-6 py-2 rounded-lg text-white font-medium transition-all
          ${on
            ? "bg-gradient-to-r from-orange-400 to-amber-600 shadow-lg"
            : "bg-gray-600"
          }`}
        onClick={() => setOn(!on)}
        disabled={loading}
      >
        {on ? "Выключить подогрев" : "Включить подогрев"}
      </button>
    </div>
  );
};

export default FloorHeatingWidget;
