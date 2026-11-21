import React, { useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, Dumbbell, Flame, ShieldAlert, Trophy, Zap } from 'lucide-react';
import { db, getOrCreateDailyLog, saveAndVerifyProfile } from '../../db/database';
import { formatDisplayNumber } from '../../i18n/arabicHints';
import {
  PASSIVE_CUT_SAFETY_CARD,
  WEIGH_IN_WEEK_GUIDANCE,
  computeFightCampPlan,
} from '../../lib/fightCamp';
import { computeNutritionAverages } from '../../lib/realLifeFood';
import type {
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  MealScanEntry,
  TrainingDayType,
  UserProfile,
} from '../../types';
import { useToast } from '../ui/ToastProvider';

interface FightCampCardProps {
  profile: UserProfile;
  bodyMetrics: BodyMetricEntry[];
  dailyLogs?: DailyLog[];
  mealScans?: MealScanEntry[];
  settings?: AppSettings;
  todayLog?: DailyLog | null;
  todayMode: TrainingDayType;
  todayKey: string;
  arabicDigits?: boolean;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'body' | 'sleep' | 'mood' | 'photo' | 'height') => void;
  onNavigate: (screen: string, subTab?: string) => void;
  onLoggedTraining: () => void;
}

export const FightCampCard: React.FC<FightCampCardProps> = ({
  profile,
  bodyMetrics,
  dailyLogs,
  mealScans,
  settings,
  todayLog,
  todayMode,
  todayKey,
  arabicDigits = false,
  onOpenQuickLog,
  onNavigate,
  onLoggedTraining,
}) => {
  const { showToast } = useToast();
  const [expandedInfo, setExpandedInfo] = useState(false);

  const camp = useMemo(
    () =>
      computeFightCampPlan({
        profile,
        bodyMetrics,
        todayLog,
        todayMode,
        todayKey,
      }),
    [profile, bodyMetrics, todayLog, todayMode, todayKey]
  );

  const foodAvg = useMemo(
    () =>
      computeNutritionAverages({
        todayKey,
        daysBack: 7,
        dailyLogs: dailyLogs ?? (todayLog ? [todayLog] : []),
        mealScans: mealScans ?? [],
        settings,
      }),
    [todayKey, dailyLogs, todayLog, mealScans, settings]
  );

  const hasRecentEvent = useMemo(
    () =>
      Boolean(todayLog?.eventMode?.active) ||
      foodAvg.summaries.some((s) => s.hasEvent),
    [todayLog, foodAvg.summaries]
  );

  if (!camp.allowed) {
    return (
      <section className="ascend-card p-4 border border-sky-500/30 bg-sky-500/10 space-y-2 text-xs">
        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-sky-400" />
          Fight Camp weight safety
        </p>
        <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{camp.blockedReason}</p>
      </section>
    );
  }

  if (!camp.active) return null;

  const progressPct = (() => {
    const startKg = profile.aboutMe?.currentWeightKg ?? camp.currentWeightKg;
    if (!camp.targetWeightKg || startKg <= camp.targetWeightKg) return 100;
    const total = startKg - camp.targetWeightKg;
    const done = Math.max(0, startKg - (camp.avg7dWeightKg ?? camp.currentWeightKg));
    return Math.max(4, Math.min(100, Math.round((done / total) * 100)));
  })();

  const statusLabel =
    camp.status === 'ahead'
      ? 'Ahead / at weight'
      : camp.status === 'on_track'
      ? 'On track'
      : camp.status === 'behind'
      ? 'Needs time or class talk'
      : camp.status === 'insufficient_data'
      ? 'Log weigh-ins'
      : 'Set target kg';

  const statusClass =
    camp.status === 'ahead' || camp.status === 'on_track'
      ? 'bg-emerald-500/15 text-emerald-500'
      : 'bg-sky-500/15 text-sky-400';

  const handleTapEnergy = async (val: number) => {
    await getOrCreateDailyLog(todayKey);
    await db.dailyLogs.update(todayKey, { energy: val, updatedAt: Date.now() });
    showToast(
      val <= 2
        ? 'Energy noted — eased today’s deficit automatically so recovery stays solid'
        : `Energy ${val}/5 saved`
    );
  };

  const handleApplySundayAdjust = async () => {
    if (!camp.sundayAdjustedCalories) return;
    await saveAndVerifyProfile({
      ...profile,
      calorieGoal: camp.sundayAdjustedCalories,
      proteinTargetG: camp.proteinTargetG,
    });
    showToast(`Updated camp target to ${camp.sundayAdjustedCalories} kcal`);
  };

  return (
    <section className="ascend-card p-4 space-y-3 border border-[var(--accent)]/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold flex items-center gap-1.5">
              Fight Camp
              {camp.daysToTournament !== null && (
                <span className="font-mono-num text-xs text-[var(--accent)]">
                  · {formatDisplayNumber(camp.daysToTournament, arabicDigits)}d left
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {camp.tournamentDate ? `Event ${camp.tournamentDate}` : 'Date not set yet'} · Weigh-in:{' '}
              {camp.weighInRule === 'same_day'
                ? 'same-day'
                : camp.weighInRule === 'day_before'
                ? 'day-before'
                : 'not sure'}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Calm stats strip & calm progress bar */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {camp.avg7dWeightKg ? '7-day avg' : 'Current'}
          </p>
          <p className="font-mono-num text-sm font-bold">
            {formatDisplayNumber(camp.avg7dWeightKg ?? camp.currentWeightKg, arabicDigits)} kg
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Target</p>
          <p className="font-mono-num text-sm font-bold">
            {camp.targetWeightKg ? `${formatDisplayNumber(camp.targetWeightKg, arabicDigits)} kg` : '—'}
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Left</p>
          <p className="font-mono-num text-sm font-bold">
            {camp.kgLeft !== null ? `${formatDisplayNumber(camp.kgLeft, arabicDigits)} kg` : '—'}
          </p>
        </div>
      </div>

      {camp.targetWeightKg && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {camp.realityCheckLine}
          </p>
        </div>
      )}

      {camp.overFivePercentCut && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-slate-700 dark:text-slate-200">
          <p className="font-bold">Talk to your coach and a doctor</p>
          <p className="text-[11px] mt-0.5 leading-relaxed">
            Dropping {camp.cutPctOfBodyWeight}% of your body weight is a big drop. Discuss safe class options with your coach and a doctor.
          </p>
        </div>
      )}

      {/* Fuel + Performance Check */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Fuel: {formatDisplayNumber(camp.dailyCalorieTarget, arabicDigits)} kcal ·{' '}
            {formatDisplayNumber(camp.proteinTargetG, arabicDigits)}g protein
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Floor {camp.calorieFloor} kcal
          </span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300">{camp.trainingDayTip}</p>
        {foodAvg.avgCalories !== null && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono-num">
            7d food avg: <strong>{formatDisplayNumber(foodAvg.avgCalories, arabicDigits)} kcal</strong> ·{' '}
            {formatDisplayNumber(foodAvg.avgProteinG ?? 0, arabicDigits)}g protein ({foodAvg.countedDays} tracked{' '}
            {foodAvg.countedDays === 1 ? 'day' : 'days'}, untracked excluded)
          </p>
        )}
        {hasRecentEvent && (
          <p className="text-[11px] text-sky-600 dark:text-sky-300">
            One event barely moves your weekly trend — tomorrow stays a normal day.
          </p>
        )}
        {camp.performanceEaseApplied && camp.performanceNote && (
          <p className="text-[11px] font-semibold text-emerald-500">{camp.performanceNote}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-[var(--accent)]" /> Today&apos;s energy:
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => handleTapEnergy(lvl)}
                className={`w-9 h-9 rounded-lg font-mono-num text-xs font-bold transition ${
                  todayLog?.energy === lvl
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tiny 1-tap camp actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => onOpenQuickLog('body')}
          className="py-2.5 px-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
        >
          Log weight
        </button>
        <button
          type="button"
          onClick={() => onNavigate('food')}
          className="py-2.5 px-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
        >
          Eat to plan
        </button>
        <button
          type="button"
          onClick={() => onOpenQuickLog('sleep')}
          className="py-2.5 px-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
        >
          Sleep check
        </button>
        <button
          type="button"
          onClick={onLoggedTraining}
          className="py-2.5 px-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] inline-flex items-center justify-center gap-1"
        >
          <Dumbbell className="w-3.5 h-3.5" /> Trained
        </button>
      </div>

      {camp.sundayAutoAdjustNote && (
        <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-700 dark:text-slate-200">{camp.sundayAutoAdjustNote}</span>
          {camp.sundayAdjustedCalories !== null && camp.sundayAdjustedCalories !== profile.calorieGoal && (
            <button
              type="button"
              onClick={handleApplySundayAdjust}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[36px] inline-flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Apply
            </button>
          )}
        </div>
      )}

      {/* Expandable Weigh-in Week Info & Passive Safety Card */}
      <button
        type="button"
        onClick={() => setExpandedInfo((v) => !v)}
        className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between min-h-[44px]"
      >
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
          Fight week basics &amp; safety notes
        </span>
        {expandedInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expandedInfo && (
        <div className="space-y-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-1.5">
            <p className="font-bold">Weigh-in week card (info only)</p>
            <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              {WEIGH_IN_WEEK_GUIDANCE.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-1">
            <p className="font-bold text-[11px]">No unsafe cut instructions</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {PASSIVE_CUT_SAFETY_CARD}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
