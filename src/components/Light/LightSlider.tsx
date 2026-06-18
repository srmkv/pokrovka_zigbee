import React, { useEffect, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

// Универсальный BASE — только префикс, без host/port
const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;

// Формирует rgba строку для тени по текущим r/g/b
function rgba(r: number, g: number, b: number, alpha: number) {
  return `rgba(${r},${g},${b},${alpha})`;
}

interface LightSliderProps {
  initialBrightness?: number;
  initialR?: number;
  initialG?: number;
  initialB?: number;
}

const LightSlider: React.FC<LightSliderProps> = ({
  initialBrightness = 50,
  initialR = 255,
  initialG = 255,
  initialB = 255,
}) => {
  const { showAlert } = useUiPopup();
  const [brightness, setBrightness] = useState(initialBrightness);
  const [r, setR] = useState(initialR);
  const [g, setG] = useState(initialG);
  const [b, setB] = useState(initialB);
  const [loading, setLoading] = useState(false);

  // (необязательно) — подтянуть стартовую яркость с бэка
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(apiUrl("/light/slider"));
        if (!resp.ok) return;
        const data = await resp.json();
        if (typeof data.brightness === "number") setBrightness(data.brightness);
      } catch {}
    })();
  }, []);

  const sendLight = async () => {
    setLoading(true);
    try {
      // Отправляем оба запроса параллельно
      const [r1, r2] = await Promise.all([
        fetch(apiUrl("/light/slider"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brightness }),
        }),
        fetch(apiUrl("/light/color"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ r, g, b }),
        }),
      ]);

      if (!r1.ok || !r2.ok) {
        let msg = "ошибка применения параметров";
        try {
          const j1 = !r1.ok ? await r1.json() : null;
          const j2 = !r2.ok ? await r2.json() : null;
          msg = (j1?.error || j2?.error) ?? msg;
        } catch {}
        showAlert({ title: "Не удалось изменить подсветку", message: msg, tone: "error" });
      }
    } catch {
      showAlert({ title: "Ошибка отправки команды", message: "Не удалось отправить команду на изменение подсветки.", tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  const color = `rgb(${r},${g},${b})`;
  const shadowAlpha = 0.2 + 0.6 * (brightness / 100);
  const shadowRadius = 20 + 30 * (brightness / 100);

  return (
    <div className="bg-[#22243c] rounded-xl p-5 h-full flex flex-col items-center justify-between">
      <h4 className="text-base font-semibold mb-3">Регулятор цвета ленты</h4>

      <div className="flex flex-col items-center mb-3 w-full">
        <div
          style={{
            filter: `drop-shadow(0 0 ${shadowRadius}px ${rgba(r, g, b, shadowAlpha)})`,
            transition: "filter 0.3s",
            display: "inline-block",
          }}
        >
          <svg width={52} height={52} aria-label="preview color">
            <circle cx={26} cy={26} r={22} fill={color} stroke="#22243c" strokeWidth="4" />
          </svg>
        </div>
        <div className="text-sm text-gray-150 mb-1 mt-2">
          Цвет: <b>rgb({r},{g},{b})</b>
        </div>
      </div>

      {/* Ползунки для R/G/B */}
      <div className="w-full mb-3">
        <label className="block text-xs mb-1 text-red-300">Красный: <b>{r}</b></label>
        <input type="range" min={0} max={255} value={r}
          onChange={(e) => setR(Number(e.target.value))}
          className="w-full accent-red-500 mb-2" />
        <label className="block text-xs mb-1 text-green-300">Зелёный: <b>{g}</b></label>
        <input type="range" min={0} max={255} value={g}
          onChange={(e) => setG(Number(e.target.value))}
          className="w-full accent-green-500 mb-2" />
        <label className="block text-xs mb-1 text-blue-300">Синий: <b>{b}</b></label>
        <input type="range" min={0} max={255} value={b}
          onChange={(e) => setB(Number(e.target.value))}
          className="w-full accent-blue-500" />
      </div>

      {/* Яркость */}
      <div className="w-full mb-3 flex flex-col items-center">
        <label className="block text-sm mb-1">Яркость: <b>{brightness}%</b></label>
        <input type="range" min={0} max={100} value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-full accent-yellow-300" />
      </div>

      <button
        className={`py-2.5 px-4 rounded-lg font-medium text-gray-150 text-base transition-all duration-150 border-2
                    bg-[#1a1b2d] border-[#232445] hover:bg-blue-900 hover:border-blue-500
                    disabled:opacity-60 mt-2`}
        disabled={loading}
        onClick={sendLight}
      >
        {loading ? "..." : "Установить параметры"}
      </button>
    </div>
  );
};

export default LightSlider;
