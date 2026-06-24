import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface Summary {
  activeScenarioId: string | null;
  activeLeaks: number;
  eventsCount: number;
}

const emptySummary: Summary = {
  activeScenarioId: null,
  activeLeaks: 0,
  eventsCount: 0,
};

// Обзор только про автоматизацию: активный сценарий, связки, протечки, журнал.
// Счётчики устройств online/offline и уведомления живут в разделе «Система».
const AutomationOverview: React.FC = () => {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [links, setLinks] = useState({ enabled: 0, total: 0 });

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      try {
        const resp = await fetch(`${API_BASE}/system/summary`);
        if (resp.ok) {
          const data = await resp.json();
          if (mounted) setSummary({ ...emptySummary, ...(data || {}) });
        }
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch(`${API_BASE}/zigbee/links`, { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          const list = Array.isArray(d.links) ? d.links : [];
          if (mounted) setLinks({ enabled: list.filter((l: { enabled?: boolean }) => l.enabled).length, total: list.length });
        }
      } catch {
        /* ignore */
      }
    }
    fetchAll();
    const timer = window.setInterval(fetchAll, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const cards = [
    { title: "Активный сценарий", value: summary.activeScenarioId || "—", hint: "текущий режим" },
    { title: "Связки", value: `${links.enabled}/${links.total}`, hint: "активных / всего" },
    { title: "Активные протечки", value: summary.activeLeaks, hint: summary.activeLeaks ? "есть тревоги" : "всё сухо" },
    { title: "Событий в журнале", value: summary.eventsCount, hint: "история автоматизаций" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => (
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
