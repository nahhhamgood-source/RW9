import React, { useMemo, useState } from 'react';
import { Calendar, Check, Download, PartyPopper, Repeat2, SkipForward, Sparkles, X } from 'lucide-react';
import {
  db,
  isUnder18OrGrowing,
  logSameAsUsualMeal,
  prepareSuggestedTomorrowPlan,
  saveAndVerifyProfile,
  saveSkippedGapDay,
  startEventModeForDay,
} from '../../db/database';
import { addDays, toLocalDateKey } from '../../lib/date';
import { evaluateWeeklyWeightAdjustment } from '../../lib/nutrition';
import {
  computeAdaptiveMaintenanceCalibration,
  computeNutritionAverages,
} from '../../lib/realLifeFood';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  MealScanEntry,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
} from '../../types';
import { useToast } from '../ui/ToastProvider';

interface WeeklyLeaderReviewModalProps {
  profile: UserProfile;
  settings: AppSettings;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  workouts: WorkoutSession[];
  bodyMetrics: BodyMetricEntry[];
  scans: FaceScanResult[];
  onClose: () => void;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'body' | 'sleep' | 'mood' | 'photo' | 'height') => void;
  onNavigate: (screen: string, subTab?: string) => void;
}

export const WeeklyLeaderReviewModal: React.FC<WeeklyLeaderReviewModalProps> = ({
  profile,
  settings,
  tasks,
  completions,
  dailyLogs,
  mealScans,
  workouts,
  bodyMetrics,
  scans,
  onClose,
  onOpenQuickLog,
  onNavigate,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const cutoff = addDays(todayKey, -6);
  const hideCut = isUnder18OrGrowing(profile);

  const [aiPolish, setAiPolish] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [stepperOpen, setStepperOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const nutritionAvg = useMemo(
    () =>
      computeNutritionAverages({
        todayKey,
        daysBack: 7,
        dailyLogs,
        mealScans,
        settings,
      }),
    [todayKey, dailyLogs, mealScans, settings]
  );

  const adaptiveCalib = useMemo(
    () =>
      computeAdaptiveMaintenanceCalibration({
        todayKey,
        profile,
        dailyLogs,
        mealScans,
        bodyMetrics,
        settings,
      }),
    [todayKey, profile, dailyLogs, mealScans, bodyMetrics, settings]
  );

  const gapDays = useMemo(
    () =>
      nutritionAvg.summaries.filter(
        (s) =>
          (s.status === 'not_tracked' || s.status === 'partial') &&
          !settings.skippedGapCheckinDates?.includes(s.date)
      ),
    [nutritionAvg.summaries, settings.skippedGapCheckinDates]
  );

  const activeGapDay = gapDays[Math.min(stepIdx, Math.max(0, gapDays.length - 1))] ?? null;

  const stats = useMemo(() => {
    const weekWorkouts = workouts.filter((w) => w.date >= cutoff && w.date <= todayKey);
    const weekSleep = dailyLogs.filter((l) => l.date >= cutoff && l.date <= todayKey && l.sleepHours > 0);
    const targetSleep = profile.targetSleepHours || 8;
    const sleepGoodNights = weekSleep.filter((l) => l.sleepHours >= targetSleep - 0.75).length;
    const sleepConsistencyPct =
      weekSleep.length > 0 ? Math.round((sleepGoodNights / weekSleep.length) * 100) : null;

    const avgCalories = nutritionAvg.avgCalories;
    const avgProtein = nutritionAvg.avgProteinG;

    const skinTasks = tasks.filter(
      (t) => t.enabled && !t.scheduledDate && (t.category === 'skin' || t.protocolId.includes('face-cleanse'))
    );
    const skinCompletions = completions.filter(
      (c) => c.date >= cutoff && c.date <= todayKey && skinTasks.some((t) => t.id === c.taskId)
    );
    const skinPct =
      skinTasks.length > 0
        ? Math.min(100, Math.round((skinCompletions.length / (skinTasks.length * 7)) * 100))
        : null;

    const weightAdjust = evaluateWeeklyWeightAdjustment(profile, bodyMetrics, todayKey);
    const recentScans = scans.filter((s) => s.date >= cutoff && s.date <= todayKey).length;

    // Pick What went well & ONE thing to fix
    let wentWell = 'You showed up and kept real data instead of guessing.';
    if (weekWorkouts.length >= Math.max(2, (profile.workoutDaysPerWeek || 3) - 1)) {
      wentWell = `Training stayed solid with ${weekWorkouts.length} logged sessions this week.`;
    } else if ((sleepConsistencyPct ?? 0) >= 70) {
      wentWell = `Sleep timing was steady (${sleepConsistencyPct}% on target).`;
    } else if ((skinPct ?? 0) >= 70) {
      wentWell = `Face & skincare routine hit ${skinPct}% consistency this week.`;
    } else if (avgProtein !== null && avgProtein >= (profile.proteinTargetG || 120) * 0.85) {
      wentWell = `Protein averaged ${avgProtein}g/day — right near your target.`;
    }

    let oneFix = 'Log 2 quick weigh-ins and 3 nights of sleep so the plan knows your real trend.';
    let oneFixAction: { label: string; run: () => void } = {
      label: 'Log sleep',
      run: () => {
        onClose();
        onOpenQuickLog('sleep');
      },
    };

    if (weekSleep.length >= 2 && (sleepConsistencyPct ?? 100) < 60) {
      oneFix = 'Move bedtime 25 min earlier on training nights to keep sleep above 7h.';
      oneFixAction = {
        label: 'Set sleep window',
        run: () => {
          onClose();
          onNavigate('settings');
        },
      };
    } else if (avgProtein !== null && avgProtein < (profile.proteinTargetG || 120) * 0.75) {
      oneFix = `Add one 30g protein anchor at breakfast (eggs, areesh, or yogurt) to raise your ${avgProtein}g avg.`;
      oneFixAction = {
        label: 'Open Food swaps',
        run: () => {
          onClose();
          onNavigate('food');
        },
      };
    } else if (weekWorkouts.length === 0) {
      oneFix = 'Schedule just two 30-min sessions next week and tap "Trained" right after.';
      oneFixAction = {
        label: 'Open Workouts',
        run: () => {
          onClose();
          onNavigate('health', 'workouts');
        },
      };
    } else if (weightAdjust.status === 'insufficient_data') {
      oneFix = 'Tap morning weight twice next week so calorie guidance uses your real 7-day trend.';
      oneFixAction = {
        label: 'Log weight',
        run: () => {
          onClose();
          onOpenQuickLog('body');
        },
      };
    }

    const nextCal =
      !hideCut && weightAdjust.suggestedCalorieGoal !== null
        ? weightAdjust.suggestedCalorieGoal
        : profile.calorieGoal;

    return {
      workoutCount: weekWorkouts.length,
      sleepLogsCount: weekSleep.length,
      sleepConsistencyPct,
      mealDaysCount: nutritionAvg.countedDays,
      avgCalories,
      avgProtein,
      skinPct,
      weightAdjust,
      recentScans,
      wentWell,
      oneFix,
      oneFixAction,
      nextCal,
    };
  }, [
    workouts,
    dailyLogs,
    nutritionAvg,
    tasks,
    completions,
    bodyMetrics,
    scans,
    profile,
    cutoff,
    todayKey,
    hideCut,
    onClose,
    onNavigate,
    onOpenQuickLog,
  ]);

  const handleAcceptNextWeek = async () => {
    if (!hideCut && stats.nextCal !== profile.calorieGoal) {
      await saveAndVerifyProfile({ ...profile, calorieGoal: stats.nextCal });
    }
    await db.settings.update('app', { lastWeeklyReviewDate: todayKey });
    await prepareSuggestedTomorrowPlan(profile, settings);
    showToast('Next week plan accepted & tomorrow prepared');
    onClose();
  };

  const handleAiPolish = async () => {
    if (!settings.onlineCoachEnabled) {
      setAiPolish(
        `Offline template: Solid ${stats.workoutCount} session week. Focus on one change only next week — ${stats.oneFix}`
      );
      return;
    }
    setPolishing(true);
    try {
      const resp = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:
            'Give a 2-sentence encouraging Sunday review summary with zero hype and one practical focus for next week.',
          contextSummary: {
            workouts: stats.workoutCount,
            sleepPct: stats.sleepConsistencyPct,
            avgProtein: stats.avgProtein,
            oneFix: stats.oneFix,
          },
        }),
      });
      if (!resp.ok) throw new Error('Coach offline');
      const data = (await resp.json()) as { answer?: string };
      setAiPolish(
        data.answer?.trim() ||
          `Steady week: ${stats.workoutCount} sessions logged. Keep it simple — ${stats.oneFix}`
      );
    } catch {
      setAiPolish(
        `Offline template: ${stats.wentWell} Next week’s one focus: ${stats.oneFix}`
      );
    } finally {
      setPolishing(false);
    }
  };

  const handleExportPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0B0F1A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('ASCEND — WEEKLY LEADER REVIEW', 48, 72);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`Week ending ${todayKey}`, 48, 108);

    const rows = [
      `Training sessions: ${stats.workoutCount}`,
      `Sleep consistency: ${stats.sleepConsistencyPct !== null ? `${stats.sleepConsistencyPct}%` : 'Not enough data yet'}`,
      `Avg daily calories: ${stats.avgCalories !== null ? `${stats.avgCalories} kcal` : 'Not enough data yet'}`,
      `Avg daily protein: ${stats.avgProtein !== null ? `${stats.avgProtein} g` : 'Not enough data yet'}`,
      `Skin & face consistency: ${stats.skinPct !== null ? `${stats.skinPct}%` : 'Not enough data yet'}`,
    ];

    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 24px system-ui, sans-serif';
    rows.forEach((line, idx) => {
      ctx.fillText(line, 48, 185 + idx * 54);
    });

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('What went well:', 48, 500);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '21px system-ui, sans-serif';
    ctx.fillText(stats.wentWell.slice(0, 62), 48, 536);

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('ONE thing to fix:', 48, 620);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '21px system-ui, sans-serif';
    ctx.fillText(stats.oneFix.slice(0, 62), 48, 656);

    ctx.fillStyle = '#64748B';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Private habits excluded · Real on-device logs only', 48, 845);

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend-weekly-review-${todayKey}.png`;
    a.click();
    showToast('Saved weekly summary image');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-[26px] bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-sky-400/20 p-5 max-h-[90dvh] overflow-y-auto shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-[var(--accent)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Sunday ritual
            </p>
            <h2 className="font-display text-xl font-bold">Weekly Leader Review</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real 7-day scoreboard */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">Training</p>
            <p className="font-mono-num text-base font-bold mt-0.5">{stats.workoutCount} sessions</p>
            {stats.workoutCount === 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate('health', 'workouts');
                }}
                className="text-[11px] font-semibold text-[var(--accent)] mt-1 underline"
              >
                Tap to log workout
              </button>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">Sleep consistency</p>
            {stats.sleepConsistencyPct !== null ? (
              <p className="font-mono-num text-base font-bold mt-0.5">{stats.sleepConsistencyPct}%</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-500 mt-0.5">Not enough data yet</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQuickLog('sleep');
                  }}
                  className="text-[11px] font-semibold text-[var(--accent)] mt-1 underline"
                >
                  Tap to log sleep
                </button>
              </>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">Calories vs plan · Protein</p>
            {stats.avgCalories !== null ? (
              <p className="font-mono-num text-sm font-bold mt-0.5">
                {stats.avgCalories}/{profile.calorieGoal} kcal · {stats.avgProtein}g
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-500 mt-0.5">Not enough data yet</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('food');
                  }}
                  className="text-[11px] font-semibold text-[var(--accent)] mt-1 underline"
                >
                  Tap to log a meal
                </button>
              </>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">Weight · Face/skin</p>
            <p className="font-mono-num text-sm font-bold mt-0.5">
              {stats.weightAdjust.week2AvgKg !== null
                ? `${stats.weightAdjust.week2AvgKg} kg`
                : 'No 7d avg yet'}{' '}
              · {stats.skinPct !== null ? `${stats.skinPct}%` : '—'}
            </p>
            {stats.weightAdjust.status === 'insufficient_data' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuickLog('body');
                }}
                className="text-[11px] font-semibold text-[var(--accent)] mt-1 underline"
              >
                Tap to log weight
              </button>
            )}
          </div>
        </div>

        {/* 7 Status Dots + Quick Fill Missing Days */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold">7-day food tracking dots</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Not tracked days are excluded from averages (never counted as 0 kcal)
              </p>
            </div>
            {gapDays.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStepIdx(0);
                  setStepperOpen((v) => !v);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-[11px] min-h-[34px]"
              >
                {stepperOpen ? 'Close quick fill' : `Quick fill (${gapDays.length})`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center">
            {nutritionAvg.summaries.map((s) => {
              const dotCls =
                s.status === 'complete'
                  ? 'bg-emerald-500'
                  : s.status === 'estimated'
                  ? 'bg-sky-500'
                  : s.status === 'partial'
                  ? 'bg-amber-400'
                  : 'bg-slate-300 dark:bg-white/20';
              return (
                <div key={s.date} className="flex flex-col items-center gap-1">
                  <span className={`w-3.5 h-3.5 rounded-full ${dotCls}`} title={`${s.date}: ${s.label}`} />
                  <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
                    {s.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Green = Complete · Sky = Estimated (0.65×) · Amber = Partial · Grey = Not tracked
          </p>

          {stepperOpen && activeGapDay && (
            <div className="p-3 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 space-y-2">
              <p className="font-bold">
                Quick fill {activeGapDay.date} ({activeGapDay.label})
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    const added = await logSameAsUsualMeal(activeGapDay.date, 'lunch');
                    if (added) {
                      showToast(`Filled ${activeGapDay.date} with "${added.mealTitle}"`);
                    } else {
                      showToast('No usual meal yet — pick Event or Say it on Food', 'info');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[34px]"
                >
                  <Repeat2 className="w-3 h-3" /> Same as usual
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await startEventModeForDay(activeGapDay.date, 'other');
                    showToast(`Marked ${activeGapDay.date} as Event day (estimated)`);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 font-bold min-h-[34px]"
                >
                  <PartyPopper className="w-3 h-3 text-[var(--accent)]" /> Event
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveSkippedGapDay(activeGapDay.date);
                    showToast(`Skipped ${activeGapDay.date} cleanly`);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 font-semibold text-slate-600 dark:text-slate-300 min-h-[34px]"
                >
                  <SkipForward className="w-3 h-3" /> Skip, don&apos;t track
                </button>
                {gapDays.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setStepIdx((i) => (i + 1) % gapDays.length)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--accent)] min-h-[34px]"
                  >
                    Next day →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Adaptive Maintenance Calibration (3+ weeks real data) */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">Adaptive maintenance calibration</p>
            <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] font-bold">
              Estimate, improves with data
            </span>
          </div>
          {adaptiveCalib.ready && adaptiveCalib.allowed ? (
            <>
              <p className="text-slate-600 dark:text-slate-300">
                Real-data maintenance ~{' '}
                <strong className="font-mono-num">{adaptiveCalib.estimatedMaintenanceKcal} kcal</strong>{' '}
                (formula: {adaptiveCalib.formulaMaintenanceKcal} kcal). {adaptiveCalib.reason}
              </p>
              {adaptiveCalib.suggestedTargetKcal !== null &&
                adaptiveCalib.suggestedTargetKcal !== profile.calorieGoal && (
                  <button
                    type="button"
                    onClick={async () => {
                      await saveAndVerifyProfile({
                        ...profile,
                        calorieGoal: adaptiveCalib.suggestedTargetKcal ?? profile.calorieGoal,
                      });
                      showToast(`Calibrated daily target to ${adaptiveCalib.suggestedTargetKcal} kcal`);
                    }}
                    className="mt-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[36px]"
                  >
                    Use calibrated target ({adaptiveCalib.suggestedTargetKcal} kcal)
                  </button>
                )}
            </>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">{adaptiveCalib.reason}</p>
          )}
        </div>

        {/* What went well + ONE thing to fix */}
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-1 text-xs">
          <p className="font-bold text-emerald-500">What went well</p>
          <p className="text-slate-700 dark:text-slate-200">{stats.wentWell}</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-xs">
          <p className="font-bold text-amber-500">ONE thing to fix</p>
          <p className="text-slate-700 dark:text-slate-200">{stats.oneFix}</p>
          <button
            type="button"
            onClick={stats.oneFixAction.run}
            className="px-3 py-2 rounded-xl bg-white dark:bg-white/10 font-semibold min-h-[40px]"
          >
            {stats.oneFixAction.label}
          </button>
        </div>

        {/* Next week's plan */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2 text-xs">
          <p className="font-bold">Next week&apos;s plan</p>
          <p className="text-slate-600 dark:text-slate-300">
            {hideCut
              ? `Keep balanced meals around maintenance, ${profile.workoutDaysPerWeek || 3} sessions, and steady sleep.`
              : `Daily target: ${stats.nextCal} kcal · ${profile.proteinTargetG}g protein · ${profile.workoutDaysPerWeek || 3} training days.`}
          </p>
          {aiPolish && (
            <p className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-slate-700 dark:text-slate-200 leading-relaxed">
              {aiPolish}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAcceptNextWeek}
            className="flex-1 min-w-[140px] py-3 px-4 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px] inline-flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Accept plan
          </button>
          <button
            type="button"
            disabled={polishing}
            onClick={handleAiPolish}
            className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px] inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            {polishing ? 'Checking...' : settings.onlineCoachEnabled ? 'Coach summary' : 'Template summary'}
          </button>
          <button
            type="button"
            onClick={handleExportPng}
            className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px] inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Save image
          </button>
        </div>
      </div>
    </div>
  );
};
