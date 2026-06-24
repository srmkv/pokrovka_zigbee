import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type IrButton = { id: string; name: string; code: string; icon?: string };
type IrRemote = {
  id: string;
  name: string;
  blaster: string;
  icon?: string;
  buttons: IrButton[];
  blasterOnline?: boolean;
  blasterKnown?: boolean;
};
type Blaster = {
  friendlyName: string;
  name: string;
  vendor?: string | null;
  model?: string | null;
  canLearn?: boolean;
  status?: string;
};

function blasterLabel(b: Blaster): string {
  const m = [b.vendor, b.model].filter(Boolean).join(" ");
  return m ? `${m} (${b.friendlyName})` : b.friendlyName;
}

const IrRemotesPanel: React.FC = () => {
  const { showAlert, confirm } = useUiPopup();
  const [remotes, setRemotes] = useState<IrRemote[]>([]);
  const [blasters, setBlasters] = useState<Blaster[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Форма нового пульта
  const [newName, setNewName] = useState("");
  const [newBlaster, setNewBlaster] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/ir/remotes`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setRemotes(Array.isArray(d.remotes) ? d.remotes : []);
      setBlasters(Array.isArray(d.blasters) ? d.blasters : []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!newBlaster && blasters[0]) setNewBlaster(blasters[0].friendlyName);
  }, [blasters, newBlaster]);

  async function api(path: string, init?: RequestInit) {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = await r.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return r.json();
  }

  async function createRemote() {
    const name = newName.trim();
    if (!name) return;
    if (!newBlaster) {
      showAlert({ tone: "warning", title: "ИК-устройства", message: "Сначала добавьте ИК-бластер (например, Moes UFO-R11) в Zigbee." });
      return;
    }
    setBusy("new");
    try {
      await api(`/ir/remotes`, { method: "POST", body: JSON.stringify({ name, blaster: newBlaster }) });
      setNewName("");
      setAdding(false);
      await load();
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-устройства", message: e?.message || "Не удалось создать пульт." });
    } finally {
      setBusy(null);
    }
  }

  async function removeRemote(remote: IrRemote) {
    const ok = await confirm({ tone: "warning", title: "Удалить пульт?", message: `Пульт «${remote.name}» и все его кнопки будут удалены.`, confirmLabel: "Удалить" });
    if (!ok) return;
    try {
      await api(`/ir/remotes/${remote.id}`, { method: "DELETE" });
      if (editing === remote.id) setEditing(null);
      await load();
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-устройства", message: e?.message || "Не удалось удалить пульт." });
    }
  }

  async function sendButton(remote: IrRemote, button: IrButton) {
    setBusy(button.id);
    try {
      await api(`/ir/remotes/${remote.id}/buttons/${button.id}/send`, { method: "POST" });
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-устройства", message: e?.message || "Не удалось отправить код." });
    } finally {
      setBusy(null);
    }
  }

  async function removeButton(remote: IrRemote, button: IrButton) {
    const ok = await confirm({ tone: "warning", title: "Удалить кнопку?", message: `Кнопка «${button.name}» будет удалена.`, confirmLabel: "Удалить" });
    if (!ok) return;
    try {
      await api(`/ir/remotes/${remote.id}/buttons/${button.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-устройства", message: e?.message || "Не удалось удалить кнопку." });
    }
  }

  if (loaded && blasters.length === 0 && remotes.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-6 text-center">
        <div className="text-3xl">📡</div>
        <div className="mt-2 text-base font-bold text-gray-100">ИК-устройства</div>
        <div className="mx-auto mt-1 max-w-md text-sm text-gray-400">
          Не найдено ни одного ИК-бластера. Добавьте Zigbee-устройство с ИК-передатчиком
          (например, Moes UFO-R11) во вкладке Zigbee — оно появится здесь автоматически.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Заголовок + добавление пульта */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2a2b46] bg-[#131522] p-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-gray-100">ИК-устройства</div>
          <div className="text-xs text-gray-400">Пульты на базе ИК-бластера: кнопки отправляют сохранённые ИК-коды.</div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {adding ? "Отмена" : "+ Пульт"}
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#2a2b46] bg-[#0f1120] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs text-gray-500">
            Название пульта
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например, Телевизор"
              className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
          </label>
          <label className="block text-xs text-gray-500">
            ИК-бластер
            <select
              value={newBlaster}
              onChange={(e) => setNewBlaster(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
            >
              {blasters.length === 0 && <option value="">— нет бластеров —</option>}
              {blasters.map((b) => (
                <option key={b.friendlyName} value={b.friendlyName}>{blasterLabel(b)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!newName.trim() || busy === "new"}
            onClick={createRemote}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Создать
          </button>
        </div>
      )}

      {/* Пульты */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {remotes.map((remote) => (
          <RemoteCard
            key={remote.id}
            remote={remote}
            blasters={blasters}
            busy={busy}
            editing={editing === remote.id}
            onToggleEdit={() => setEditing(editing === remote.id ? null : remote.id)}
            onSend={sendButton}
            onRemoveButton={removeButton}
            onRemoveRemote={removeRemote}
            onReload={load}
            api={api}
            showAlert={showAlert}
          />
        ))}
      </div>
    </div>
  );
};

// ===== Карточка одного пульта =====
const RemoteCard: React.FC<{
  remote: IrRemote;
  blasters: Blaster[];
  busy: string | null;
  editing: boolean;
  onToggleEdit: () => void;
  onSend: (r: IrRemote, b: IrButton) => void;
  onRemoveButton: (r: IrRemote, b: IrButton) => void;
  onRemoveRemote: (r: IrRemote) => void;
  onReload: () => Promise<void>;
  api: (path: string, init?: RequestInit) => Promise<any>;
  showAlert: ReturnType<typeof useUiPopup>["showAlert"];
}> = ({ remote, blasters, busy, editing, onToggleEdit, onSend, onRemoveButton, onRemoveRemote, onReload, api, showAlert }) => {
  const blaster = blasters.find((b) => b.friendlyName === remote.blaster);
  const canLearn = !!blaster?.canLearn;

  // форма новой кнопки
  const [btnName, setBtnName] = useState("");
  const [btnCode, setBtnCode] = useState("");
  const [learning, setLearning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<string | null>(null); // подсветка после отправки
  const pollRef = useRef<number | null>(null);
  const sentRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopPolling();
    if (sentRef.current) window.clearTimeout(sentRef.current);
  }, [stopPolling]);

  function handleSend(b: IrButton) {
    onSend(remote, b);
    setSent(b.id);
    if (sentRef.current) window.clearTimeout(sentRef.current);
    sentRef.current = window.setTimeout(() => setSent(null), 700);
  }

  async function startLearn() {
    setBtnCode("");
    setLearning(true);
    try {
      await api(`/ir/learn/start`, { method: "POST", body: JSON.stringify({ blaster: remote.blaster }) });
    } catch (e: any) {
      setLearning(false);
      showAlert({ tone: "error", title: "Обучение", message: e?.message || "Не удалось запустить обучение." });
      return;
    }
    stopPolling();
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks += 1;
      try {
        const d = await api(`/ir/learn/result?blaster=${encodeURIComponent(remote.blaster)}`);
        if (d.ready && d.code) {
          setBtnCode(d.code);
          setLearning(false);
          stopPolling();
        }
      } catch {
        /* ignore */
      }
      if (ticks > 30) {
        // ~30 сек таймаут
        setLearning(false);
        stopPolling();
      }
    }, 1000);
  }

  async function saveButton() {
    const name = btnName.trim();
    const code = btnCode.trim();
    if (!name || !code) return;
    setSaving(true);
    try {
      await api(`/ir/remotes/${remote.id}/buttons`, { method: "POST", body: JSON.stringify({ name, code }) });
      setBtnName("");
      setBtnCode("");
      await onReload();
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-кнопка", message: e?.message || "Не удалось сохранить кнопку." });
    } finally {
      setSaving(false);
    }
  }

  const online = remote.blasterOnline;
  const dotTone = !remote.blasterKnown ? "bg-amber-400 shadow-amber-400/60" : online ? "bg-emerald-400 shadow-emerald-400/60" : "bg-gray-500 shadow-transparent";
  const statusText = !remote.blasterKnown ? "Бластер не найден" : online ? "В сети" : "Не в сети";

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#2a2b46] bg-gradient-to-b from-[#171a2c] to-[#0f1120] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      {/* Шапка пульта */}
      <div className="flex items-center gap-2.5 border-b border-[#2a2b46]/70 px-3.5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-lg ring-1 ring-blue-400/20">
          📺
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-gray-100">{remote.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full shadow-[0_0_6px] ${dotTone}`} />
            <span className="truncate text-[11px] text-gray-500">{statusText} · {blaster ? blasterLabel(blaster) : remote.blaster}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleEdit}
          title="Настроить"
          className={`shrink-0 rounded-lg border px-2 py-1 text-xs transition ${editing ? "border-blue-500 bg-blue-500/10 text-blue-200" : "border-[#2a2b46] text-gray-400 hover:bg-[#1b1d31]"}`}
        >
          ⚙
        </button>
      </div>

      {/* Кнопки пульта */}
      <div className="p-3">
        {remote.buttons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2a2b46] px-3 py-5 text-center text-xs text-gray-500">
            Нет кнопок. Откройте ⚙ и добавьте кнопку — обучите с пульта или вставьте код.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {remote.buttons.map((b) => {
              const isSent = sent === b.id;
              const isBusy = busy === b.id;
              return (
                <div key={b.id} className="group relative">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSend(b)}
                    title={`Отправить: ${b.name}`}
                    className={`relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border text-center transition-all duration-150 active:scale-[0.94] disabled:cursor-wait
                      ${isSent
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                        : "border-[#2a2b46] bg-[#12152a] text-gray-200 hover:-translate-y-0.5 hover:border-blue-400/70 hover:bg-[#171c38] hover:text-white hover:shadow-lg hover:shadow-blue-900/30"}`}
                  >
                    {b.icon ? (
                      <span className="text-lg leading-none">{b.icon}</span>
                    ) : (
                      <span className={`text-base leading-none transition-opacity ${isSent ? "opacity-100" : "opacity-40 group-hover:opacity-80"}`}>
                        {isSent ? "✓" : "⚡"}
                      </span>
                    )}
                    <span className="w-full truncate px-1 text-[11px] font-semibold leading-tight">{b.name}</span>
                    {isBusy && <span className="absolute inset-0 animate-pulse bg-blue-400/10" />}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => onRemoveButton(remote, b)}
                      title="Удалить кнопку"
                      className="absolute -right-1.5 -top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full border border-red-500/60 bg-[#1b1020] text-xs text-red-300 group-hover:flex"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Режим настройки */}
      {editing && (
        <div className="mx-3 mb-3 space-y-3 rounded-xl border border-[#2a2b46] bg-[#111322] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Добавить кнопку</div>
          <label className="block text-xs text-gray-500">
            Название
            <input
              value={btnName}
              onChange={(e) => setBtnName(e.target.value)}
              placeholder="Например, Питание"
              className="mt-1 w-full rounded-lg border border-[#2a2b46] bg-[#0f1120] px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
          </label>
          <label className="block text-xs text-gray-500">
            ИК-код
            <textarea
              value={btnCode}
              onChange={(e) => setBtnCode(e.target.value)}
              placeholder="Вставьте код или обучите с пульта"
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-[#2a2b46] bg-[#0f1120] px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none focus:border-blue-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {canLearn && (
              <button
                type="button"
                disabled={learning}
                onClick={startLearn}
                className="rounded-lg border border-blue-500/50 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/10 disabled:opacity-60"
              >
                {learning ? "Наведите пульт и нажмите кнопку…" : "📡 Обучить с пульта"}
              </button>
            )}
            <button
              type="button"
              disabled={!btnName.trim() || !btnCode.trim() || saving}
              onClick={saveButton}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Сохранить кнопку
            </button>
          </div>

          <div className="flex justify-end border-t border-[#2a2b46] pt-3">
            <button
              type="button"
              onClick={() => onRemoveRemote(remote)}
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
            >
              Удалить пульт
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IrRemotesPanel;
