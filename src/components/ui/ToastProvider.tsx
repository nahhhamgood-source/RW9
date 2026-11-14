import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'warning' | 'info';

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success', options?: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const filtered = prev.filter((t) => t.message !== message);
        return [
          ...filtered.slice(-1),
          {
            id,
            message,
            variant,
            actionLabel: options?.actionLabel,
            onAction: options?.onAction,
          },
        ];
      });
      const timeoutMs = options?.durationMs ?? (options?.actionLabel ? 6500 : 3200);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeoutMs);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[92vw] max-w-md pointer-events-none no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 dark:bg-[#080D0A]/95 text-white border border-emerald-500/25 shadow-xl backdrop-blur-xl text-sm"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.variant === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--accent)]" />}
              {t.variant === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />}
              {t.variant === 'info' && <Info className="w-4 h-4 shrink-0 text-sky-400" />}
              <span className="truncate font-medium">{t.message}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    const cb = t.onAction;
                    dismiss(t.id);
                    cb?.();
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[34px]"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="p-1 text-white/60 hover:text-white shrink-0 min-h-[34px] min-w-[34px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
