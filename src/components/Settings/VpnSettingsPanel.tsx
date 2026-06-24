import { useCallback, useEffect, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type VpnStatus = {
  active?: boolean;
  configured?: boolean;
  interface?: string;
  address?: string | null;
  configPath?: string;
};

export default function VpnSettingsPanel() {
  const { showAlert } = useUiPopup();
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/vpn/status`, { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const t = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(t);
  }, [loadStatus]);

  const isActive = Boolean(status?.active);

  async function toggle() {
    const next = isActive ? "down" : "up";
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/vpn/${next}`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setStatus(data?.status || null);
      showAlert({ tone: "info", title: "VPN", message: next === "up" ? "VPN включён" : "VPN выключен" });
    } catch (e) {
      showAlert({ tone: "error", title: "VPN", message: e instanceof Error ? e.message : "Команда VPN не выполнена" });
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-[#1b1d31] text-gray-400"}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">AmneziaWG</div>
            <div className="text-xl font-bold text-gray-100">VPN-доступ</div>
            <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isActive ? "bg-emerald-500/20 text-emerald-200" : "bg-[#1b1d31] text-gray-300"}`}>
              <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-gray-500"}`} />
              {loading ? "Проверка…" : isActive ? "Включён" : "Выключен"}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          disabled={busy || loading}
          onClick={toggle}
          title={isActive ? "Выключить VPN" : "Включить VPN"}
          className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-60 ${isActive ? "bg-emerald-600" : "bg-[#2a2b46]"}`}
        >
          <span className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-7" : "translate-x-0"}`} />
        </button>
      </div>

      {isActive && status?.address && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-300">
          <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Адрес</span><br />{status.address}</div>
          <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Интерфейс</span><br />{status.interface || "awg0"}</div>
        </div>
      )}

      {status?.configured === false && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Не найден конфиг {status?.configPath || "awg0.conf"}.
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">{busy ? "Выполняю…" : "Переключатель включает и выключает VPN на этом устройстве."}</div>
    </div>
  );
}
