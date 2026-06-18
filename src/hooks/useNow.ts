import { useEffect, useState } from "react";

/**
 * Возвращает объект с текущими датой и временем, обновляется каждую секунду.
 */
export function useNow(updateInterval = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, updateInterval);

    return () => clearInterval(timer);
  }, [updateInterval]);

  return now;
}
