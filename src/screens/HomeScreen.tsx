import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BedDouble,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  MessageSquareText,
  Moon,
  Plus,
  ScanFace,
  Sparkles,
  Sun,
  Utensils,
} from 'lucide-react';
import { db, getOrCreateDailyLog, toggleTaskCompletion } from '../db/database';
import { getRankForLevel, xpRequiredForLevel } from '../data/badges';
import { getDailyMotivationalLine } from '../data/motivation';
import { addDays, formatDisplayDate, getGreeting, toLocalDateKey } from '../lib/date';
import { computeSleepStages, estimateHealthAndMetabolicAge } from '../lib/fitness';
import { getScannerState, subscribeScannerStatus } from '../lib/faceAnalysis';
import { CircularRing } from '../components/ui/ProgressRings';
import {
  DotMatrixProgress,
  MoveGoalBar,
  SleepDialGauge,
  SleepStageChart,
  SmoothAreaChart,
} from '../components/ui/Charts';
import { WeekStrip } from '../components/ui/WeekStrip';
import { InteractiveDailyCheckin } from '../components/InteractiveDailyCheckin';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  PrayerKey,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
  XpState,
} from '../types';
import type { PedometerState } from '../lib/pedometer';
import { useToast } from '../components/ui/ToastProvider';

const PRAYER_ITEMS: Array<{ key: PrayerKey; label: string }> = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Dhuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
];

interface HomeScreenProps {
  profile: UserProfile;
  settings?: AppSettings;
  xpState: XpState;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  bodyMetrics: BodyMetricEntry[];
  scans: FaceScanResult[];
  workouts: WorkoutSession[];
  selectedDate: string;
  onSelectDate: (d: string) => void;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'sleep' | 'body' | 'mood' | 'skin') => void;
  onNavigate: (screen: string, subTab?: string) => void;
  onOpenCoach: () => void;
  onOpenOnboarding: () => void;
  pedometerState?: PedometerState;
  onTogglePedometer?: () => void;
  onAddSteps?: (delta: number) => void;
  onSetSteps?: (exact: number) => void;
  onUpdateStepTarget?: (target: number) => void;
}

