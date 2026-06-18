import React, { useMemo, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";
import { refreshSensorsRegistry } from "../../hooks/useSensorsRegistry";
import { SensorItem, SensorStatus } from "../../types/sensors";
import DishwasherSvg from "./DishwasherSvg";
import LeakDropSvg from "./LeakDropSvg";
import WashingMachineSvg from "./WashingMachineSvg";

interface UniversalSensorCardProps {
  sensor: SensorItem;
  compact?: boolean;
}

const statusText: Record<SensorStatus, { title: string; subtitle: string }> = {
  dry: { title: "Всё сухо", subtitle: "Утечек воды не обнаружено" },
  leak: { title: "ПРОТЕЧКА!", subtitle: "Обнаружена вода" },
  unknown: { title: "Нет данных", subtitle: "Проверьте подключение" },
};

function formatRelative(value?: string | null) {
  if (!value) return "";
  const start = new Date(value);
  const delta = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (delta < 60) return `${delta} сек назад`;
  if (delta < 3600) return `${Math.floor(delta / 60)} мин назад`;
  return start.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatUntil(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const UniversalSensorCard: React.FC<UniversalSensorCardProps> = ({ sensor, compact = false }) => {
  const { confirm, showAlert } = useUiPopup();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const API_BASE = useMemo(() => (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, ""), []);

  const status = sensor.state?.status || "unknown";
  const isLeak = status === "leak";
  const maintenanceActive = !!sensor.state?.maintenanceActive;
  const color = isLeak ? "#b91c1c" : status === "unknown" ? "#8F8375" : "#7A5A3A";
  const ringClass = isLeak ? "bg-red-500 animate-ping" : status === "unknown" ? "bg-stone-400 animate-pulse" : "bg-amber-700 animate-pulse";
  const text = statusText[status];

  function endpointToUrl(endpoint: string) {
    return endpoint.startsWith("/api") ? `${API_BASE}${endpoint.slice(4)}` : endpoint;
  }

  async function resetSensor() {
    const ok = await confirm({
      title: `Сбросить датчик «${sensor.name}»?`,
      message: "После подтверждения тревога будет переведена в нормальное состояние. Если физическая протечка осталась, датчик снова пришлёт тревогу.",
      confirmLabel: "Сбросить",
      cancelLabel: "Отмена",
      tone: isLeak ? "warning" : "info",
    });
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const endpoint = sensor.resetEndpoint || `/api/sensors/${sensor.id}/reset`;
      const resp = await fetch(endpointToUrl(endpoint), { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || String(resp.status));
      setMessage("Тревога снята");
      refreshSensorsRegistry();
    } catch (err: any) {
      showAlert({
        title: "Не удалось сбросить датчик",
        message: err?.message || `Ошибка сброса датчика «${sensor.name}»`,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function setMaintenance(minutes: number) {
    const title = minutes > 0 ? `Включить обслуживание «${sensor.name}»?` : `Выключить обслуживание «${sensor.name}»?`;
    const msg = minutes > 0
      ? `На ${minutes} минут тревоги этого датчика будут фиксироваться в журнале, но не будут превращаться в критическую аварию.`
      : "Датчик снова будет создавать аварийные уведомления при протечке.";
    const ok = await confirm({ title, message: msg, confirmLabel: minutes > 0 ? "Включить" : "Выключить", cancelLabel: "Отмена", tone: "info" });
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const resp = await fetch(`${API_BASE}/sensors/${encodeURIComponent(sensor.id)}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, reason: minutes > 0 ? "Обслуживание из интерфейса" : "" })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || String(resp.status));
      setMessage(minutes > 0 ? "Обслуживание включено" : "Обслуживание выключено");
      refreshSensorsRegistry();
    } catch (err: any) {
      showAlert({ title: "Не удалось изменить обслуживание", message: err?.message || "Ошибка режима обслуживания", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function renderIcon() {
    const size = compact ? 68 : 90;
    if (sensor.icon === "washing-machine") return <WashingMachineSvg color={color} width={size} height={size} />;
    if (sensor.icon === "dishwasher") return <DishwasherSvg color={color} width={size} height={size} />;
    return <LeakDropSvg color={color} width={compact ? 58 : 76} height={compact ? 78 : 104} />;
  }

  return (
    <div className={`rounded-2xl border p-4 h-full flex flex-col items-center justify-between text-center ${maintenanceActive ? "border-amber-400/60 bg-[#2d2619]" : "border-[#2a2b46] bg-[#131522]"}`}>
      <div className="w-full">
        <div className="flex items-start justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-100 truncate">{sensor.name}</div>
            <div className="text-xs text-gray-400 truncate">{sensor.location}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isLeak ? "bg-red-500/20 text-red-300" : status === "dry" ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-300"}`}>
              {status}
            </span>
            {maintenanceActive && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">обслуживание</span>}
          </div>
        </div>

        <div className={`relative mx-auto mt-3 flex items-center justify-center ${compact ? "h-24 w-24" : "h-32 w-32"}`}>
          <span className={`absolute h-full w-full rounded-full ${ringClass} opacity-25`} />
          <div className="theme-adaptive-icon relative z-10 flex h-full w-full items-center justify-center">
            {renderIcon()}
          </div>
        </div>

        <div className="mt-3">
          <div className={`font-bold ${compact ? "text-lg" : "text-xl"} ${isLeak ? "text-red-500 animate-pulse" : status === "dry" ? "text-amber-800" : "text-gray-500"}`}>
            {text.title}
          </div>
          <div className={`mt-1 text-xs ${isLeak ? "text-red-400" : "text-gray-400"}`}>
            {text.subtitle}
            {isLeak && sensor.state?.lastTriggerAt ? ` • ${formatRelative(sensor.state.lastTriggerAt)}` : ""}
          </div>
          {maintenanceActive && (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
              До {formatUntil(sensor.state?.maintenanceUntil)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 w-full space-y-2">
        <div className="flex flex-wrap justify-center gap-2 text-[11px] text-gray-400">
          <span>{sensor.state?.deviceStatus || "unknown"}</span>
          {sensor.ip && <span>IP: {sensor.ip}</span>}
          {sensor.firmwareVersion && <span>FW: {sensor.firmwareVersion}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!maintenanceActive ? (
            <button
              type="button"
              onClick={() => setMaintenance(15)}
              disabled={busy}
              className="rounded-lg border border-amber-400/40 px-2 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/10 disabled:opacity-60"
            >
              Обслуж. 15 мин
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMaintenance(0)}
              disabled={busy}
              className="rounded-lg border border-emerald-400/40 px-2 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-60"
            >
              Вернуть в работу
            </button>
          )}
          <button
            type="button"
            onClick={() => setMaintenance(60)}
            disabled={busy || maintenanceActive}
            className="rounded-lg border border-[#2a2b46] px-2 py-2 text-xs font-medium text-gray-200 transition hover:bg-[#1b1d31] disabled:opacity-50"
          >
            Обслуж. 1 час
          </button>
        </div>

        {sensor.resettable && isLeak && (
          <button
            type="button"
            onClick={resetSensor}
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Выполняю..." : "Сбросить датчик"}
          </button>
        )}

        {message && <div className="text-xs text-gray-300">{message}</div>}
      </div>
    </div>
  );
};

export default UniversalSensorCard;
