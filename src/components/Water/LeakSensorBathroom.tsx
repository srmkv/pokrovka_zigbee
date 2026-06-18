import React, { useMemo, useState } from "react";
import LeakDropSvg from "./LeakDropSvg";
import ResetConfirmModal from "./ResetConfirmModal";
import { refreshLeakSensors, useLeakSensorsState } from "../../hooks/useLeakSensorsState";

const LeakSensorBathroom: React.FC = () => {
  const { leakSensor = "unknown", lastLeak } = useLeakSensorsState();
  const [resetPending, setResetPending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const API_BASE = useMemo(
    () => (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, ""),
    []
  );

  let color = "#7A5A3A";
  let ringClass = "bg-blue-400 animate-pulse";
  if (leakSensor === "leak") {
    color = "#e53e3e";
    ringClass = "bg-red-500 animate-ping";
  }
  if (leakSensor === "unknown") {
    color = "#9ca3af";
    ringClass = "bg-gray-400 animate-pulse";
  }

  async function handleReset() {
    setResetPending(true);
    setResetMessage(null);
    try {
      const resp = await fetch(`${API_BASE}/bathroom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dry" }),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      setResetMessage("Тревога снята");
      setConfirmOpen(false);
      refreshLeakSensors();
      setTimeout(() => refreshLeakSensors(), 800);
    } catch {
      setResetMessage("Не удалось снять тревогу");
    } finally {
      setResetPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center py-7 px-4">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <span className={`absolute w-full h-full rounded-full ${ringClass} opacity-30`} style={{ zIndex: 0 }} />
          <div className="theme-adaptive-icon z-10 flex items-center justify-center w-full h-full">
            <LeakDropSvg color={color} width={90} height={120} />
          </div>
        </div>

        <div className="text-center mt-6">
          {leakSensor === "dry" && (
            <>
              <span className="text-2xl font-semibold text-blue-500">Всё сухо</span>
              <div className="text-sm text-gray-400 mt-1">Утечек воды не обнаружено</div>
            </>
          )}
          {leakSensor === "leak" && (
            <>
              <span className="text-2xl font-bold text-red-600 animate-bounce">ПРОТЕЧКА!</span>
              <div className="text-sm text-red-400 mt-1">
                Обнаружена вода
                {lastLeak && <> • {formatLeakTime(lastLeak)}</>}
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={resetPending}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Сбросить датчик
              </button>
            </>
          )}
          {leakSensor === "unknown" && (
            <>
              <span className="text-2xl font-semibold text-gray-500">Нет данных</span>
              <div className="text-sm text-gray-400 mt-1">Проверьте подключение</div>
            </>
          )}

          {resetMessage && <div className="mt-3 text-xs text-gray-300">{resetMessage}</div>}
        </div>
      </div>

      <ResetConfirmModal
        open={confirmOpen}
        busy={resetPending}
        title="Сбросить датчик в ванной?"
        description="После подтверждения тревога у датчика ванной будет переведена в нормальное состояние."
        confirmLabel="Сбросить"
        onConfirm={handleReset}
        onCancel={() => !resetPending && setConfirmOpen(false)}
      />
    </>
  );
};

function formatLeakTime(lastLeak: string) {
  if (!lastLeak) return "";
  const start = new Date(lastLeak);
  const delta = Math.floor((Date.now() - start.getTime()) / 1000);
  if (delta < 60) return `(${delta} сек назад)`;
  return `(${Math.floor(delta / 60)} мин назад)`;
}

export default LeakSensorBathroom;
