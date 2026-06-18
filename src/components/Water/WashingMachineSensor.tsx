import React, { useMemo, useState } from "react";
import WashingMachineSvg from "./WashingMachineSvg";
import ResetConfirmModal from "./ResetConfirmModal";
import { refreshLeakSensors, useLeakSensorsState } from "../../hooks/useLeakSensorsState";

const WashingMachineSensor: React.FC = () => {
  const { washingMachineSensor = "unknown", lastLeakWashing } = useLeakSensorsState();
  const [resetPending, setResetPending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const API_BASE = useMemo(
    () => (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, ""),
    []
  );

  let color = "#7A5A3A";
  let ringClass = "bg-blue-400 animate-pulse";
  if (washingMachineSensor === "leak") {
    color = "#e53e3e";
    ringClass = "bg-red-500 animate-ping";
  }
  if (washingMachineSensor === "unknown") {
    color = "#9ca3af";
    ringClass = "bg-gray-400 animate-pulse";
  }

  async function handleResetFromServer() {
    setResetPending(true);
    setResetMessage(null);
    try {
      const resp = await fetch(`${API_BASE}/washing-machine/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) throw new Error(String(resp.status));
      setResetMessage("Тревога снята на сервере");
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
          <span
            className={`absolute w-full h-full rounded-full ${ringClass} opacity-30`}
            style={{ zIndex: 0 }}
          />
          <div className="theme-adaptive-icon z-10 flex items-center justify-center w-full h-full">
            <WashingMachineSvg color={color} width={100} height={100} />
          </div>
        </div>

        <div className="text-center mt-6">
          {washingMachineSensor === "dry" && (
            <>
              <span className="text-2xl font-semibold text-blue-500">Всё сухо</span>
              <div className="text-sm text-gray-400 mt-1">Утечек воды не обнаружено</div>
            </>
          )}
          {washingMachineSensor === "leak" && (
            <>
              <span className="text-2xl font-bold text-red-600 animate-bounce">ПРОТЕЧКА!</span>
              <div className="text-sm text-red-400 mt-1">
                Обнаружена вода
                {lastLeakWashing && <> • {formatLeakTime(lastLeakWashing)}</>}
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
          {washingMachineSensor === "unknown" && (
            <>
              <span className="text-2xl font-semibold text-gray-500">Нет данных</span>
              <div className="text-sm text-gray-400 mt-1">Проверьте подключение</div>
            </>
          )}

          {resetMessage && (
            <div className="mt-3 text-xs text-gray-300">{resetMessage}</div>
          )}
        </div>
      </div>

      <ResetConfirmModal
        open={confirmOpen}
        busy={resetPending}
        title="Сбросить датчик у стиральной машины?"
        description="После подтверждения сервер отправит команду на сброс тревоги датчику стиральной машины."
        confirmLabel="Сбросить"
        onConfirm={handleResetFromServer}
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

export default WashingMachineSensor;
