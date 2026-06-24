import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type IrButton = { id: string; name: string; code: string; icon?: string };
type IrRemote = {
  id: string;
  name: string;
  blaster: string;
  buttons: IrButton[];
  blasterOnline?: boolean;
  blasterKnown?: boolean;
};

// Компактная панель управления ИК-кнопками для вкладки «Управление».
// Только нажатие сохранённых кнопок — без редактирования (это во вкладке Датчики → ИК устройства).
const IrControls: React.FC = () => {
  const { showAlert } = useUiPopup();
  const [remotes, setRemotes] = useState<IrRemote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null); // подсветка после успешной отправки
  const sentTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/ir/remotes`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setRemotes(Array.isArray(d.remotes) ? d.remotes : []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      window.clearInterval(t);
      if (sentTimer.current) window.clearTimeout(sentTimer.current);
    };
  }, [load]);

  async function send(remote: IrRemote, button: IrButton) {
    setBusy(button.id);
    try {
      const r = await fetch(`${API_BASE}/ir/remotes/${remote.id}/buttons/${button.id}/send`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSent(button.id);
      if (sentTimer.current) window.clearTimeout(sentTimer.current);
      sentTimer.current = window.setTimeout(() => setSent(null), 700);
    } catch (e: any) {
      showAlert({ tone: "error", title: "ИК-устройства", message: e?.message || "Не удалось отправить код." });
    } finally {
      setBusy(null);
    }
  }

  // Показываем только пульты, у которых есть кнопки.
  const withButtons = remotes.filter((r) => Array.isArray(r.buttons) && r.buttons.length > 0);
  if (!loaded || withButtons.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
        <span className="text-blue-300">📡</span> ИК-управление
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {withButtons.map((remote) => {
          const offline = remote.blasterKnown && !remote.blasterOnline;
          return (
            <div
              key={remote.id}
              className="overflow-hidden rounded-2xl border border-[#2a2b46] bg-gradient-to-b from-[#171a2c] to-[#0f1120] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]"
            >
              {/* Шапка пульта */}
              <div className="flex items-center gap-2.5 border-b border-[#2a2b46]/70 px-3.5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-lg ring-1 ring-blue-400/20">
                  📺
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gray-100">{remote.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-gray-500" : "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60"}`} />
                    <span className="text-[11px] text-gray-500">{offline ? "не в сети" : "в сети"}</span>
                  </div>
                </div>
              </div>

              {/* Кнопки */}
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
                {remote.buttons.map((b) => {
                  const isSent = sent === b.id;
                  const isBusy = busy === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={isBusy}
                      onClick={() => send(remote, b)}
                      title={`Отправить: ${b.name}`}
                      className={`group relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border text-center transition-all duration-150 active:scale-[0.94] disabled:cursor-wait
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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IrControls;
