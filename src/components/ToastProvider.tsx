"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  dismissToast,
  makeToast,
  toastDurationMs,
  type Toast,
  type ToastSeverity,
} from "@/lib/toast/state";

type ToastApi = {
  show: (severity: ToastSeverity, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const STYLES: Record<ToastSeverity, string> = {
  Success: "border-green-300 bg-green-50 text-green-900",
  Error: "border-red-300 bg-red-50 text-red-900",
  Warning: "border-amber-300 bg-amber-50 text-amber-900",
  Info: "border-neutral-300 bg-white text-neutral-900",
};

/// Holds the single active toast (Op_ShowToast replaces it, Op_DismissToast
/// clears it) and auto-dismisses after a severity-dependent delay.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Toast | null>(null);

  const show = useCallback(
    (severity: ToastSeverity, message: string) => setActive(makeToast(severity, message)),
    [],
  );
  // Stable identity: consumers (e.g. the query client's mutation error
  // handler) capture this once and must keep working.
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show("Success", m),
      error: (m) => show("Error", m),
      warning: (m) => show("Warning", m),
      info: (m) => show("Info", m),
      dismiss: () => setActive(null),
    }),
    [show],
  );

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(
      () => setActive((current) => dismissToast(current, active.id)),
      toastDurationMs(active.severity),
    );
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
        {active && (
          <div
            key={active.id}
            role={active.severity === "Error" ? "alert" : "status"}
            data-severity={active.severity}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg ${STYLES[active.severity]}`}
          >
            <p className="flex-1">{active.message}</p>
            <button
              onClick={() => setActive((c) => dismissToast(c, active.id))}
              aria-label="Dismiss notification"
              className="-my-1 text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
