import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const filtered = prev.filter((t) => t.message !== message);
      return [...filtered.slice(-1), { id, message, variant }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

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
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              aria-label="Dismiss notification"
              className="p-1 text-white/60 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
