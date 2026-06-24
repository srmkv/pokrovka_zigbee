import React, { useEffect, useRef, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface NotificationItem {
  id: string;
  title: string;
  text: string;
  source: string;
  priority: "info" | "warning" | "critical";
  sticky?: boolean;
  acknowledgedAt?: string | null;
  createdAt: string;
}

const stylesByPriority: Record<NotificationItem["priority"], { wrap: string; badge: string }> = {
  info: { wrap: "border-blue-400/50 bg-[#22243c]", badge: "bg-blue-500/20 text-blue-300 border-blue-400/40" },
  warning: { wrap: "border-amber-400/60 bg-[#2d2619]", badge: "bg-amber-500/20 text-amber-200 border-amber-400/40" },
  critical: { wrap: "border-red-500/70 bg-[#311b22]", badge: "bg-red-500/20 text-red-200 border-red-400/40" },
};

const BellIcon = ({ pulse }: { pulse: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pulse ? "animate-pulse" : ""} aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Только что подтверждённые id с временем истечения — чтобы фоновый опрос не вернул их
  // обратно, пока сервер ещё не зафиксировал ack (иначе при «Очистить все» возможно мерцание).
  const ackedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const resp = await fetch(`${API_BASE}/notifications?limit=20`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (mounted) {
          const now = Date.now();
          ackedRef.current.forEach((until, id) => { if (until < now) ackedRef.current.delete(id); });
          setNotifications((Array.isArray(data) ? data : []).filter((item: NotificationItem) => !item.acknowledgedAt && !ackedRef.current.has(item.id)));
        }
      } catch {
        if (mounted) setNotifications([]);
      }
    }
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function ack(id: string) {
    try {
      await fetch(`${API_BASE}/notifications/${id}/ack`, { method: "POST", headers: { "Content-Type": "application/json" } });
    } finally {
      ackedRef.current.set(id, Date.now() + 10000);
      setNotifications((prev) => prev.filter((note) => note.id !== id));
    }
  }

  async function ackAll() {
    const ids = notifications.map((n) => n.id);
    const until = Date.now() + 10000;
    ids.forEach((id) => ackedRef.current.set(id, until));
    setNotifications([]);
    await Promise.all(
      ids.map((id) => fetch(`${API_BASE}/notifications/${id}/ack`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {}))
    );
  }

  const count = notifications.length;
  const hasCritical = notifications.some((n) => n.priority === "critical");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Уведомления"
        aria-label="Уведомления"
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all duration-150 ${
          open ? "border-blue-400 bg-blue-700 text-gray-100" : "border-[#232445] bg-[#1a1b2d] text-gray-200 hover:border-blue-500 hover:bg-blue-900"
        }`}
      >
        <BellIcon pulse={hasCritical} />
        {count > 0 && (
          <span className={`absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white ${hasCritical ? "bg-red-500" : "bg-blue-500"}`}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[90vw] rounded-xl border border-[#2a2b46] bg-[#131522] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#2a2b46] px-4 py-3">
            <div className="text-sm font-bold text-gray-100">Уведомления{count > 0 ? ` · ${count}` : ""}</div>
            {count > 0 && (
              <button onClick={ackAll} className="text-xs font-medium text-blue-300 hover:text-blue-200">
                Очистить все
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-auto p-2">
            {count === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-500">Нет новых уведомлений</div>
            ) : (
              notifications.map((note) => {
                const styles = stylesByPriority[note.priority] || stylesByPriority.info;
                return (
                  <div key={note.id} className={`relative mb-2 rounded-lg border p-3 text-gray-150 ${styles.wrap}`}>
                    <button
                      onClick={() => ack(note.id)}
                      aria-label="Закрыть"
                      className="absolute right-2 top-2 rounded-full p-2 text-gray-400 transition hover:bg-gray-700/30 hover:text-gray-100"
                    >
                      <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden="true">
                        <line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" strokeWidth="2" />
                        <line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </button>
                    <div className="mb-1 flex items-center gap-2 pr-7">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles.badge}`}>{note.priority}</span>
                      <span className="text-xs text-gray-400">{note.source}</span>
                    </div>
                    <div className="text-sm font-semibold">{note.title}</div>
                    <div className="text-sm leading-5 text-gray-300">{note.text}</div>
                    <div className="mt-2 text-xs text-gray-500">{new Date(note.createdAt).toLocaleString("ru-RU")}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
