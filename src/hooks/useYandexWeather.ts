import { useEffect, useState, useRef } from "react";

const API_KEY = process.env.REACT_APP_YANDEX_KEY || "";
const DEFAULT_LAT = 56.325905;
const DEFAULT_LON = 44.005430;
const POLLING_INTERVAL = 5 * 60 * 1000; // 5 минут

export function useYandexWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ref чтобы не делать setState на размонтированный компонент
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: NodeJS.Timeout;

    const fetchWeather = () => {
      setLoading(true);
      fetch(
        `https://api.weather.yandex.ru/v2/forecast?lat=${lat}&lon=${lon}&lang=ru_RU`,
        {
          headers: { "X-Yandex-Weather-Key": API_KEY },
        }
      )
        .then((res) => res.json())
        .then((json) => {
          if (mounted.current) setWeather(json);
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    };

    fetchWeather(); // Первоначальная загрузка

    // Polling (автообновление)
    timer = setInterval(fetchWeather, POLLING_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [lat, lon]);

  return { weather, loading };
}
