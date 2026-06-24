import React, { useEffect, useMemo, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";
import { refreshSensorsRegistry } from "../../hooks/useSensorsRegistry";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type SensorStatus = "dry" | "leak" | "unknown";

interface SensorItem {
  id: string;
  name: string;
  location: string;
  type: string;
  icon?: string;
  deviceId: string;
  resettable: boolean;
  ip?: string;
  mac?: string;
  firmwareVersion?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  eventEndpoint?: string | null;
  commandEndpoint?: string | null;
  resetEndpoint?: string | null;
  state?: {
    status?: SensorStatus;
    deviceStatus?: "online" | "offline" | "unknown";
    lastTriggerAt?: string | null;
    lastSeenAt?: string | null;
    resetVersion?: number;
  };
}

const initialForm = {
  id: "",
  name: "",
  location: "",
  deviceId: "",
  resettable: true,
  icon: "drop",
  ip: "",
  mac: "",
  firmwareVersion: "",
};

const badgeByStatus: Record<string, string> = {
  dry: "bg-emerald-500/20 text-emerald-300",
  leak: "bg-red-500/20 text-red-300",
  unknown: "bg-gray-500/20 text-gray-300",
};

const SensorEditorModal: React.FC<{
  open: boolean;
  busy: boolean;
  editing: boolean;
  form: typeof initialForm;
  onChange: (patch: Partial<typeof initialForm>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ open, busy, editing, form, onChange, onClose, onSubmit }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm md:max-w-2xl lg:max-w-4xl rounded-2xl border border-[#2a2b46] bg-[#16182a] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xl font-semibold text-gray-100">
              {editing ? "Изменить датчик" : "Добавить датчик"}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Привязка датчика по <code className="text-blue-300">deviceId</code>, IP и MAC.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[#2a2b46] px-3 py-2 text-sm text-gray-200"
          >
            Закрыть
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Название датчика"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <input
            value={form.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Локация"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <input
            value={form.deviceId}
            onChange={(e) => onChange({ deviceId: e.target.value })}
            placeholder="deviceId Arduino"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <input
            value={form.ip}
            onChange={(e) => onChange({ ip: e.target.value })}
            placeholder="IP датчика"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <input
            value={form.mac}
            onChange={(e) => onChange({ mac: e.target.value })}
            placeholder="MAC датчика"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <input
            value={form.firmwareVersion}
            onChange={(e) => onChange({ firmwareVersion: e.target.value })}
            placeholder="Версия прошивки (опц.)"
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          />
          <select
            value={form.icon}
            onChange={(e) => onChange({ icon: e.target.value })}
            className="rounded-lg bg-[#111322] border border-[#2a2b46] px-3 py-2 text-sm text-gray-100 outline-none"
          >
            <option value="drop">Капля / протечка</option>
            <option value="washing-machine">Стиральная машина</option>
            <option value="dishwasher">Посудомойка</option>
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-[#2a2b46] px-3 py-2 text-sm text-gray-200 bg-[#111322] md:col-span-2 xl:col-span-2">
            <input
              type="checkbox"
              checked={form.resettable}
              onChange={(e) => onChange({ resettable: e.target.checked })}
            />
            С удалённым сбросом
          </label>
          <div className="flex gap-2 xl:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || !form.name || !form.deviceId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {busy ? "Сохраняю..." : editing ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SensorAdminPanel: React.FC = () => {
  const { confirm } = useUiPopup();
  const [sensors, setSensors] = useState<SensorItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const editing = useMemo(() => !!form.id, [form.id]);

  async function loadSensors() {
    try {
      const resp = await fetch(`${API_BASE}/sensors`);
      if (!resp.ok) throw new Error(String(resp.status));
      const data = await resp.json();
      setSensors(Array.isArray(data) ? data : []);
    } catch {
      setSensors([]);
    }
  }

  useEffect(() => {
    loadSensors();
    const timer = window.setInterval(loadSensors, 5000);
    return () => window.clearInterval(timer);
  }, []);

  function resetForm() {
    setForm(initialForm);
  }

  function openCreate() {
    resetForm();
    setEditorOpen(true);
  }

  function openEdit(sensor: SensorItem) {
    setForm({
      id: sensor.id,
      name: sensor.name,
      location: sensor.location,
      deviceId: sensor.deviceId,
      resettable: !!sensor.resettable,
      ip: sensor.ip || "",
      mac: sensor.mac || "",
      firmwareVersion: sensor.firmwareVersion || "",
      icon: sensor.icon || "drop",
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (busy) return;
    setEditorOpen(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const url = editing ? `${API_BASE}/sensors/${form.id}` : `${API_BASE}/sensors`;
      const method = editing ? "PUT" : "POST";
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          location: form.location,
          deviceId: form.deviceId,
          ip: form.ip,
          mac: form.mac,
          firmwareVersion: form.firmwareVersion,
          icon: form.icon,
          resettable: form.resettable,
          isActive: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || String(resp.status));
      setMessage(editing ? "Датчик обновлён" : "Датчик добавлен");
      setEditorOpen(false);
      resetForm();
      refreshSensorsRegistry();
      await loadSensors();
    } catch (err: any) {
      setMessage(err?.message || "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(sensor: SensorItem) {
    const ok = await confirm({
      title: "Удалить датчик?",
      message: `Датчик «${sensor.name}» будет удалён из реестра.`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "warning",
    });
    if (!ok) return;
    await fetch(`${API_BASE}/sensors/${sensor.id}`, { method: "DELETE" });
    if (form.id === sensor.id) resetForm();
    refreshSensorsRegistry();
    await loadSensors();
  }

  async function handleReset(sensor: SensorItem) {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/sensors/${sensor.id}/reset`, { method: "POST" });
      setMessage(`Сброс отправлен для «${sensor.name}»`);
      refreshSensorsRegistry();
      await loadSensors();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-150">Админка датчиков</h3>
            <p className="text-sm text-gray-400 mt-1">
              Здесь можно привязывать новые датчики по <code className="text-blue-300">deviceId</code>
              и сразу видеть статус, heartbeat и endpoint'ы.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Добавить датчик
          </button>
        </div>

        {message && <div className="shrink-0 text-sm text-gray-300 mt-3">{message}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 overflow-auto pr-1 mt-4">
          {sensors.map((sensor) => (
            <div key={sensor.id} className="rounded-lg border border-[#2a2b46] bg-[#1b1d31] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-gray-100">{sensor.name}</div>
                  <div className="text-sm text-gray-400 mt-1">{sensor.location}</div>
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeByStatus[sensor.state?.status || "unknown"]}`}>
                    {sensor.state?.status || "unknown"}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sensor.state?.deviceStatus === "online" ? "bg-emerald-500/20 text-emerald-300" : sensor.state?.deviceStatus === "offline" ? "bg-amber-500/20 text-amber-200" : "bg-gray-500/20 text-gray-300"}`}>
                    {sensor.state?.deviceStatus || "unknown"}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-300">
                <div><span className="text-gray-500">deviceId:</span> {sensor.deviceId}</div>
                <div><span className="text-gray-500">IP:</span> {sensor.ip || "—"}</div>
                <div><span className="text-gray-500">MAC:</span> {sensor.mac || "—"}</div>
                <div><span className="text-gray-500">FW:</span> {sensor.firmwareVersion || "—"}</div>
                <div><span className="text-gray-500">icon:</span> {sensor.icon || "drop"}</div>
                <div><span className="text-gray-500">event:</span> <code className="text-blue-300">{sensor.eventEndpoint}</code></div>
                {sensor.commandEndpoint && <div><span className="text-gray-500">command:</span> <code className="text-blue-300">{sensor.commandEndpoint}</code></div>}
                {sensor.resetEndpoint && <div><span className="text-gray-500">reset:</span> <code className="text-blue-300">{sensor.resetEndpoint}</code></div>}
                <div><span className="text-gray-500">last seen:</span> {sensor.state?.lastSeenAt ? new Date(sensor.state.lastSeenAt).toLocaleString("ru-RU") : "—"}</div>
                <div><span className="text-gray-500">last trigger:</span> {sensor.state?.lastTriggerAt ? new Date(sensor.state.lastTriggerAt).toLocaleString("ru-RU") : "—"}</div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(sensor)}
                  className="rounded-lg border border-[#2a2b46] px-3 py-2 text-sm text-gray-200"
                >
                  Изменить
                </button>
                {sensor.resettable && (
                  <button
                    type="button"
                    onClick={() => handleReset(sensor)}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                  >
                    Сбросить
                  </button>
                )}
                {!sensor.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => handleDelete(sensor)}
                    className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SensorEditorModal
        open={editorOpen}
        busy={busy}
        editing={editing}
        form={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onClose={closeEditor}
        onSubmit={handleSubmit}
      />
    </>
  );
};

export default SensorAdminPanel;
