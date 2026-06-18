import React, { useState, useEffect } from "react";
import { useBlindsPosition } from "../../hooks/useBlindsPosition";

const windowHeight = 120;
const windowWidth = 180;
const blindClosedHeight = windowHeight - 6;
const blindOpenHeight = 18;
const currentTop = 3;

// Функция вычисления высоты жалюзи по проценту
function calcHeight(percent: number) {
  // percent: 0 (open) ... 100 (closed)
  return blindOpenHeight + (blindClosedHeight - blindOpenHeight) * (percent / 100);
}

const BlindsControlKitchen: React.FC = () => {
  // позиция — число 0…100
  const { position, setBlinds, loading } = useBlindsPosition("kitchen");
  const [sliderValue, setSliderValue] = useState<number>(position);

  // Синхронизация sliderValue при изменении position с сервера
  useEffect(() => {
    setSliderValue(position);
  }, [position]);

  const handleApply = () => {
    setBlinds(sliderValue);
  };

  const handleUp = () => {
    setSliderValue(0);
    setBlinds(0);
  };
  const handleDown = () => {
    setSliderValue(100);
    setBlinds(100);
  };

  const currentHeight = calcHeight(sliderValue);

  return (
    <div className="bg-[#22243c] rounded-xl p-6 flex flex-col items-center w-full">
      <h4 className="text-lg font-semibold mb-3">Жалюзи Кухня</h4>
      <div
        className="relative flex justify-center items-center mb-4"
        style={{ width: windowWidth, height: windowHeight }}
      >
        {/* Окно */}
        <div
          style={{
            position: "absolute",
            width: "98%",
            height: "98%",
            background: "linear-gradient(180deg, #e0ecfa 60%, #b6e4ff 100%)",
            borderRadius: 16,
            boxShadow: "0 6px 18px #0007, 0 0 0 4px #b3b6c3 inset",
            zIndex: 1,
          }}
        />
        {/* Жалюзи */}
        <div
          style={{
            position: "absolute",
            top: currentTop,
            left: 0,
            width: "100%",
            height: currentHeight,
            borderRadius: sliderValue <= 2 ? "16px 16px 8px 8px" : "16px",
            background:
              "repeating-linear-gradient(180deg, #323540 0px, #44475a 8px, #323540 16px)",
            boxShadow: sliderValue > 95
              ? "0 8px 18px #131521"
              : "0 2px 8px #282a36",
            border: "1px solid #2c2e38",
            transition: "height 0.5s cubic-bezier(.8,1.7,.5,1), border-radius 0.4s",
            zIndex: 2,
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {/* Ручка */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 4,
              width: 42,
              height: 7,
              borderRadius: 8,
              background: "linear-gradient(90deg, #595c6c, #868998 70%)",
              boxShadow: "0 1px 6px #3b3d4f",
              opacity: 0.85,
            }}
          />
        </div>
        {/* Рама */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            border: "6px solid #23243a",
            borderRadius: 16,
            pointerEvents: "none",
            boxSizing: "border-box",
            zIndex: 10,
          }}
        />
      </div>

      {/* Поднять / Опустить — одна строка */}
      <div className="flex w-full justify-between items-center gap-3 mb-2">
        <button
          className="px-3 py-2 rounded bg-green-700 hover:bg-green-900 text-gray-150 shadow disabled:opacity-50 text-xs flex-1"
          style={{ minWidth: 80 }}
          disabled={loading || sliderValue === 0}
          onClick={handleUp}
        >
          Поднять
        </button>
        <button
          className="px-3 py-2 rounded bg-yellow-700 hover:bg-yellow-900 text-gray-150 shadow disabled:opacity-50 text-xs flex-1"
          style={{ minWidth: 80 }}
          disabled={loading || sliderValue === 100}
          onClick={handleDown}
        >
          Опустить
        </button>
      </div>

      {/* Ползунок + "Применить" — одна строка */}
      <div className="flex w-full items-center gap-2 mb-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderValue}
          disabled={loading}
          onChange={e => setSliderValue(Number(e.target.value))}
          className="w-full accent-yellow-500"
        />
        <button
          className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-900 text-gray-150 shadow disabled:opacity-50 ml-2"
          disabled={loading || sliderValue === position}
          onClick={handleApply}
        >
          {loading ? "..." : "Применить"}
        </button>
      </div>
      <div className="text-xs text-gray-350 mb-2">
        Положение: {sliderValue}%
      </div>
      <span className="text-gray-350 text-xs mt-2">
        Управляйте положением жалюзи с помощью кнопок или ползунка
      </span>
    </div>
  );
};

export default BlindsControlKitchen;
