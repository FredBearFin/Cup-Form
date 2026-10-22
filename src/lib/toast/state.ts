export type ToastSeverity = "Success" | "Error" | "Warning" | "Info";

export type Toast = { id: number; severity: ToastSeverity; message: string };

let nextId = 1;

/// Op_ShowToast: the new toast replaces whatever is active.
export function makeToast(severity: ToastSeverity, message: string): Toast {
  return { id: nextId++, severity, message };
}

/// Op_DismissToast. Takes the id so a stale auto-dismiss timer can't close a
/// newer toast that replaced the one it was started for.
export function dismissToast(active: Toast | null, id: number): Toast | null {
  return active?.id === id ? null : active;
}

/// Errors stay longer so they can be read; auto-dismiss is the UI's job.
export const toastDurationMs = (severity: ToastSeverity) =>
  severity === "Error" || severity === "Warning" ? 7000 : 4000;
