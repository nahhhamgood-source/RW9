import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PWAUpdateBanner: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      // Ignore registration error in non-SW preview frames
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,420px)] rounded-2xl bg-slate-900 text-white dark:bg-[#101A2B] border border-[var(--accent)]/40 shadow-xl px-4 py-3 flex items-center justify-between gap-3 no-print"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold">New version available</p>
        <p className="text-[11px] text-slate-300">Refresh to load the latest ASCEND update.</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[38px]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss update banner"
          className="p-2 rounded-xl text-slate-400 hover:text-white min-h-[38px] min-w-[38px] flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
