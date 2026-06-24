import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type LampVal = "on" | "off" | "skip";
type BlindVal = number | "skip";
type FloorVal = { on: boolean; temp: number } | "skip";
type IrRef = { remoteId: string; buttonId: string };

interface Actions {
  lamps: Record<string, LampVal>;
  led: LampVal;
  blinds: Record<string, BlindVal>;
  floor: Record<string, FloorVal>;
  valves: "open" | "close" | "skip";
  ir: IrRef[];
}

interface ScenarioItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  actions: Actions;
  active: boolean;
}

interface Targets {
  lamps: { tag: string; label: string; code: number }[];
  blinds: { zone: string; label: string }[];
  floor: { key: string; label: string }[];
  valvesConfigured: boolean;
  valves: { slot: string; label: string }[];
  irButtons: { remoteId: string; buttonId: string; label: string }[];
}

const emptyTargets: Targets = { lamps: [], blinds: [], floor: [], valvesConfigured: false, valves: [], irButtons: [] };

// 3-позиционный переключатель: Вкл / Выкл / Не трогать.
const TriState: React.FC<{ value: LampVal; onChange: (v: LampVal) => void; onLabel?: string; offLabel?: string }> = ({
  value, onChange, onLabel = "Вкл", offLabel = "Выкл",
}) => {
  const opts: { v: LampVal; l: string; on: string }[] = [
    { v: "on", l: onLabel, on: "bg-emerald-600/30 text-emerald-100" },
    { v: "off", l: offLabel, on: "bg-red-600/25 text-red-100" },
    { v: "skip", l: "Не трогать", on: "bg-blue-600/25 text-blue-100" },
  ];
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#2a2b46]">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1.5 text-xs font-medium transition ${value === o.v ? o.on : "text-gray-400 hover:bg-[#1b1d31]"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
    <span className="text-sm text-gray-200">{label}</span>
    {children}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-[#2a2b46] bg-[#12152a] p-3">
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
    {children}
  </div>
);

const ScenarioPanel: React.FC = () => {
  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScenarioItem | null>(null);
  const [draft, setDraft] = useState<Actions | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function loadTargets() {
    try {
      const r = await fetch(`${API_BASE}/scenarios/targets`);
      if (r.ok) setTargets({ ...emptyTargets, ...(await r.json()) });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadScenarios();
    loadTargets();
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

  function openEditor(item: ScenarioItem) {
    // глубокая копия actions с гарантией всех ключей
    const a = item.actions || ({} as Actions);
    setDraft({
      lamps: { ...(a.lamps || {}) },
      led: a.led || "skip",
      blinds: { ...(a.blinds || {}) },
      floor: { ...(a.floor || {}) },
      valves: a.valves || "skip",
      ir: Array.isArray(a.ir) ? a.ir.map((x) => ({ ...x })) : [],
    });
    setDraftName(item.name);
    setDraftDesc(item.description || "");
    setEditing(item);
  }

  async function saveEditor() {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/scenarios/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, description: draftDesc, actions: draft }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setEditing(null);
      setDraft(null);
      await loadScenarios();
    } finally {
      setSaving(false);
    }
  }

  // helpers для draft
  const setLamp = (tag: string, v: LampVal) => setDraft((d) => (d ? { ...d, lamps: { ...d.lamps, [tag]: v } } : d));
  const setBlind = (zone: string, v: BlindVal) => setDraft((d) => (d ? { ...d, blinds: { ...d.blinds, [zone]: v } } : d));
  const setFloor = (key: string, v: FloorVal) => setDraft((d) => (d ? { ...d, floor: { ...d.floor, [key]: v } } : d));
  const toggleIr = (ref: IrRef) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.ir.some((x) => x.remoteId === ref.remoteId && x.buttonId === ref.buttonId);
      return { ...d, ir: has ? d.ir.filter((x) => !(x.remoteId === ref.remoteId && x.buttonId === ref.buttonId)) : [...d.ir, ref] };
    });

  return (
    <div className="h-full min-h-0 rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm flex flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h3 className="text-lg font-bold text-gray-150">Сценарии</h3>
        <p className="text-xs text-gray-400 mt-1">Быстрые режимы дома. Нажми карточку — применить, ⚙ — настроить.</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
        {items.map((item) => (
          <div
            key={item.id}
            className={`relative rounded-lg border px-3 py-3 transition ${item.active ? "border-blue-500 bg-blue-600/15" : "border-[#2a2b46] bg-[#1b1d31] hover:border-blue-400/60"}`}
          >
            <button
              type="button"
              onClick={() => openEditor(item)}
              title="Настроить сценарий"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a2b46] bg-[#12152a] text-sm text-gray-300 hover:border-blue-400/60 hover:text-white"
            >
              ⚙
            </button>
            <button type="button" onClick={() => applyScenario(item.id)} disabled={busyId === item.id} className="block w-full pr-8 text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <span className="font-semibold text-gray-150">{item.name}</span>
                {item.active && <span className="text-[10px] uppercase tracking-wide text-blue-300">active</span>}
              </div>
              <div className="mt-1 text-xs text-gray-400">{item.description}</div>
              <div className="mt-2 text-[11px] text-gray-500">{busyId === item.id ? "Применяю…" : "Нажми для запуска"}</div>
            </button>
          </div>
        ))}
      </div>

      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => !saving && setEditing(null)}>
          <div
            className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-[#2a2b46] bg-[#16182a] shadow-2xl sm:max-w-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2a2b46] px-4 py-3">
              <div className="flex items-center gap-2 text-lg font-bold text-gray-100">
                <span>{editing.icon}</span> Настройка: {editing.name}
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg px-2 py-1 text-gray-400 hover:text-gray-100">✕</button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 custom-scroll">
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs text-gray-500">Название
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500" />
                </label>
                <label className="text-xs text-gray-500">Описание
                  <input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500" />
                </label>
              </div>

              <Section title="Свет (комнаты)">
                <div className="mb-1 text-[11px] text-amber-300/80">Прихожая · Зал · Кухня · Ванная на одном канале — двигаются вместе. Гардероб отдельно.</div>
                {targets.lamps.map((l) => (
                  <Row key={l.tag} label={l.label}>
                    <TriState value={draft.lamps[l.tag] || "skip"} onChange={(v) => setLamp(l.tag, v)} />
                  </Row>
                ))}
              </Section>

              <Section title="Подсветка (LED)">
                <Row label="Светодиодная подсветка">
                  <TriState value={draft.led} onChange={(v) => setDraft((d) => (d ? { ...d, led: v } : d))} />
                </Row>
              </Section>

              <Section title="Жалюзи">
                <div className="mb-1 text-[11px] text-gray-500">0 = открыто, 100 = закрыто</div>
                {targets.blinds.map((b) => {
                  const v = draft.blinds[b.zone];
                  const skip = v === "skip" || typeof v !== "number";
                  return (
                    <div key={b.zone} className="py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-200">{b.label}</span>
                        <button type="button" onClick={() => setBlind(b.zone, skip ? 100 : "skip")} className={`rounded-lg border px-2.5 py-1 text-xs ${skip ? "border-blue-400/50 bg-blue-600/25 text-blue-100" : "border-[#2a2b46] text-gray-300 hover:bg-[#1b1d31]"}`}>
                          {skip ? "Не трогать" : "Задать"}
                        </button>
                      </div>
                      {!skip && (
                        <div className="mt-1 flex items-center gap-2">
                          <input type="range" min={0} max={100} step={5} value={v as number} onChange={(e) => setBlind(b.zone, Number(e.target.value))} className="flex-1" />
                          <span className="w-16 text-right text-xs text-gray-400">{v as number}% закр.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>

              <Section title="Тёплый пол">
                {targets.floor.map((f) => {
                  const v = draft.floor[f.key];
                  const skip = v === "skip" || typeof v !== "object";
                  const fv = (typeof v === "object" ? v : { on: false, temp: 22 }) as { on: boolean; temp: number };
                  return (
                    <div key={f.key} className="py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-200">{f.label}</span>
                        <button type="button" onClick={() => setFloor(f.key, skip ? { on: true, temp: 24 } : "skip")} className={`rounded-lg border px-2.5 py-1 text-xs ${skip ? "border-blue-400/50 bg-blue-600/25 text-blue-100" : "border-[#2a2b46] text-gray-300 hover:bg-[#1b1d31]"}`}>
                          {skip ? "Не трогать" : "Задать"}
                        </button>
                      </div>
                      {!skip && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => setFloor(f.key, { on: !fv.on, temp: fv.temp })} className={`rounded-lg border px-3 py-1 text-xs font-medium ${fv.on ? "border-emerald-400/50 bg-emerald-600/25 text-emerald-100" : "border-red-400/40 bg-red-600/20 text-red-100"}`}>
                            {fv.on ? "Включён" : "Выключен"}
                          </button>
                          <input type="range" min={15} max={35} step={1} value={fv.temp} disabled={!fv.on} onChange={(e) => setFloor(f.key, { on: fv.on, temp: Number(e.target.value) })} className="flex-1 disabled:opacity-40" />
                          <span className="w-12 text-right text-xs text-gray-400">{fv.temp}°C</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>

              {targets.valvesConfigured && (
                <Section title="Вода (краны)">
                  <Row label={`Краны: ${targets.valves.map((v) => v.label).join(", ")}`}>
                    <TriState value={draft.valves === "open" ? "on" : draft.valves === "close" ? "off" : "skip"} onChange={(v) => setDraft((d) => (d ? { ...d, valves: v === "on" ? "open" : v === "off" ? "close" : "skip" } : d))} onLabel="Открыть" offLabel="Закрыть" />
                  </Row>
                </Section>
              )}

              {targets.irButtons.length > 0 && (
                <Section title="ИК-команды (например, выключить ТВ)">
                  <div className="flex flex-wrap gap-2">
                    {targets.irButtons.map((b) => {
                      const on = draft.ir.some((x) => x.remoteId === b.remoteId && x.buttonId === b.buttonId);
                      return (
                        <button key={`${b.remoteId}:${b.buttonId}`} type="button" onClick={() => toggleIr({ remoteId: b.remoteId, buttonId: b.buttonId })} className={`rounded-lg border px-3 py-1.5 text-xs ${on ? "border-blue-400/60 bg-blue-600/25 text-blue-100" : "border-[#2a2b46] text-gray-300 hover:bg-[#1b1d31]"}`}>
                          {on ? "✓ " : ""}{b.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">Выбранные ИК-кнопки будут отправлены при запуске сценария.</div>
                </Section>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#2a2b46] px-4 py-3">
              <button onClick={() => setEditing(null)} disabled={saving} className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-300 hover:bg-[#1b1d31] disabled:opacity-60">Отмена</button>
              <button onClick={saveEditor} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{saving ? "Сохраняю…" : "Сохранить"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioPanel;
