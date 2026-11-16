import React, { useEffect, useState } from 'react';
import { Database, Lock, RefreshCw, Trash2 } from 'lucide-react';
import {
  deleteStorageCategory,
  getStorageCategoryBreakdown,
  type StorageCategoryKey,
  type StorageCategorySummary,
} from '../../db/database';
import type { AppSettings } from '../../types';
import { useToast } from '../ui/ToastProvider';

interface PrivacyInventorySectionProps {
  settings: AppSettings;
}

function formatKb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PrivacyInventorySection: React.FC<PrivacyInventorySectionProps> = ({ settings }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<StorageCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmKey, setConfirmKey] = useState<StorageCategoryKey | null>(null);

  const loadBreakdown = async () => {
    setLoading(true);
    try {
      const next = await getStorageCategoryBreakdown();
      setRows(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBreakdown();
  }, []);

  const handleDeleteCategory = async (cat: StorageCategorySummary) => {
    await deleteStorageCategory(cat.key);
    setConfirmKey(null);
    await loadBreakdown();
    showToast(`Cleared "${cat.label}" from this device`, 'info');
  };

  const totalBytes = rows.reduce((sum, r) => sum + r.approxBytes, 0);

  return (
    <section className="ascend-card p-4 space-y-3 text-xs" id="what-app-knows">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--accent)]" /> What the app knows about me
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Zero analytics, zero ad trackers. Every category below lives locally on your phone (
            <span className="font-mono-num font-semibold">{formatKb(totalBytes)}</span> total).
          </p>
        </div>
        <button
          type="button"
          onClick={loadBreakdown}
          aria-label="Refresh storage inventory"
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((cat) => {
          const confirming = confirmKey === cat.key;
          return (
            <div
              key={cat.key}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {cat.label}
                  </span>
                  <span className="font-mono-num text-[11px] text-[var(--accent)]">
                    {cat.count} items · {formatKb(cat.approxBytes)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {cat.detail}
                </p>
              </div>

              {confirming ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white font-bold min-h-[34px]"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmKey(null)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 font-semibold min-h-[34px]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={cat.count === 0}
                  onClick={() => setConfirmKey(cat.key)}
                  aria-label={`Delete ${cat.label}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-rose-500 font-semibold min-h-[36px] disabled:opacity-35 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        <p className="font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
          <Lock className="w-3.5 h-3.5 text-emerald-500" /> What leaves your phone
        </p>
        <p>
          • <strong>AI Food Scan ({settings.onlineFoodEnabled ? 'ON' : 'OFF'}):</strong> Only sends the compressed food photo when you tap Scan Food.
        </p>
        <p>
          • <strong>Online AI Coach ({settings.onlineCoachEnabled ? 'ON' : 'OFF'}):</strong> Only sends a short numbers + confirmed About me summary (no photos, no face scans, no private Quit habit names) when you ask a question.
        </p>
        <p>
          • <strong>Everything else:</strong> Stays 100% offline in IndexedDB with zero telemetry.
        </p>
      </div>
    </section>
  );
};
