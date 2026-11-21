import React, { useMemo, useState } from 'react';
import { ImagePlus, Mic, PartyPopper, Repeat2, SkipForward } from 'lucide-react';
import { logSameAsUsualMeal, saveSkippedGapDay } from '../../db/database';
import { ARABIC_HINTS } from '../../i18n/arabicHints';
import { en } from '../../i18n/en';
import { addDays, toLocalDateKey } from '../../lib/date';
import { getRealLifeSettings } from '../../lib/realLifeFood';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, DailyLog, MealScanEntry, MealType } from '../../types';

interface NextMorningCheckinCardProps {
  settings: AppSettings;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  onOpenEventForDate: (dateKey: string) => void;
  onOpenFoodForDate: (dateKey: string, slot: MealType) => void;
  onOpenGalleryImport: () => void;
}

export const NextMorningCheckinCard: React.FC<NextMorningCheckinCardProps> = ({
  settings,
  dailyLogs,
  mealScans,
  onOpenEventForDate,
  onOpenFoodForDate,
  onOpenGalleryImport,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const yesterdayKey = addDays(todayKey, -1);
  const realLife = useMemo(() => getRealLifeSettings(settings), [settings]);
  const [dismissedSlots, setDismissedSlots] = useState<MealType[]>([]);

  const yesterdayLog = useMemo(
    () => dailyLogs.find((l) => l.date === yesterdayKey),
    [dailyLogs, yesterdayKey]
  );

  const yesterdayMeals = useMemo(
    () => mealScans.filter((m) => m.date === yesterdayKey),
    [mealScans, yesterdayKey]
  );

  const missingSlots = useMemo(() => {
    const present = new Set(yesterdayMeals.map((m) => m.mealType || 'lunch'));
    return (['breakfast', 'lunch', 'dinner'] as MealType[]).filter(
      (s) => !present.has(s) && !dismissedSlots.includes(s)
    );
  }, [yesterdayMeals, dismissedSlots]);

  const shouldHide =
    !realLife.nextMorningCheckinEnabled ||
    Boolean(settings.skippedGapCheckinDates?.includes(yesterdayKey)) ||
    Boolean(yesterdayLog?.eventMode?.outcome) ||
    yesterdayLog?.dayStatus === 'complete' ||
    missingSlots.length === 0;

  if (shouldHide) return null;

  const handleSameAsUsual = async (slot: MealType) => {
    const added = await logSameAsUsualMeal(yesterdayKey, slot);
    if (!added) {
      showToast(`No usual ${en.meals[slot].toLowerCase()} saved yet — say it or tap Event.`, 'info');
      onOpenFoodForDate(yesterdayKey, slot);
    } else {
      showToast(`Filled yesterday's ${en.meals[slot].toLowerCase()} (${added.mealTitle})`);
    }
  };

  const handleSkipForeverForYesterday = async () => {
    await saveSkippedGapDay(yesterdayKey);
    showToast('Got it — skipped yesterday with zero effect on your streak.');
  };

  return (
    <div className="ascend-card p-4 space-y-3 border border-[var(--accent)]/25 bg-[var(--accent-soft)]/35">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {en.realLife.yesterdayGapsTitle}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            Tap what fits or skip — gaps never break your streak.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSkipForeverForYesterday}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-200 min-h-[34px] shrink-0"
        >
          <SkipForward className="w-3 h-3" />
          {en.realLife.skipDontTrack}
          {settings.arabicHintsEnabled && (
            <span className="text-[10px] opacity-75">· {ARABIC_HINTS.skipDontTrack}</span>
          )}
        </button>
      </div>

      {realLife.justTakePhotosMode && realLife.galleryImportEnabled && (
        <button
          type="button"
          onClick={onOpenGalleryImport}
          className="w-full p-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100"
        >
          <span className="inline-flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-[var(--accent)]" />
            Took photos yesterday? Pick them from gallery
          </span>
          <span className="text-[var(--accent)]">Pick</span>
        </button>
      )}

      <div className="space-y-2">
        {missingSlots.map((slot) => (
          <div
            key={slot}
            className="p-2.5 rounded-xl bg-white/80 dark:bg-[#0D131F]/90 border border-slate-200 dark:border-white/10 space-y-2"
          >
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              No log for {en.meals[slot].toLowerCase()}. Want to fill it quickly or leave it?
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleSameAsUsual(slot)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-bold min-h-[32px]"
              >
                <Repeat2 className="w-3 h-3" />
                {en.realLife.sameAsUsual}
              </button>
              <button
                type="button"
                onClick={() => onOpenEventForDate(yesterdayKey)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[11px] font-bold min-h-[32px]"
              >
                <PartyPopper className="w-3 h-3 text-[var(--accent)]" />
                Event
              </button>
              <button
                type="button"
                onClick={() => onOpenFoodForDate(yesterdayKey, slot)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[11px] font-bold min-h-[32px]"
              >
                <Mic className="w-3 h-3 text-[var(--accent)]" />
                Say it
              </button>
              <button
                type="button"
                onClick={() => setDismissedSlots((prev) => [...prev, slot])}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 min-h-[32px]"
              >
                Skipped meal
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
