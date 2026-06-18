import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface HomeSummary {
  overallStatus: "normal" | "warning" | "critical";
  onlineDevices: number;
  totalDevices: number;
  activeLeaks: number;
}

const DeviceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </svg>
);

const AlarmIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const HomeStatusChips: React.FC = () => {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const resp = await fetch(`${API_BASE}/system/summary`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (mounted) setSummary(data);
      } catch {
        if (mounted) setSummary(null);
      }
    }
    load();
    const timer = window.setInterval(load, 5000);
    window.addEventListener("sensors-registry-refresh", load);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("sensors-registry-refresh", load);
    };
  }, []);

  const online = summary?.onlineDevices ?? 0;
  const total = summary?.totalDevices ?? 0;
  const allOnline = summary != null && online === total;
  const alarms = summary?.activeLeaks ?? 0;

  return (
    <div className="flex items-center gap-2">
      <span
        title="Устройства онлайн"
        className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1 text-sm font-semibold ${
          allOnline ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
        }`}
      >
        <DeviceIcon />
        {summary ? `${online}/${total}` : "—"}
      </span>
      <span
        title="Активные тревоги"
        className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1 text-sm font-semibold ${
          alarms > 0 ? "border-red-500/50 bg-red-500/10 text-red-200" : "border-[#232445] bg-[#1a1b2d] text-gray-300"
        }`}
      >
        <AlarmIcon />
        {summary ? alarms : "—"}
      </span>
    </div>
  );
};

export default HomeStatusChips;
