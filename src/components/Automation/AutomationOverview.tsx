import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface Summary {
  activeScenarioId: string | null;
  onlineDevices: number;
  offlineDevices: number;
  totalDevices: number;
  activeLeaks: number;
  unreadNotifications: number;
  unreadCritical: number;
  eventsCount: number;
}

const emptySummary: Summary = {
  activeScenarioId: null,
  onlineDevices: 0,
  offlineDevices: 0,
  totalDevices: 0,
  activeLeaks: 0,
  unreadNotifications: 0,
  unreadCritical: 0,
  eventsCount: 0,
};

const cards = (summary: Summary) => [
  { title: "Активный сценарий", value: summary.activeScenarioId || "—", hint: "текущий режим" },
  { title: "Устройства online", value: `${summary.onlineDevices}/${summary.totalDevices}`, hint: `${summary.offlineDevices} offline` },
  { title: "Непрочитанные", value: summary.unreadNotifications, hint: `${summary.unreadCritical} critical` },
  { title: "Событий в журнале", value: summary.eventsCount, hint: `${summary.activeLeaks} активных протечек` },
];

const AutomationOverview: React.FC = () => {
  const [summary, setSummary] = useState<Summary>(emptySummary);

  useEffect(() => {
    let mounted = true;
    async function fetchSummary() {
      try {
        const resp = await fetch(`${API_BASE}/system/summary`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (mounted) setSummary({ ...emptySummary, ...(data || {}) });
      } catch {
        if (mounted) setSummary(emptySummary);
      }
    }
    fetchSummary();
    const timer = window.setInterval(fetchSummary, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards(summary).map((card) => (
        <div key={card.title} className="rounded-xl border border-[#2a2b46] bg-darkblue px-4 py-3 shadow-sm min-w-0">
          <div className="text-xs text-gray-350 truncate">{card.title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-150 break-words leading-tight">{card.value}</div>
          <div className="mt-1 text-[11px] text-gray-400 truncate">{card.hint}</div>
        </div>
      ))}
    </div>
  );
};

export default AutomationOverview;
