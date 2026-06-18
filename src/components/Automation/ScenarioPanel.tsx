import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface ScenarioItem {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

const ScenarioPanel: React.FC = () => {
  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadScenarios() {
    try {
      const resp = await fetch(`${API_BASE}/scenarios`);
      if (!resp.ok) throw new Error(String(resp.status));
      const data = await resp.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    loadScenarios();
    const timer = window.setInterval(loadScenarios, 7000);
    return () => window.clearInterval(timer);
  }, []);

  async function applyScenario(id: string) {
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/scenarios/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: id }),
      });
      await loadScenarios();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="h-full min-h-0 rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm flex flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h3 className="text-lg font-bold text-gray-150">Сценарии</h3>
        <p className="text-xs text-gray-400 mt-1">Быстрые режимы дома</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => applyScenario(item.id)}
            disabled={busyId === item.id}
            className={`rounded-lg border px-3 py-3 text-left transition ${item.active ? "border-blue-500 bg-blue-600/15" : "border-[#2a2b46] bg-[#1b1d31] hover:border-blue-400/60"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-gray-150">{item.name}</span>
              {item.active && <span className="text-[10px] uppercase tracking-wide text-blue-300">active</span>}
            </div>
            <div className="mt-1 text-xs text-gray-400">{item.description}</div>
            <div className="mt-2 text-[11px] text-gray-500">{busyId === item.id ? "Применяю..." : "Нажми для запуска"}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ScenarioPanel;
