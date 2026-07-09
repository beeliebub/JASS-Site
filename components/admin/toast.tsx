"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Toast = {
  id: number;
  message: string;
  variant: "error" | "success";
  /** True once dismiss has been requested -- swaps to the exit animation
   *  (see `.toast-exit`, app/globals.css) instead of vanishing instantly. */
  leaving?: boolean;
};

type ToastContextValue = {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
// Must match `.toast-exit`'s animation-duration in app/globals.css -- the
// toast is kept in the list (playing the exit animation) for this long
// before actually being removed.
const EXIT_MS = 150;

/**
 * Minimal hand-rolled toast primitive (no toast library installed). Used to
 * surface save failures from optimistic in-place edits — see
 * components/admin/editable-text.tsx.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => remove(id), EXIT_MS);
    },
    [remove],
  );

  const push = useCallback(
    (message: string, variant: Toast["variant"]) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showError: (message: string) => push(message, "error"),
      showSuccess: (message: string) => push(message, "success"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              toast.leaving ? "toast-exit" : "toast-enter"
            } ${
              toast.variant === "error"
                ? "border-danger/40 bg-surface-2 text-foreground"
                : "border-primary/40 bg-surface-2 text-foreground"
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                toast.variant === "error" ? "bg-danger" : "bg-primary"
              }`}
            />
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-muted transition hover:text-foreground motion-safe:active:scale-90"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
