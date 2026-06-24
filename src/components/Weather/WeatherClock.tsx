import React, { useEffect, useState } from "react";
import { iconByWmo } from "./WeatherIconMap"; // новый мэппинг WMO → имя файла
import Clock from "./Clock";

// теперь condition не нужен — используем wcode
type HourData = {
  hour: string;           // "00".."23"
  temp: number;           // °C
  wcode: number | null;   // WMO weather code
};

interface WeatherClockProps {
  hours: HourData[];      // 24 часа, начиная с текущего
}

const CLOCK_SIZE = 545;
const CLOCK_RADIUS = 240;
const CENTER = CLOCK_SIZE / 2;

// Доступная ширина для часов (минус поля по краям экрана)
const VIEWPORT_MARGIN = 24;

const WeatherClock: React.FC<WeatherClockProps> = ({ hours }) => {
  // Масштаб часов под ширину экрана: на десктопе 1, на телефоне < 1
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateScale = () => {
      const available = Math.min(CLOCK_SIZE, window.innerWidth - VIEWPORT_MARGIN);
      setScale(Math.min(1, available / CLOCK_SIZE));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  if (!hours || !hours.length) {
    return (
      <div className="flex items-center justify-center h-72 text-lg text-gray-350">
        Нет данных о погоде
      </div>
    );
  }

  const currentHour = new Date().getHours();

  return (
    <div style={{ width: CLOCK_SIZE * scale, height: CLOCK_SIZE * scale, position: "relative" }}>
      <div
        style={{
          width: CLOCK_SIZE,
          height: CLOCK_SIZE,
          position: "relative",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <svg width={CLOCK_SIZE} height={CLOCK_SIZE}>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={CLOCK_RADIUS + 30}
          fill="#1a1b2d"
          stroke="#232445"
          strokeWidth={4}
        />
        {hours.map((h, idx) => {
          const angle = ((idx - 6) / 24) * 2 * Math.PI;
          const x = CENTER + Math.cos(angle) * (CLOCK_RADIUS - 42);
          const y = CENTER + Math.sin(angle) * (CLOCK_RADIUS - 42);

          const tx = CENTER + Math.cos(angle) * (CLOCK_RADIUS - 5);
          const ty = CENTER + Math.sin(angle) * (CLOCK_RADIUS - 5);

          const timex = CENTER + Math.cos(angle) * (CLOCK_RADIUS - 75);
          const timey = CENTER + Math.sin(angle) * (CLOCK_RADIUS - 75);

          const isCurrent = Number(h.hour) === currentHour;

          // теперь берём иконку по WMO
          const iconSrc = `/images/${iconByWmo(h.wcode)}`;

          return (
            <g key={idx}>
              {/* Иконка — крупнее, если активная */}
              <foreignObject
                x={x - (isCurrent ? 32 : 22)}
                y={y - (isCurrent ? 32 : 22)}
                width={isCurrent ? 64 : 44}
                height={isCurrent ? 64 : 44}
              >
                <div
                  style={{
                    opacity: isCurrent ? 1 : 0.7,
                    width: isCurrent ? 60 : 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.25s",
                  }}
                >
                  <img
                    src={iconSrc}
                    alt="weather"
                    style={{
                      width: isCurrent ? 60 : 40,
                      transition: "all 0.2s",
                    }}
                  />
                </div>
              </foreignObject>

              {/* Температура */}
              {/* Температура */}
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="middle"
                dy={isCurrent ? ".35em" : "0"}
                fontSize={isCurrent ? 30 : 18}
                fontWeight={isCurrent ? 900 : 600}
                fill={isCurrent ? "#fff" : "#ffd"}
                style={{
                  pointerEvents: "none",
                  userSelect: "none",
                  filter: isCurrent ? "drop-shadow(0 0 4px #4fc3f7)" : undefined,
                  transition: "all 0.2s",
                }}
                aria-label={`Температура ${h.temp}°`}
              >
                {h.temp > 0 ? `+${h.temp}` : h.temp}
              </text>

              {/* Время часа */}
              <text
                x={timex}
                y={timey}
                textAnchor="middle"
                dominantBaseline="middle"
                dy=".35em"
                fontSize={isCurrent ? 30 : 18}
                fontWeight={isCurrent ? 700 : 500}
                fill={isCurrent ? "#4fc3f7" : "#888"}
                style={{
                  pointerEvents: "none",
                  userSelect: "none",
                  letterSpacing: isCurrent ? 2 : 0,
                  textShadow: isCurrent ? "0 0 8px #1a223c" : undefined,
                  transition: "all 0.2s",
                }}
                aria-label={`Час ${h.hour}`}
              >
                {h.hour}
              </text>

            </g>
          );
        })}

        {/* Центр — актуальное время */}
        <circle cx={CENTER} cy={CENTER} r={80} fill="#232445" />
        <g>
          <Clock fontSize={38} />
        </g>
        </svg>
      </div>
    </div>
  );
};

export default WeatherClock;
