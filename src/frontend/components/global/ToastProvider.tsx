'use client';

// ============================================================
// CapitalForge — Global Toast Notification System
//
// Provides a context-based toast system with auto-dismiss,
// stacking (max 3 visible), and type-based styling.
//
// Usage:
//   import { useToast } from '@/components/global/ToastProvider';
//   const toast = useToast();
//   toast.success('Saved successfully');
//   toast.error('Something failed');
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4_000;

const TOAST_STYLES: Record<ToastType, { bg: string; icon: string; iconColor: string }> = {
  success: { bg: 'border-emerald-500/30 bg-emerald-500/10', icon: 'M5 13l4 4L19 7', iconColor: 'text-emerald-400' },
  error:   { bg: 'border-red-500/30 bg-red-500/10',       icon: 'M6 18L18 6M6 6l12 12',   iconColor: 'text-red-400' },
  warning: { bg: 'border-amber-500/30 bg-amber-500/10',   icon: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', iconColor: 'text-amber-400' },
  info:    { bg: 'border-sky-500/30 bg-sky-500/10',       icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', iconColor: 'text-sky-400' },
};

// ── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

let idCounter = 0;
function nextId(): string {
  return `toast-${++idCounter}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId();
      setToasts((prev) => {
        // Keep at most MAX_VISIBLE - 1 so the new one fits
        const trimmed = prev.length >= MAX_VISIBLE ? prev.slice(1) : prev;
        return [...trimmed, { id, type, message }];
      });

      // Auto-dismiss
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  // Cleanup on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value: ToastContextValue = {
    success: useCallback((msg: string) => addToast('success', msg), [addToast]),
    error:   useCallback((msg: string) => addToast('error', msg), [addToast]),
    warning: useCallback((msg: string) => addToast('warning', msg), [addToast]),
    info:    useCallback((msg: string) => addToast('info', msg), [addToast]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container — bottom-right */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto flex w-80 items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm animate-fade-in ${style.bg}`}
            >
              {/* Icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
              </svg>

              {/* Message */}
              <p className="flex-1 text-sm text-slate-200">{toast.message}</p>

              {/* Dismiss */}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-slate-400 transition hover:text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                aria-label="Dismiss notification"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}
