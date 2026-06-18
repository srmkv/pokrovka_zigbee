import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type AlertPayload = {
  title: string;
  message: string;
  tone?: "info" | "warning" | "error";
};

type ConfirmPayload = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "info" | "warning" | "error";
};

type UiPopupContextValue = {
  showAlert: (payload: AlertPayload) => void;
  confirm: (payload: ConfirmPayload) => Promise<boolean>;
};

const UiPopupContext = createContext<UiPopupContextValue | null>(null);

const toneStyle: Record<string, string> = {
  info: "border-blue-500/40",
  warning: "border-amber-500/50",
  error: "border-red-500/60",
};

export const UiPopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertPayload, setAlertPayload] = useState<AlertPayload | null>(null);
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);

  const showAlert = useCallback((payload: AlertPayload) => {
    setAlertPayload(payload);
  }, []);

  const confirm = useCallback((payload: ConfirmPayload) => {
    setConfirmPayload(payload);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmPayload(null);
    if (confirmResolver.current) {
      confirmResolver.current(value);
      confirmResolver.current = null;
    }
  }, []);

  const value = useMemo(() => ({ showAlert, confirm }), [showAlert, confirm]);

  return (
    <UiPopupContext.Provider value={value}>
      {children}

      {alertPayload && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
          <div className={`w-full max-w-md rounded-2xl border bg-[#16182a] p-6 shadow-2xl ${toneStyle[alertPayload.tone || "warning"]}`}>
            <div className="text-xl font-semibold text-gray-100">{alertPayload.title}</div>
            <div className="mt-3 text-sm leading-6 text-gray-300">{alertPayload.message}</div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertPayload(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPayload && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
          <div className={`w-full max-w-md rounded-2xl border bg-[#16182a] p-6 shadow-2xl ${toneStyle[confirmPayload.tone || "warning"]}`}>
            <div className="text-xl font-semibold text-gray-100">{confirmPayload.title}</div>
            <div className="mt-3 text-sm leading-6 text-gray-300">{confirmPayload.message}</div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200"
              >
                {confirmPayload.cancelLabel || "Отмена"}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                {confirmPayload.confirmLabel || "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiPopupContext.Provider>
  );
};

export function useUiPopup() {
  const ctx = useContext(UiPopupContext);
  if (!ctx) throw new Error("useUiPopup must be used within UiPopupProvider");
  return ctx;
}
