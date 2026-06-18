import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface EventItem {
  id: string;
  title: string;
  text: string;
  source: string;
  priority: "info" | "warning" | "critical";
  createdAt: string;
}

const colorByPriority = {
  info: "text-blue-300",
  warning: "text-amber-300",
  critical: "text-red-300",
};

const EventLogPanel: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    let mounted = true;
    async function fetchEvents() {
      try {
        const resp = await fetch(`${API_BASE}/events?limit=10`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (mounted) setEvents(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setEvents([]);
      }
    }
    fetchEvents();
    const timer = window.setInterval(fetchEvents, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="h-full min-h-0 rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm flex flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h3 className="text-lg font-bold text-gray-150">Журнал событий</h3>
        <p className="text-xs text-gray-400 mt-1">Последние изменения и срабатывания</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-lg border border-[#2a2b46] bg-[#1b1d31] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className={`text-sm font-semibold ${colorByPriority[event.priority] || colorByPriority.info}`}>{event.title}</div>
              <div className="text-[11px] text-gray-500">{new Date(event.createdAt).toLocaleTimeString("ru-RU")}</div>
            </div>
            <div className="mt-1 text-xs text-gray-300">{event.text}</div>
            <div className="mt-1 text-[11px] text-gray-500">{event.source}</div>
          </div>
        ))}
        {events.length === 0 && <div className="text-sm text-gray-400">Событий пока нет</div>}
      </div>
    </div>
  );
};

export default EventLogPanel;
