import type { ToastNotification } from "../types";

interface ToastProps {
  toast: ToastNotification | null;
}

export function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-icon">
        {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
      </span>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
