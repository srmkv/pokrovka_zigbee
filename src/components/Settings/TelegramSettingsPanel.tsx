import React, { useEffect, useMemo, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

type TelegramSettings = {
  enabled: boolean;
  botTokenSet: boolean;
  botTokenMasked: string;
  chatId: string;
  sendCritical: boolean;
  sendWarning: boolean;
  sendInfo: boolean;
  lastTestAt?: string | null;
  lastError?: string | null;
};

const emptySettings: TelegramSettings = {
  enabled: false,
  botTokenSet: false,
  botTokenMasked: "",
  chatId: "",
  sendCritical: true,
  sendWarning: false,
  sendInfo: false,
};

const TelegramSettingsPanel: React.FC = () => {
  const API_BASE = useMemo(() => (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, ""), []);
  const { showAlert } = useUiPopup();
  const [settings, setSettings] = useState<TelegramSettings>(emptySettings);
  const [botToken, setBotToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const resp = await fetch(`${API_BASE}/settings/telegram`);
    if (!resp.ok) throw new Error(String(resp.status));
    const data = await resp.json();
    setSettings({ ...emptySettings, ...data });
  }

  useEffect(() => {
    load().catch((err) => showAlert({ title: "Ошибка Telegram настроек", message: err.message, tone: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  async function save() {
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/telegram`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, botToken: botToken.trim() })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || String(resp.status));
      setSettings({ ...emptySettings, ...data });
      setBotToken("");
      showAlert({ title: "Telegram сохранён", message: "Настройки уведомлений обновлены.", tone: "info" });
    } catch (err: any) {
      showAlert({ title: "Не удалось сохранить Telegram", message: err?.message || "Ошибка сохранения", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/telegram/test`, { method: "POST" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || String(resp.status));
      setSettings({ ...emptySettings, ...(data.settings || settings) });
      showAlert({ title: "Тест отправлен", message: "Проверь Telegram-чат.", tone: "info" });
    } catch (err: any) {
      showAlert({ title: "Telegram не отправил сообщение", message: err?.message || "Ошибка отправки", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#2a2b46] bg-darkblue p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-150">Telegram-уведомления</h3>
          <p className="mt-1 text-sm text-gray-400">Critical можно отправлять сразу в Telegram, warning/info — по желанию.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-[#2a2b46] px-3 py-2 text-sm text-gray-200">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          Включено
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-gray-300">
          Bot token
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={settings.botTokenSet ? `Сейчас: ${settings.botTokenMasked}` : "123456:ABC..."}
            className="mt-1 w-full rounded-xl border border-[#2a2b46] bg-[#131522] px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <label className="text-sm text-gray-300">
          Chat ID
          <input
            value={settings.chatId}
            onChange={(e) => setSettings({ ...settings, chatId: e.target.value })}
            placeholder="например 123456789 или -100..."
            className="mt-1 w-full rounded-xl border border-[#2a2b46] bg-[#131522] px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.sendCritical} onChange={(e) => setSettings({ ...settings, sendCritical: e.target.checked })} /> critical</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.sendWarning} onChange={(e) => setSettings({ ...settings, sendWarning: e.target.checked })} /> warning</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.sendInfo} onChange={(e) => setSettings({ ...settings, sendInfo: e.target.checked })} /> info</label>
      </div>

      {settings.lastError && <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">Последняя ошибка: {settings.lastError}</div>}
      {settings.lastTestAt && <div className="mt-3 text-xs text-gray-400">Последний тест: {new Date(settings.lastTestAt).toLocaleString("ru-RU")}</div>}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" disabled={busy} onClick={sendTest} className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Отправить тест</button>
        <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">Сохранить</button>
      </div>
    </div>
  );
};

export default TelegramSettingsPanel;
