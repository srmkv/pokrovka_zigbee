// src/hooks/useBlindsPosition.ts
import { useState, useEffect } from "react";

type Zone = "kitchen" | "room" | "holl";

export function useBlindsPosition(zone: Zone) {
  const [position, setPositionState] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Используем относительный путь — без HOST/PORT
  // REACT_APP_API_BASE можно оставить в .env как /api
  const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");
  const apiUrl = `${API_BASE}/blinds/${zone}`;

  useEffect(() => {
    let ignore = false;
    let timer: number | undefined;

    const fetchState = () => {
      fetch(apiUrl, { method: "GET" })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then((data) => {
          if (!ignore && typeof data.position === "number") {
            setPositionState(data.position);
          }
        })
        .catch(() => {
          /* можно залогировать */
        })
        .finally(() => {
          // опрос каждые 4 секунды
          timer = window.setTimeout(fetchState, 4000);
        });
    };

    fetchState();
    return () => {
      ignore = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [apiUrl]);

  const setBlinds = async (next: number) => {
    setLoading(true);
    try {
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: next }),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      const json = await resp.json();
      if (typeof json.position === "number") setPositionState(json.position);
    } catch {
      /* показать тост/уведомление при желании */
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  };

  return { position, setBlinds, loading };
}
