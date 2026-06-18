import React from "react";

interface ResetConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2b46] bg-[#16182a] p-6 shadow-2xl">
        <div className="text-xl font-semibold text-gray-100">{title}</div>
        <div className="mt-3 text-sm leading-6 text-gray-300">{description}</div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200 transition hover:bg-[#1c2035] disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? "Выполняю..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetConfirmModal;
