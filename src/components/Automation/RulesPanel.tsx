import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface RuleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: string;
}

const RulesPanel: React.FC = () => {
  const [rules, setRules] = useState<RuleItem[]>([]);

  async function loadRules() {
    try {
      const resp = await fetch(`${API_BASE}/rules`);
      if (!resp.ok) throw new Error(String(resp.status));
      const data = await resp.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setRules([]);
    }
  }

  useEffect(() => {
    loadRules();
    const timer = window.setInterval(loadRules, 7000);
    return () => window.clearInterval(timer);
  }, []);

  async function toggleRule(rule: RuleItem) {
    const previous = rules;
    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item));
    try {
      const resp = await fetch(`${API_BASE}/rules/${rule.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      await loadRules();
    } catch {
      setRules(previous);
    }
  }

  return (
    <div className="h-full min-h-0 rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm flex flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h3 className="text-lg font-bold text-gray-150">Правила</h3>
        <p className="text-xs text-gray-400 mt-1">Условия и действия автоматики</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-[#2a2b46] bg-[#1b1d31] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-150">{rule.name}</div>
                <div className="text-xs text-gray-400 mt-1">{rule.description}</div>
                <div className="text-[11px] text-gray-500 mt-1">priority: {rule.priority}</div>
              </div>
              <button
                type="button"
                onClick={() => toggleRule(rule)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${rule.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-300"}`}
              >
                {rule.enabled ? "Вкл" : "Выкл"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RulesPanel;
