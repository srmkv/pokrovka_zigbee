import React from "react";
import { useSensorsRegistry } from "../../hooks/useSensorsRegistry";
import DishwasherSvg from "./DishwasherSvg";
import LeakDropSvg from "./LeakDropSvg";
import WashingMachineSvg from "./WashingMachineSvg";

function formatLeakTime(lastLeak?: string | null) {
  if (!lastLeak) return "";
  const start = new Date(lastLeak);
  const delta = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (delta < 60) return `(${delta} сек назад)`;
  return `(${Math.floor(delta / 60)} мин назад)`;
}

const LeakSensorsRow: React.FC = () => {
  const { sensors } = useSensorsRegistry();
  const visible = sensors.slice(0, 6);

  return (
    <div className="w-full flex items-center justify-center gap-5 mt-2 py-1 border-t border-gray-600/30">
      {visible.map((sensor) => {
        const state = sensor.state?.status || "unknown";
        const color = state === "leak" ? "#ef4444" : state === "dry" ? "#7A5A3A" : "#8F8375";
        const common = { width: 32, height: 32, color };
        return (
          <div key={sensor.id} className="flex flex-col items-center text-xs min-w-[54px]">
            <div className="theme-adaptive-icon h-8 flex items-center justify-center">
              {sensor.icon === "washing-machine" ? (
                <WashingMachineSvg {...common} />
              ) : sensor.icon === "dishwasher" ? (
                <DishwasherSvg {...common} />
              ) : (
                <LeakDropSvg width={28} height={32} color={color} />
              )}
            </div>
            <span
              className={`mt-0.5 max-w-[72px] truncate font-medium ${
                state === "leak" ? "text-red-500 animate-pulse" : "text-gray-350"
              }`}
              style={{ fontSize: 11 }}
              title={sensor.name}
            >
              {sensor.name}
            </span>
            {state === "leak" && sensor.state?.lastTriggerAt && (
              <span className="text-[10px] text-red-400">{formatLeakTime(sensor.state.lastTriggerAt)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LeakSensorsRow;