const MOOD_FACES = [
  { val: 1, icon: '😞', label: 'Low' },
  { val: 2, icon: '😕', label: 'Tired' },
  { val: 3, icon: '😐', label: 'Okay' },
  { val: 4, icon: '🙂', label: 'Good' },
  { val: 5, icon: '😄', label: 'Sharp' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  profile,
  settings,
  xpState,
  tasks,
  completions,
  dailyLogs,
  bodyMetrics,
  scans,
  workouts,
  selectedDate,
  onSelectDate,
  onOpenQuickLog,
  onNavigate,
  onOpenCoach,
  onOpenOnboarding,
  pedometerState,
  onTogglePedometer,
  onAddSteps,
  onSetSteps,
  onUpdateStepTarget,
}) => {
  const { showToast } = useToast();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [range, setRange] = useState<'D' | 'W' | 'M' | 'Y'>('D');
  const [scannerState, setScannerState] = useState(getScannerState());
  const [stepEditorOpen, setStepEditorOpen] = useState(false);
  const [customStepsInput, setCustomStepsInput] = useState('');
  const [customGoalInput, setCustomGoalInput] = useState('');
  const todayKey = toLocalDateKey();
  const enabledTasks = useMemo(() => tasks.filter((t) => t.enabled), [tasks]);
  const dailyStepTarget = profile.stepTarget && profile.stepTarget >= 1000 ? profile.stepTarget : 10000;

  useEffect(() => {
    return subscribeScannerStatus(() => setScannerState(getScannerState()));
  }, []);

  const dayCompletions = useMemo(
    () => completions.filter((c) => c.date === selectedDate),
    [completions, selectedDate]
  );
  const completedTaskIds = useMemo(
    () => new Set(dayCompletions.map((c) => c.taskId)),
    [dayCompletions]
  );

  // Minute-weighted completion score for selectedDate
  const { scorePct, amPct, pmPct } = useMemo(() => {
    const totalMin = enabledTasks.reduce((s, t) => s + t.minutes, 0);
    const doneMin = enabledTasks
      .filter((t) => completedTaskIds.has(t.id))
      .reduce((s, t) => s + t.minutes, 0);
    const overall = totalMin > 0 ? Math.round((doneMin / totalMin) * 100) : 0;

    const amTasks = enabledTasks.filter((t) => t.block === 'morning');
    const pmTasks = enabledTasks.filter((t) => t.block === 'evening');
    const amDone = amTasks.filter((t) => completedTaskIds.has(t.id)).length;
    const pmDone = pmTasks.filter((t) => completedTaskIds.has(t.id)).length;

    return {
      scorePct: overall,
      amPct: amTasks.length > 0 ? Math.round((amDone / amTasks.length) * 100) : 0,
      pmPct: pmTasks.length > 0 ? Math.round((pmDone / pmTasks.length) * 100) : 0,
    };
  }, [enabledTasks, completedTaskIds]);

  const completionPctByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const totalMin = Math.max(1, enabledTasks.reduce((s, t) => s + t.minutes, 0));
    const byDate = new Map<string, number>();
    for (const c of completions) {
      byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.minutes);
    }
    byDate.forEach((m, dt) => {
      map[dt] = Math.min(100, Math.round((m / totalMin) * 100));
    });
    return map;
  }, [completions, enabledTasks]);

  const currentLog = useMemo(
    () => dailyLogs.find((l) => l.date === selectedDate),
    [dailyLogs, selectedDate]
  );

  // Range-scoped Move Goal telemetry (real logged values from Dexie)
  const moveStats = useMemo(() => {
    const daysBack = range === 'D' ? 0 : range === 'W' ? 6 : range === 'M' ? 29 : 364;
    const cutoff = addDays(selectedDate, -daysBack);
    const inRange = (dt: string) =>
      range === 'D' ? dt === selectedDate : dt >= cutoff && dt <= selectedDate;

    const scopedLogs = dailyLogs.filter((l) => inRange(l.date));
    const scopedWorkouts = workouts.filter((w) => inRange(w.date));
    const scopedCompletions = completions.filter((c) => inRange(c.date));

    const steps = scopedLogs.reduce((s, l) => s + (l.steps || 0), 0);
    const km = Number((steps * 0.00076).toFixed(1));
    const workoutMin = scopedWorkouts.reduce((s, w) => s + (w.durationMin || 0), 0);
    const protocolMin = scopedCompletions.reduce((s, c) => s + (c.minutes || 0), 0);
    const activeMin = workoutMin + protocolMin;

    const loggedKcal = scopedLogs.reduce((s, l) => s + (l.calories || 0), 0);
    const activeKcal = Math.round(steps * 0.04 + workoutMin * 7);
    const kcalDisplay = loggedKcal > 0 ? loggedKcal : activeKcal;

    const targetSteps = dailyStepTarget * (daysBack + 1);
    const stepRatio = targetSteps > 0 ? Math.min(100, Math.round((steps / targetSteps) * 100)) : 0;
    const minGoal = Math.max(20, profile.dailyTimeBudgetMin) * (daysBack + 1);
    const minRatio = Math.min(100, Math.round((activeMin / minGoal) * 100));
    const movePct = steps > 0 ? Math.round(stepRatio * 0.6 + minRatio * 0.4) : minRatio;

    return {
      steps,
      km,
      activeMin,
      kcalDisplay,
      kcalLabel: loggedKcal > 0 ? 'Logged kcal' : 'Est. Burn',
      movePct: Math.max(0, Math.min(100, movePct)),
    };
  }, [range, selectedDate, dailyLogs, workouts, completions, profile.dailyTimeBudgetMin, dailyStepTarget]);

  const todaySteps = currentLog?.steps ?? 0;
  const todayStepPct = Math.min(100, Math.round((todaySteps / dailyStepTarget) * 100));
  const todayStepKm = Number((todaySteps * 0.00076).toFixed(1));
  const todayStepKcal = Math.round(todaySteps * 0.04);
  const remainingSteps = Math.max(0, dailyStepTarget - todaySteps);

  // Fallback to latest logged sleep night if selected day has no sleep entry yet
  const sleepDisplay = useMemo(() => {
    if (currentLog && currentLog.sleepHours > 0) {
      return {
        hours: currentLog.sleepHours,
        quality: currentLog.sleepQuality || 4,
        bedtime: currentLog.bedtime || '23:00',
        wakeTime: currentLog.wakeTime || '06:30',
        isCurrentDay: true,
        dateLabel: selectedDate === todayKey ? 'Last Night' : formatDisplayDate(selectedDate),
      };
    }
    const latestWithSleep = [...dailyLogs]
      .filter((l) => l.sleepHours > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latestWithSleep) return null;
    return {
      hours: latestWithSleep.sleepHours,
      quality: latestWithSleep.sleepQuality || 4,
      bedtime: latestWithSleep.bedtime || '23:00',
      wakeTime: latestWithSleep.wakeTime || '06:30',
      isCurrentDay: false,
      dateLabel: `Latest (${latestWithSleep.date.slice(5)})`,
    };
  }, [currentLog, dailyLogs, selectedDate, todayKey]);

  const sleepBreakdown = useMemo(
    () => (sleepDisplay ? computeSleepStages(sleepDisplay.hours, sleepDisplay.quality) : null),
    [sleepDisplay]
  );

  const dayWorkouts = useMemo(
    () => workouts.filter((w) => w.date === selectedDate),
    [workouts, selectedDate]
  );

  const weeklyWorkoutCount = useMemo(() => {
    const cutoff = addDays(todayKey, -6);
    return workouts.filter((w) => w.date >= cutoff).length;
  }, [workouts, todayKey]);

  // Latest body measurement
  const latestBody = useMemo(() => {
    if (bodyMetrics.length === 0) return null;
    return [...bodyMetrics].sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [bodyMetrics]);

  // 7-day smooth trend points from real daily completion data
  const sevenDayTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dt = addDays(todayKey, -(6 - i));
      return {
        label: dt.slice(5),
        value: completionPctByDate[dt] ?? 0,
      };
    });
  }, [completionPctByDate, todayKey]);

  // 28-day Dot Matrix data
  const last28Days = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const dt = addDays(todayKey, -(27 - i));
      return {
        date: dt,
        pct: completionPctByDate[dt] ?? 0,
      };
    });
  }, [completionPctByDate, todayKey]);

  const hydrationPct = Math.min(
    100,
    Math.round(((currentLog?.waterMl ?? 0) / Math.max(500, profile.waterTargetMl)) * 100)
  );

  const biometricSummary = useMemo(
    () =>
      estimateHealthAndMetabolicAge({
        age: profile.age,
        weightKg: latestBody?.weightKg ?? profile.weightKg,
        heightCm: profile.heightCm,
        sleepHours: sleepDisplay?.hours ?? 0,
        weeklyWorkouts: weeklyWorkoutCount,
        routineScorePct: scorePct,
        hydrationPct,
        restingHr: currentLog?.restingHr ?? null,
      }),
    [profile, latestBody, sleepDisplay, weeklyWorkoutCount, scorePct, hydrationPct, currentLog]
  );

  // Real biometric & protocol sync coverage %
  const metricsSyncPct = useMemo(() => {
    let pct = 0;
    pct += Math.round(scorePct * 0.45);
    if (currentLog?.waterMl) pct += 10;
    if (sleepDisplay?.isCurrentDay) pct += 10;
    if (currentLog?.mood) pct += 5;
    if ((currentLog?.postureScore ?? 0) > 0 || (currentLog?.mewingHours ?? 0) > 0) pct += 10;
    if (scannerState.status === 'ready') pct += 10;
    if (scans.length > 0) pct += 10;
    return Math.min(100, Math.max(15, pct));
  }, [scorePct, currentLog, sleepDisplay, scannerState.status, scans.length]);

  const nextBestTask = useMemo(
    () => enabledTasks.find((t) => !completedTaskIds.has(t.id)) ?? null,
    [enabledTasks, completedTaskIds]
  );

  const scansTodayCount = useMemo(
    () => scans.filter((s) => s.date === todayKey).length,
    [scans, todayKey]
  );
  const lowCalorieWarning =
    currentLog && currentLog.calories > 0 && currentLog.calories < 1200;

  const levelProgress = useMemo(() => {
    let rem = xpState.totalXp;
    let lvl = 1;
    while (rem >= xpRequiredForLevel(lvl)) {
      rem -= xpRequiredForLevel(lvl);
      lvl++;
    }
    const needed = xpRequiredForLevel(lvl);
    return { rem, needed, pct: Math.round((rem / needed) * 100) };
  }, [xpState.totalXp]);

  const handleToggleTask = async (task: ActiveProtocolTask) => {
    const completed = await toggleTaskCompletion(selectedDate, task);
    if (completed) {
      showToast(`Completed ${task.title} (+${task.xp} XP)`);
    }
  };

  const handleQuickAddWater = async (ml: number) => {
    const log = await getOrCreateDailyLog(selectedDate);
    await db.dailyLogs.update(selectedDate, {
      waterMl: Math.max(0, log.waterMl + ml),
      updatedAt: Date.now(),
    });
    showToast(`+${ml} ml hydration logged`);
  };

  const handleMoodTap = async (val: number) => {
    await getOrCreateDailyLog(selectedDate);
    await db.dailyLogs.update(selectedDate, { mood: val, updatedAt: Date.now() });
    showToast('Mood saved');
  };

  const handleTogglePrayer = async (key: PrayerKey) => {
    const log = await getOrCreateDailyLog(selectedDate);
    const prev = log.prayersCompleted ?? {};
    await db.dailyLogs.update(selectedDate, {
      prayersCompleted: { ...prev, [key]: !prev[key] },
      updatedAt: Date.now(),
    });
  };

  const greetingText = getGreeting();
  const dailyMotivationalLine = useMemo(
    () => getDailyMotivationalLine(selectedDate),
    [selectedDate]
  );

  return (
    <div className="space-y-4">
      {/* Reference-Inspired Centered Greeting, Top Capsule & Biometric Sync Card */}
      <section className="space-y-3 pt-1">
        {/* Compact Multi-Icon Summary Capsule */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-[#0C1410]/85 border border-slate-200 dark:border-emerald-500/25 shadow-[0_0_24px_-8px_var(--accent-glow)]">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
              <HeartPulse className="w-3.5 h-3.5" />
              <span className="font-mono-num">{biometricSummary.dailyHealthScore}</span>
            </span>
            <span className="w-px h-3 bg-slate-200 dark:bg-white/15" />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 dark:text-[#F6D56F]">
              <Flame className="w-3.5 h-3.5" />
              <span className="font-mono-num">{xpState.currentStreak}d</span>
            </span>
            <span className="w-px h-3 bg-slate-200 dark:bg-white/15" />
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Lv.{xpState.level} {getRankForLevel(xpState.level)}
            </span>
            {!(profile.onboardingComplete || profile.onboardingDone) && (
              <>
                <span className="w-px h-3 bg-slate-200 dark:bg-white/15" />
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Setup
                </button>
              </>
            )}
          </div>
        </div>

        {/* Centered Greeting & Daily Motivational Line */}
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
            {greetingText}, {profile.name || 'Friend'}
          </h1>
          <p className="text-xs font-medium text-[var(--accent)]">
            {dailyMotivationalLine}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatDisplayDate(selectedDate)} ·{' '}
            <span className="font-mono-num">{dayCompletions.length}/{enabledTasks.length}</span>{' '}
            protocol blocks complete
          </p>
        </div>

        {/* Emerald Bottom-Glow Biometric Sync Card */}
        <div className="ascend-card ascend-hero-glow p-4 sm:p-5 space-y-3.5 text-center">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[11px] font-semibold text-[var(--accent)]">
              <Sparkles className="w-3.5 h-3.5" />
              {scannerState.status === 'loading'
                ? 'Analyzing Health & Facial Metrics'
                : 'On-Device Biometric Engine Ready'}
            </span>
          </div>

          <div className="max-w-sm mx-auto space-y-2">
            <div className="font-mono-num text-2xl font-bold tracking-tight">
              {metricsSyncPct}%
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-black/60 overflow-hidden border border-slate-200/70 dark:border-emerald-500/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[var(--accent)] transition-all duration-500"
                style={{
                  width: `${metricsSyncPct}%`,
                  boxShadow: '0 0 14px var(--accent-glow)',
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-0.5">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              Protocol &amp; Hydration Synced
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              {scannerState.status === 'ready'
                ? '478-Landmark Scanner Ready'
                : scannerState.status === 'loading'
                ? 'Warming Landmark Model'
                : 'Local Storage Active'}
            </span>
          </div>
        </div>

        {/* ASCEND RECOMMENDS Quick Action Chips */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              ASCEND RECOMMENDS
            </p>
            <button
              type="button"
              onClick={onOpenCoach}
              className="text-[11px] font-semibold text-[var(--accent)] inline-flex items-center gap-1 hover:underline"
            >
              Ask Coach <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {nextBestTask && (
              <button
                type="button"
                onClick={() => handleToggleTask(nextBestTask)}
                className="ascend-card px-3 py-2.5 text-left flex items-center justify-between gap-2 min-h-[44px] min-w-0 hover:border-[var(--accent)]/50 active:scale-[0.98] transition"
              >
                <span className="text-xs font-medium truncate">{nextBestTask.title}</span>
                <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleQuickAddWater(250)}
              className="ascend-card px-3 py-2.5 text-left flex items-center justify-between gap-2 min-h-[44px] min-w-0 hover:border-[var(--accent)]/50 active:scale-[0.98] transition"
            >
              <span className="text-xs font-medium truncate">+250 ml Hydration</span>
              <Droplets className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('nutrition')}
              className="ascend-card px-3 py-2.5 text-left flex items-center justify-between gap-2 min-h-[44px] min-w-0 hover:border-[var(--accent)]/50 active:scale-[0.98] transition"
            >
              <span className="text-xs font-medium truncate">AI Meal Vision Scan</span>
              <Utensils className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('psl')}
              className="ascend-card px-3 py-2.5 text-left flex items-center justify-between gap-2 min-h-[44px] min-w-0 hover:border-[var(--accent)]/50 active:scale-[0.98] transition"
            >
              <span className="text-xs font-medium truncate">3-Angle PSL Scan</span>
              <ScanFace className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickLog('sleep')}
              className="ascend-card px-3 py-2.5 text-left flex items-center justify-between gap-2 min-h-[44px] min-w-0 hover:border-[var(--accent)]/50 active:scale-[0.98] transition"
            >
              <span className="text-xs font-medium truncate">Log Sleep &amp; HR</span>
              <BedDouble className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* Care Checks */}
      {(scansTodayCount > 3 || lowCalorieWarning) && (
        <div className="ascend-card p-4 border-amber-500/40 bg-amber-500/10 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Gentle Care Check</p>
            {scansTodayCount > 3 && (
              <p className="text-amber-800 dark:text-amber-200/90">
                You have logged {scansTodayCount} scans today. Facial geometry does not shift hour-to-hour—rescan every 14 days for accurate trends.
              </p>
            )}
            {lowCalorieWarning && (
              <p className="text-amber-800 dark:text-amber-200/90">
                Calories logged ({currentLog?.calories} kcal) are below safe daily minimums. Steady nourishment protects muscle, skin, and hair health.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Header + [D | W | M | Y] Selector (Ref 1 Center) */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 shrink-0">
          {(['D', 'W', 'M', 'Y'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`w-8 h-8 rounded-xl text-xs font-bold transition ${
                range === r
                  ? 'bg-white dark:bg-[#132018] text-slate-900 dark:text-[var(--accent)] shadow-sm border border-transparent dark:border-emerald-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Daily Steps Glowing Ring + Activity Sync Card */}
      <div className="ascend-card ascend-hero-glow p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Footprints className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300 truncate">
                DAILY STEP TRACKER
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {selectedDate === todayKey ? 'Today' : formatDisplayDate(selectedDate)} · Goal{' '}
                <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                  {dailyStepTarget.toLocaleString()}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onTogglePedometer && (
              <button
                type="button"
                onClick={onTogglePedometer}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold min-h-[36px] border transition ${
                  pedometerState?.status === 'active'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                    : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-[var(--accent)]/40'
                }`}
              >
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {pedometerState?.status === 'active'
                    ? 'Sensor Active'
                    : pedometerState?.status === 'unsupported'
                    ? 'Sensor Unavailable'
                    : pedometerState?.status === 'permission_denied'
                    ? 'Permission Denied'
                    : 'Enable Motion Sync'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCustomStepsInput(String(todaySteps));
                setCustomGoalInput(String(dailyStepTarget));
                setStepEditorOpen((v) => !v);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-semibold min-h-[36px] hover:border-[var(--accent)]/40 transition"
            >
              {stepEditorOpen ? 'Close' : 'Edit'}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="shrink-0">
            <CircularRing value={todayStepPct} size={124} strokeWidth={10} color="var(--accent)" glow>
              <div className="text-center px-2">
                <span className="font-mono-num text-xl font-bold block leading-none tabular-nums">
                  {todaySteps.toLocaleString()}
                </span>
                <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400 block mt-1">
                  / {dailyStepTarget.toLocaleString()}
                </span>
              </div>
            </CircularRing>
          </div>

          <div className="flex-1 w-full min-w-0 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-black/40 border border-slate-200/70 dark:border-white/10 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">
                  Progress
                </span>
                <span className="font-mono-num text-sm sm:text-base font-bold text-[var(--accent)] block tabular-nums">
                  {todayStepPct}%
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-black/40 border border-slate-200/70 dark:border-white/10 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">
                  Distance
                </span>
                <span className="font-mono-num text-sm sm:text-base font-bold block tabular-nums">
                  {todayStepKm} km
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-black/40 border border-slate-200/70 dark:border-white/10 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">
                  Est. Burn
                </span>
                <span className="font-mono-num text-sm sm:text-base font-bold block tabular-nums">
                  {todayStepKcal} kcal
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {remainingSteps === 0 ? (
                  <span className="text-[var(--accent)] font-semibold">Daily step target reached</span>
                ) : (
                  <>
                    <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                      {remainingSteps.toLocaleString()}
                    </span>{' '}
                    steps remaining
                  </>
                )}
                {pedometerState && pedometerState.sessionSteps > 0 && (
                  <span className="ml-2 font-mono-num text-[11px] text-[var(--accent)]">
                    (+{pedometerState.sessionSteps} live)
                  </span>
                )}
              </span>

              {onAddSteps && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddSteps(500)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-mono-num font-semibold min-h-[36px] hover:border-[var(--accent)]/40 active:scale-95 transition"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
                    500
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddSteps(1000)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-mono-num font-semibold min-h-[36px] hover:bg-[var(--accent)]/20 active:scale-95 transition"
                  >
                    <Plus className="w-3 h-3" />
                    1,000
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {stepEditorOpen && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const parsedSteps = Number(customStepsInput);
              const parsedGoal = Number(customGoalInput);
              if (Number.isFinite(parsedSteps) && parsedSteps >= 0 && onSetSteps) {
                await onSetSteps(parsedSteps);
              }
              if (Number.isFinite(parsedGoal) && parsedGoal >= 1000 && onUpdateStepTarget) {
                await onUpdateStepTarget(parsedGoal);
              }
              setStepEditorOpen(false);
            }}
            className="pt-3 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end"
          >
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                Today&apos;s Steps
              </label>
              <input
                type="number"
                min={0}
                max={150000}
                value={customStepsInput}
                onChange={(e) => setCustomStepsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                Daily Target
              </label>
              <input
                type="number"
                min={1000}
                max={50000}
                step={500}
                value={customGoalInput}
                onChange={(e) => setCustomGoalInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[42px]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px] active:scale-95 transition"
            >
              Save Step Settings
            </button>
          </form>
        )}
      </div>

      {/* MOVE GOAL + SLEEP INSIGHTS Split (Ref 1 Center) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* MOVE GOAL Card */}
        <div className="lg:col-span-6 ascend-card p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onNavigate('trackers', 'workouts')}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-[var(--accent)] transition"
            >
              MOVE GOAL <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickLog('nutrition')}
              aria-label="Log Steps and Activity"
              className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 flex items-center justify-center hover:bg-indigo-500/25 transition"
            >
              <Footprints className="w-4 h-4" />
            </button>
          </div>

          <MoveGoalBar valuePct={moveStats.movePct} />

          <div className="grid grid-cols-4 gap-2 pt-1 items-end">
            <button
              type="button"
              onClick={() => onOpenQuickLog('nutrition')}
              className="text-left min-w-0 hover:opacity-80 transition"
            >
              <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                <Footprints className="w-3 h-3 text-[var(--accent)] shrink-0" />
                Steps
              </span>
              <span className="font-mono-num text-lg sm:text-xl font-bold block truncate">
                {moveStats.steps > 0 ? moveStats.steps.toLocaleString() : '0'}
              </span>
            </button>

            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">km</span>
              <span className="font-mono-num text-sm sm:text-base font-bold block truncate">
                {moveStats.km}
              </span>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Active Min</span>
              <span className="font-mono-num text-sm sm:text-base font-bold block truncate">
                {moveStats.activeMin}
              </span>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                {moveStats.kcalLabel}
              </span>
              <span className="font-mono-num text-sm sm:text-base font-bold block truncate">
                {moveStats.kcalDisplay}
              </span>
            </div>
          </div>

          {/* Level XP Bar */}
          <div className="space-y-1.5 pt-3 border-t border-slate-200/70 dark:border-white/10">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Routine Score <strong className="font-mono-num text-slate-900 dark:text-white">{scorePct}%</strong> · Lv.{xpState.level} XP
              </span>
              <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                {levelProgress.rem}/{levelProgress.needed}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${levelProgress.pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* SLEEP INSIGHTS Card with Semi-Circular Dial + Hypnogram (Ref 1 + Ref 2) */}
        <div className="lg:col-span-6 ascend-card p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenQuickLog('sleep')}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-[var(--accent)] transition"
            >
              SLEEP INSIGHTS <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickLog('sleep')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold min-h-[34px] shrink-0"
            >
              <Moon className="w-3.5 h-3.5" />
              {sleepDisplay?.isCurrentDay ? 'Edit' : 'Log Sleep'}
            </button>
          </div>

          <SleepDialGauge
            breakdown={sleepBreakdown}
            bedtime={sleepDisplay?.bedtime}
            wakeTime={sleepDisplay?.wakeTime}
          />

          {sleepBreakdown && <SleepStageChart breakdown={sleepBreakdown} />}
        </div>
      </div>

      {/* Week Strip + How're You Today Mood Strip (Ref 2 Left) */}
      <div className="space-y-3">
        <WeekStrip
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          completionPctByDate={completionPctByDate}
        />

        <div className="ascend-card p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              How&apos;re You Today?
            </span>
            {currentLog?.mood ? (
              <span className="text-xs font-semibold text-[var(--accent)]">
                {MOOD_FACES.find((m) => m.val === currentLog.mood)?.label}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Tap to log mood</span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {MOOD_FACES.map((m) => {
              const selected = currentLog?.mood === m.val;
              return (
                <button
                  key={m.val}
                  type="button"
                  onClick={() => handleMoodTap(m.val)}
                  className={`py-2 rounded-2xl flex flex-col items-center justify-center min-h-[48px] transition ${
                    selected
                      ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)] shadow-[0_0_14px_-4px_var(--accent-glow)]'
                      : 'hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="text-lg leading-none">{m.icon}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* YOUR CURRENT STATE 2-Card Split + 28-Day Dot Matrix (Ref 1 + Ref 2) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-[var(--accent)] transition"
          >
            YOUR CURRENT STATE <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Real On-Device Logs</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Card: Body Composition + 28-Day Matrix */}
          <div className="ascend-card p-5 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[var(--accent)]" />
                  Body &amp; Matrix
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {latestBody ? `Last Updated: ${latestBody.date.slice(5)}` : 'Baseline from Profile'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuickLog('body')}
                className="text-right hover:opacity-80 transition shrink-0"
              >
                <span className="font-mono-num text-xl font-bold block">
                  {latestBody ? latestBody.weightKg : profile.weightKg}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">kg</span>
                </span>
                <span className="text-[11px] text-[var(--accent)] font-semibold">
                  {latestBody?.bodyFatPct ? `${latestBody.bodyFatPct}% BF` : '+ Log weight'}
                </span>
              </button>
            </div>

            <DotMatrixProgress days={last28Days} />
          </div>

          {/* Right Card: Daily Health Score, Est. Metabolic Age, Hydration & 7d Trend */}
          <div className="ascend-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4 text-[var(--accent)]" />
                  Readiness &amp; Recovery
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="font-mono-num text-2xl font-bold">
                    {biometricSummary.dailyHealthScore}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/100</span>
                  </span>
                  <span className="text-xs font-semibold text-[var(--accent)] font-mono-num">
                    Est. {biometricSummary.metabolicAge}y
                    {biometricSummary.deltaYears !== 0 &&
                      ` (${biometricSummary.deltaYears > 0 ? '+' : ''}${biometricSummary.deltaYears}y)`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuickLog('water')}
                className="text-right shrink-0"
              >
                <span className="font-mono-num text-sm font-bold text-[var(--accent)] block">
                  {hydrationPct}% H₂O
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-num">
                  {currentLog?.waterMl ?? 0}/{profile.waterTargetMl} ml
                </span>
              </button>
            </div>

            <SmoothAreaChart
              points={sevenDayTrend}
              unit="%"
              minVal={0}
              maxVal={100}
              compact
              emptyLabel="Log routines to chart your 7-day trend."
            />
          </div>
        </div>
      </section>

      {/* Quick Links & Minimalist 4-Column Circular Action Grid (Ref 1 Right) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            QUICK LINKS
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">1-Tap Access</span>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenQuickLog('water')}
            className="ascend-card p-2.5 sm:p-3.5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[86px] min-w-0 hover:border-[var(--accent)]/50 active:scale-95 transition"
          >
            <span className="w-10 h-10 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] flex items-center justify-center">
              <Droplets className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-semibold truncate w-full">Water</span>
            <span className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400 truncate w-full">
              {currentLog?.waterMl ? `${currentLog.waterMl}ml` : 'Log'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('nutrition')}
            className="ascend-card p-2.5 sm:p-3.5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[86px] min-w-0 hover:border-[var(--accent)]/50 active:scale-95 transition"
          >
            <span className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-500 dark:text-[#F6D56F] flex items-center justify-center">
              <Utensils className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-semibold truncate w-full">Meal AI</span>
            <span className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400 truncate w-full">
              {currentLog?.calories ? `${currentLog.calories} kcal` : 'Scan'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('trackers', 'workouts')}
            className="ascend-card p-2.5 sm:p-3.5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[86px] min-w-0 hover:border-[var(--accent)]/50 active:scale-95 transition"
          >
            <span className="w-10 h-10 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] flex items-center justify-center">
              <Dumbbell className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-semibold truncate w-full">Gym</span>
            <span className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400 truncate w-full">
              {dayWorkouts.length > 0 ? `${dayWorkouts.length} done` : 'Log'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('psl')}
            className="ascend-card p-2.5 sm:p-3.5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[86px] min-w-0 hover:border-[var(--accent)]/50 active:scale-95 transition"
          >
            <span className="w-10 h-10 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] flex items-center justify-center">
              <ScanFace className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-semibold truncate w-full">PSL Scan</span>
            <span className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400 truncate w-full">
              {scans[0] ? `${scans[0].pslEstimate}/8` : '3-Angle'}
            </span>
          </button>
        </div>

        {/* Secondary Hub Modules Strip */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigate('care')}
            className="ascend-card p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 min-h-[72px] min-w-0 hover:border-[var(--accent)]/50 transition"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[11px] font-semibold truncate w-full">Care Hub</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('trackers', 'body')}
            className="ascend-card p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 min-h-[72px] min-w-0 hover:border-[var(--accent)]/50 transition"
          >
            <Footprints className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[11px] font-semibold truncate w-full">Body BF%</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('academy')}
            className="ascend-card p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 min-h-[72px] min-w-0 hover:border-[var(--accent)]/50 transition"
          >
            <BookOpen className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[11px] font-semibold truncate w-full">Academy</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('progress', 'profile')}
            className="ascend-card p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 min-h-[72px] min-w-0 hover:border-[var(--accent)]/50 transition"
          >
            <Award className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[11px] font-semibold truncate w-full">
              Awards ({xpState.unlockedBadges.length})
            </span>
          </button>
        </div>
      </section>

      {/* Main Split: Interactive Flow + Today's Checklist | AM/PM Routine Rings & Coach */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4 min-w-0">
          {/* Next Best Action */}
          {nextBestTask && (
            <div className="ascend-card p-4 flex items-center justify-between gap-3 hover:border-[var(--accent)]/40">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                  Next Best Action
                </p>
                <h2 className="font-display text-base font-bold truncate mt-0.5">
                  {nextBestTask.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {nextBestTask.actionLine} · {nextBestTask.minutes}m · {nextBestTask.evidence}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleTask(nextBestTask)}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] active:scale-95 transition"
              >
                Done
              </button>
            </div>
          )}

          {/* Optional Calm Prayer Check-Ins Card */}
          {settings?.prayerTrackingEnabled && (
            <div className="ascend-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-bold">Prayer check-ins</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Quiet daily ticks · optional &amp; separate from streak scoring
                  </p>
                </div>
                <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                  {PRAYER_ITEMS.filter((p) => Boolean(currentLog?.prayersCompleted?.[p.key])).length}/5
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {PRAYER_ITEMS.map((p) => {
                  const checked = Boolean(currentLog?.prayersCompleted?.[p.key]);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleTogglePrayer(p.key)}
                      className={`py-2 px-1 rounded-xl text-center border min-h-[46px] flex flex-col items-center justify-center gap-0.5 transition ${
                        checked
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-[11px] font-semibold">{p.label}</span>
                      <span className="text-[10px] opacity-80">{checked ? '✓' : '·'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Daily Sliders & Decision Flow */}
          <InteractiveDailyCheckin
            selectedDate={selectedDate}
            dailyLog={currentLog}
            waterTargetMl={profile.waterTargetMl}
          />

          {/* Today's Checklist */}
          <div className="ascend-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold">
                  {selectedDate === todayKey ? "Today's Stack" : `Stack · ${formatDisplayDate(selectedDate)}`}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {enabledTasks.length} active tasks · {enabledTasks.reduce((s, t) => s + t.minutes, 0)}m · 70% locks streak
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('routine', 'mind')}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold hover:text-[var(--accent)] min-h-[34px]"
                >
                  Mind
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('routine')}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline min-h-[36px] px-1"
                >
                  Customize
                </button>
              </div>
            </div>

            {enabledTasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No active tasks yet.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('routine')}
                  className="mt-3 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
                >
                  Open Protocol Builder
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {enabledTasks.map((task) => {
                  const done = completedTaskIds.has(task.id);
                  const expanded = expandedTaskId === task.id;
                  return (
                    <div key={task.id} className="py-3 first:pt-1 last:pb-1">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleTask(task)}
                          aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`}
                          className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition min-w-[28px] ${
                            done
                              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_0_12px_var(--accent-glow)]'
                              : 'border-2 border-slate-300 dark:border-white/25 hover:border-[var(--accent)]'
                          }`}
                        >
                          {done && <Check className="w-4 h-4" strokeWidth={3} />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                done ? 'line-through text-slate-400 dark:text-slate-500' : ''
                              }`}
                            >
                              {task.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                              aria-label="Learn more"
                              className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
                            >
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {task.actionLine}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            <span className="capitalize">{task.block}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">{task.minutes}m</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">+{task.xp} XP</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {task.evidence}
                            </span>
                          </div>

                          {expanded && (
                            <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-white/10 text-xs space-y-2">
                              <p className="text-slate-700 dark:text-slate-200">
                                <strong>Why:</strong> {task.why}
                              </p>
                              {task.steps.length > 0 && (
                                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300">
                                  {task.steps.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ol>
                              )}
                              {task.safetyNote && (
                                <p className="text-amber-700 dark:text-amber-300 font-medium">
                                  Note: {task.safetyNote}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AM/PM Routine Rings, Streak Protection & Local Coach */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <div className="ascend-card p-4 flex flex-col items-center justify-center text-center">
              <CircularRing value={amPct} size={76} strokeWidth={7} color="var(--series-yellow)" glow={false}>
                <Sun className="w-5 h-5 text-amber-500 dark:text-[#F6D56F]" />
              </CircularRing>
              <div className="font-mono-num text-lg font-bold mt-2">{amPct}%</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">AM Routine</div>
            </div>

            <div className="ascend-card p-4 flex flex-col items-center justify-center text-center">
              <CircularRing value={pmPct} size={76} strokeWidth={7} color="var(--series-lavender)" glow={false}>
                <Moon className="w-5 h-5 text-violet-500 dark:text-[#B8A9F5]" />
              </CircularRing>
              <div className="font-mono-num text-lg font-bold mt-2">{pmPct}%</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">PM Routine</div>
            </div>
          </div>

          <div className="ascend-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Streak Protection
              </span>
              <Activity className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Current Streak</span>
              <span className="font-mono-num font-bold text-base text-[var(--accent)]">
                {xpState.currentStreak} days
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Longest Streak</span>
              <span className="font-mono-num font-semibold">{xpState.longestStreak} days</span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Weekly Freezes Left</span>
              <span className="font-mono-num font-semibold">{xpState.streakFreezesRemaining}</span>
            </div>
          </div>

          <div className="ascend-card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold">On-Device Protocol Coach</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Offline Q&amp;A grounded in your local logs &amp; scans.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCoach}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px] active:scale-95 transition"
            >
              <MessageSquareText className="w-4 h-4" />
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
