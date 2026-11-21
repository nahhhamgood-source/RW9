import React, { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { saveOneQuestionDayOutcome, saveSkippedGapDay } from '../../db/database';
import { ARABIC_HINTS } from '../../i18n/arabicHints';
import { en } from '../../i18n/en';
import { toLocalDateKey } from '../../lib/date';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, EventOutcomeLevel } from '../../types';

interface DailyOneQuestionModalProps {
  open: boolean;
  settings: AppSettings;
  dateKey?: string;
  onClose: () => void;
}

export const DailyOneQuestionModal: React.FC<DailyOneQuestionModalProps> = ({
  open,
  settings,
  dateKey = toLocalDateKey(),
  onClose,
}) => {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handlePick = async (level: EventOutcomeLevel) => {
    setSaving(true);
    try {
      await saveOneQuestionDayOutcome(dateKey, level);
      showToast('Saved daily eating estimate. Edit or swap anytime.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await saveSkippedGapDay(dateKey);
      showToast('Skipped today cleanly — streak unchanged.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm no-print">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              {en.realLife.oneQuestionPrompt}
            </h3>
            {settings.arabicHintsEnabled && (
              <p className="text-xs text-slate-400 mt-0.5">{ARABIC_HINTS.howWasEating}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily check-in"
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          One tap logs an honest estimated day total so you do not have to remember every bite.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'light', title: 'Light', sub: 'about 1200–1700 kcal' },
            { id: 'normal', title: 'Normal', sub: 'about 1800–2300 kcal' },
            { id: 'heavy', title: 'Heavy', sub: 'about 2350–2950 kcal' },
            { id: 'very_heavy', title: 'Big event', sub: 'about 2800–3600 kcal' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={saving}
              onClick={() => handlePick(opt.id)}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-left hover:border-[var(--accent)] min-h-[64px]"
            >
              <p className="text-sm font-bold text-slate-900 dark:text-white">{opt.title}</p>
              <p className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">{opt.sub}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleSkip}
          className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-xs font-bold text-slate-600 dark:text-slate-300 min-h-[42px] inline-flex items-center justify-center gap-1.5"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {en.realLife.skipDontTrack}
        </button>
      </div>
    </div>
  );
};
