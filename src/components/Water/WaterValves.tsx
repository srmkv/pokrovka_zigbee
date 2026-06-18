import React, { useEffect, useMemo, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type ZControl = { property?: string; writable?: boolean; valueOn?: unknown; valueOff?: unknown };
type ZDevice = {
  friendlyName: string;
  effectiveStatus?: string;
  availability?: string;
  modelId?: string;
  controls?: ZControl[];
  state?: Record<string, unknown>;
  definition?: { description?: string };
};

type Slot = { id: string; group: "bath" | "wardrobe"; temp: "hot" | "cold"; defaultLabel: string };
const SLOTS: Slot[] = [
  { id: "bath-hot", group: "bath", temp: "hot", defaultLabel: "Горячая" },
  { id: "bath-cold", group: "bath", temp: "cold", defaultLabel: "Холодная" },
  { id: "wardrobe-hot", group: "wardrobe", temp: "hot", defaultLabel: "Горячая" },
  { id: "wardrobe-cold", group: "wardrobe", temp: "cold", defaultLabel: "Холодная" },
];

const GROUPS: Array<{ id: "bath" | "wardrobe"; title: string; icon: string }> = [
  { id: "bath", title: "Ванная", icon: "🛁" },
  { id: "wardrobe", title: "Гардеробная", icon: "🚪" },
];

type SlotConfig = { friendlyName: string; label: string };
type Config = Record<string, SlotConfig>;

function isControllableValve(d: ZDevice): boolean {
  if (d.friendlyName === "Coordinator") return false;
  if ((d.controls || []).some((c) => c.property?.toLowerCase() === "state" && c.writable)) return true;
  const text = `${d.modelId || ""} ${d.definition?.description || ""}`.toLowerCase();
  return /valve|кран|клапан|switch|реле|relay/.test(text);
}

function stateControlOf(d?: ZDevice): ZControl | undefined {
  return (d?.controls || []).find((c) => c.property?.toLowerCase() === "state" && c.writable);
}

function valveStatus(d?: ZDevice): { text: string; tone: string } {
  if (!d) return { text: "Не привязан", tone: "bg-[#1b1d31] text-gray-400" };
  const online = (d.effectiveStatus || d.availability) === "online";
  const raw = String(d.state?.state ?? "").toLowerCase();
  if (["on", "open", "opened", "true", "1"].includes(raw)) return { text: "Открыт", tone: "bg-emerald-500/20 text-emerald-200" };
  if (["off", "close", "closed", "false", "0"].includes(raw)) return { text: "Закрыт", tone: "bg-[#1b1d31] text-gray-300" };
  return { text: online ? "Нет данных" : "Не в сети", tone: "bg-amber-500/20 text-amber-200" };
}

function deviceOptionLabel(d: ZDevice): string {
  return d.definition?.description || d.modelId || d.friendlyName;
}

const WaterValves: React.FC = () => {
  const { showAlert } = useUiPopup();
  const [devices, setDevices] = useState<ZDevice[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function loadDevices() {
    try {
      const r = await fetch(`${API_BASE}/zigbee/status`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      setDevices(Array.isArray(data.devices) ? data.devices : []);
    } catch {
      /* ignore */
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch(`${API_BASE}/water-valves`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        if (d.config && typeof d.config === "object" && !Array.isArray(d.config)) setConfig(d.config);
      }
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }

  async function saveConfig(next: Config) {
    setConfig(next);
    try {
      await fetch(`${API_BASE}/water-valves`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadConfig();
    loadDevices();
    const t = window.setInterval(loadDevices, 3000);
    return () => window.clearInterval(t);
  }, []);

  const valves = useMemo(() => devices.filter(isControllableValve), [devices]);
  const byName = (fn?: string) => devices.find((d) => d.friendlyName === fn);

  // Первый запуск: авто-привязка первого найденного крана к первой карточке.
  useEffect(() => {
    if (loaded && Object.keys(config).length === 0 && valves[0]) {
      saveConfig({ [SLOTS[0].id]: { friendlyName: valves[0].friendlyName, label: SLOTS[0].defaultLabel } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, valves.length]);

  function updateSlot(id: string, patch: Partial<SlotConfig>) {
    const cur = config[id] || { friendlyName: "", label: "" };
    saveConfig({ ...config, [id]: { ...cur, ...patch } });
  }

  async function send(slotId: string, fn: string, open: boolean) {
    if (!fn) return;
    const ctrl = stateControlOf(byName(fn));
    const value = open ? (ctrl?.valueOn ?? "ON") : (ctrl?.valueOff ?? "OFF");
    setBusy(slotId);
    try {
      const r = await fetch(`${API_BASE}/zigbee/devices/${encodeURIComponent(fn)}/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadDevices();
    } catch {
      showAlert({ tone: "error", title: "Кран", message: "Не удалось отправить команду крану." });
    } finally {
      setBusy(null);
    }
  }

  function renderCard(slot: Slot) {
    const cfg = config[slot.id];
    const label = cfg?.label || slot.defaultLabel;
    const dev = byName(cfg?.friendlyName);
    const status = valveStatus(dev);
    const bound = !!dev;
    const isEditing = editing === slot.id;

    return (
      <div key={slot.id} className={`flex flex-col gap-3 rounded-2xl border bg-[#181825] p-4 ${slot.temp === "hot" ? "border-red-500/25" : "border-cyan-500/25"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true">{slot.temp === "hot" ? "🔥" : "❄️"}</span>
              <div className="truncate text-base font-bold text-gray-100">{label}</div>
            </div>
            <div className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.text}</div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(isEditing ? null : slot.id)}
            title="Настроить"
            className={`shrink-0 rounded-lg border px-2 py-1 text-xs ${isEditing ? "border-blue-500 text-blue-200" : "border-[#2a2b46] text-gray-400 hover:bg-[#1b1d31]"}`}
          >
            ⚙
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!bound || busy === slot.id}
            onClick={() => cfg?.friendlyName && send(slot.id, cfg.friendlyName, true)}
            className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Открыть
          </button>
          <button
            type="button"
            disabled={!bound || busy === slot.id}
            onClick={() => cfg?.friendlyName && send(slot.id, cfg.friendlyName, false)}
            className="flex-1 rounded-xl border border-[#2a2b46] px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-[#1b1d31] disabled:opacity-50"
          >
            Закрыть
          </button>
        </div>

        {isEditing && (
          <div className="space-y-2 rounded-xl border border-[#2a2b46] bg-[#111322] p-3">
            <label className="block text-xs text-gray-500">
              Название
              <input
                value={label}
                onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
              />
            </label>
            <label className="block text-xs text-gray-500">
              Zigbee-кран
              <select
                value={cfg?.friendlyName || ""}
                onChange={(e) => updateSlot(slot.id, { friendlyName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
              >
                <option value="">— не привязан —</option>
                {valves.map((v) => (
                  <option key={v.friendlyName} value={v.friendlyName}>{deviceOptionLabel(v)}</option>
                ))}
              </select>
            </label>
            {!bound && <div className="text-[11px] text-amber-300">Привяжите Zigbee-кран, чтобы управлять.</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Водоснабжение</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.id} className="rounded-2xl border border-[#2a2b46] bg-[#0f1120] p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-100"><span aria-hidden="true">{g.icon}</span> {g.title}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{SLOTS.filter((s) => s.group === g.id).map(renderCard)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WaterValves;
