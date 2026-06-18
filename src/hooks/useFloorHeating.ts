import { useState, useEffect } from "react";

// Тип для зоны: living (гостиная/прихожая) или bath (ванная)
type Zone = "living" | "bath";

interface FloorState {
  on: boolean;
  temp: number;
  currentTemp: number;
  loading: boolean;
  setTemp: (t: number) => void;
  setOn: (value: boolean) => void;
  reload: () => void;
}

export function useFloorHeating(zone: Zone): FloorState {
  const [on, setOnLocal] = useState(false);
  const [temp, setTempLocal] = useState(24);
  const [currentTemp, setCurrentTemp] = useState(24);
  const [loading, setLoading] = useState(false);

  // Берём только BASE, без хоста/порта
  const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");
  const apiUrl = `${API_BASE}/floor/${zone}`;

  // Получаем состояние с сервера
  const reload = () => {
    setLoading(true);
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        setOnLocal(data.on ?? false);
        setTempLocal(data.temp ?? 24);
        setCurrentTemp(data.currentTemp ?? data.temp ?? 24);
      })
      .catch(() => {
        /* можно показать ошибку */
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  // Установка температуры
  const setTemp = (newTemp: number) => {
    setLoading(true);
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on, temp: newTemp }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        setTempLocal(data.temp ?? newTemp);
        setCurrentTemp(data.currentTemp ?? data.temp ?? newTemp);
      })
      .catch(() => {
        /* ошибка */
      })
      .finally(() => setLoading(false));
  };

  // Вкл/выкл
  const setOn = (value: boolean) => {
    setLoading(true);
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: value, temp }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        setOnLocal(data.on ?? value);
      })
      .catch(() => {
        /* ошибка */
      })
      .finally(() => setLoading(false));
  };

  return { on, temp, currentTemp, loading, setTemp, setOn, reload };
}
