// src/components/Weather/SunCycleCard.tsx
import React, { useMemo } from "react";

type Props = {
  sunrise?: string | null;
  sunset?: string | null;
  height?: number;
  className?: string;   // 👈 новое
};

const fmt = (iso?: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const fmtDur = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}ч ${String(m).padStart(2, "0")}м`;
};

export default function SunCycleCard({ sunrise, sunset, height = 12, className = "" }: Props) {
  const { durStr, progress, note } = useMemo(() => {
    const sr = sunrise ? new Date(sunrise) : null;
    const ss = sunset ? new Date(sunset) : null;
    const now = new Date();

    if (!sr || !ss || ss <= sr) return { durStr: "—", progress: 0, note: "Нет данных" };
    const day = ss.getTime() - sr.getTime();
    const p = (now.getTime() - sr.getTime()) / day;
    const clamped = Math.max(0, Math.min(1, p));

    let note = "";
    if (p < 0) note = `До восхода ${fmtDur(sr.getTime() - now.getTime())}`;
    else if (p > 1) note = `После заката ${fmtDur(now.getTime() - ss.getTime())}`;
    else note = `Пройдено ${Math.round(clamped * 100)}% • До заката ${fmtDur(ss.getTime() - now.getTime())}`;

    return { durStr: fmtDur(day), progress: clamped, note };
  }, [sunrise, sunset]);

  const knob = Math.max(16, Math.min(22, height + 8));
  const pct = Math.round(progress * 100);

  return (
    <div className={
      "bg-[#22243c] rounded-xl p-5 shadow-sm border border-[#2a2b46] " +
      "min-h-[170px] h-full flex flex-col justify-between " + // 👈 одинаковая высота
      className
    }>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-150">Восход / Закат</h3>
        <div className="text-sm text-gray-350">
          Длительность дня: <span className="font-semibold text-gray-150">{durStr}</span>
        </div>
      </div>

      <div className="text-xs text-gray-350 flex justify-between mb-2">
        <span>Восход {fmt(sunrise)}</span>
        <span>Закат {fmt(sunset)}</span>
      </div>

      <div className="relative w-full rounded-full bg-[#2f3154]" style={{ height }}>
        {/* деления */}
        <div className="absolute inset-0 grid grid-cols-10 opacity-20 pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border-r border-[#464870]" />
          ))}
        </div>

        {/* прогресс */}
        <div
          className="rounded-full"
          style={{
            height,
            width: `${pct}%`,
            background: "linear-gradient(90deg, #FFEC65 0%, #FFC94A 40%, #FFA726 100%)",
            boxShadow: "0 0 16px rgba(255, 236, 101, 0.35)",
            transition: "width .45s ease",
          }}
        />

        {/* бегунок по центру */}
        <div
          className="absolute pointer-events-none"
          style={{ left: `${pct}%`, top: "50%", transform: "translate(-50%, -50%)", transition: "left .45s ease" }}
        >
          <div
            style={{
              width: knob * 1.8,
              height: knob * 1.8,
              borderRadius: 9999,
              background:
                "radial-gradient(circle, rgba(255,236,101,.65) 0%, rgba(255,236,101,.08) 70%, rgba(0,0,0,0) 100%)",
              filter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: knob,
              height: knob,
              borderRadius: 9999,
              background: "#FFEC65",
              border: "2px solid #FFD54F",
              boxShadow: "0 2px 6px rgba(0,0,0,.25)",
            }}
          />
        </div>
      </div>

      <div className="text-center text-sm text-gray-150 mt-2">{note}</div>
    </div>
  );
}
