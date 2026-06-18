// src/components/Clock.tsx
import React from "react";
import { useNow } from "../../hooks/useNow";

type Props = {
  fontSize?: number;
  showSeconds?: boolean;
  locale?: string;
  timeZone?: string; // если нужно принудительно задать TZ
};

const Clock: React.FC<Props> = ({
  fontSize = 30,
  showSeconds = false,
  locale = "ru-RU",
  timeZone,
}) => {
  const now = useNow(1000); // обновляем каждую секунду

  const time = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZone,
  });

  return (
    <text
      x="50%"
      y="50%"
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize={fontSize}
      fontWeight={700}
      fill="#fff"
      dy=".35em"
      style={{ pointerEvents: "none" }}
      aria-label={`Текущее время ${time}`}
    >
      {time}
    </text>
  );
};

export default Clock;
