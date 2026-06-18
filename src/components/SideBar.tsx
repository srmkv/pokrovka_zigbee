// src/components/SideBar.tsx
import { useState } from "react";
import SearchLocation from "./SearchLocation";
import WeatherIcon from "./Weather/WeatherIcon";
import WeatherFactIndicators from "./Weather/WeatherFactIndicators";

// Open-Meteo
import { useOpenMeteo } from "../hooks/useOpenMeteo";
import { conditionRuByWmo } from "./Weather/conditionMap"; // проверь путь!

// координаты локации (Нижний Новгород)
const LAT = 56.3269;
const LON = 44.0075;

const SideBar = () => {
  const [isOpen, setIsOpen] = useState(false);

  // ВАЖНО: используем now из хука
  const { now, loading } = useOpenMeteo(LAT, LON, 48, 7);

  const temp = loading ? "--" : (now?.tempC ?? "--");
  const conditionRus = conditionRuByWmo(now?.wcode ?? null);

  const date = new Date();
  const dateString = date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div
      className="flex flex-col h-screen min-h-screen bg-darkblue w-full lg:w-1/3 p-7 lg:p-4 xl:p-7 space-y-8 overflow-x-hidden transition-all duration-300"
      style={{ minWidth: 320, maxWidth: 430 }}
    >
      {isOpen ? (
        <SearchLocation onClose={() => setIsOpen(false)} />
      ) : (
        <>
          <div className="relative -mx-24 flex justify-center items-center max-h-40 mb-2">
            <img
              src="/images/Cloud-background.png"
              alt="bg"
              className="opacity-10 absolute max-w-52 select-none pointer-events-none"
            />
            {/* WeatherIcon принимает { code, size } */}
            <WeatherIcon code={now?.wcode ?? null} size={144} />
          </div>

          {/* Индикаторы фактической погоды из Open-Meteо (компонент сам тянет данные по lat/lon) */}
          <WeatherFactIndicators lat={LAT} lon={LON} />

          <div className="flex flex-col items-center justify-between flex-grow pt-4 pb-3">
            <h1 className="text-gray-150 font-medium text-[110px]  leading-none transition-all duration-200">
              {temp}
              <span className="text-4xl md:text-5xl text-gray-250 align-top">&deg;C</span>
            </h1>

            {/* Если в хуке добавишь apparent_temperature → раскомментируй блок ниже */}
            {false && now && (now as any).feelsC != null && (
              <div className="text-gray-350 text-2xl mt-[-18px] mb-2 flex items-center gap-2">
                <span>Ощущается как</span>
                <span className="font-semibold ml-1">{(now as any).feelsC}&deg;C</span>
              </div>
            )}

            <h3 className="font-semibold text-2xl text-gray-250 mb-2">
              {loading ? "Загрузка..." : conditionRus}
            </h3>

            <div className="flex flex-col items-center text-center text-gray-350 text-lg space-y-2">
              <p>Сегодня &bull; {dateString}</p>
              <span className="addr">
                <i className="fas fa-map-marker-alt"></i>{" "}
                Б.Покровская д. 80, 1й подъезд, 7й этаж
              </span>
              <span className="addr">Почтовый индекс: 606-300</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SideBar;
