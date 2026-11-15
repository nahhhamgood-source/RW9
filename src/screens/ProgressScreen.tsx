import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Calendar,
  ChevronRight,
  Download,
  HeartPulse,
  Lock,
  PackagePlus,
  Pencil,
  Printer,
  Ruler,
  Sparkles,
  Target,
} from 'lucide-react';
import { BADGE_DEFINITIONS, getRankForLevel } from '../data/badges';
import { addDays, toLocalDateKey } from '../lib/date';
import { getPslTierMeta, PSL_HONEST_DISCLAIMER } from '../lib/faceMetricsConstants';
import { estimateHealthAndMetabolicAge } from '../lib/fitness';
import {
  DailyScoreBarChart,
  DotMatrixProgress,
  SmoothAreaChart,
} from '../components/ui/Charts';
import { CircularRing, ConcentricRings } from '../components/ui/ProgressRings';
import type {
  ActiveProtocolTask,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
  XpState,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';

interface ProgressScreenProps {
  profile: UserProfile;
  xpState: XpState;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  bodyMetrics: BodyMetricEntry[];
  scans: FaceScanResult[];
  workouts: WorkoutSession[];
  slangTierNames?: boolean;
  initialSubTab?: string;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'sleep' | 'body' | 'mood' | 'skin') => void;
  onOpenOnboarding: () => void;
  onNavigate: (screen: string) => void;
}

const MEDALLION_STYLES = [
  // Silver metallic
  'from-slate-100 via-slate-300 to-slate-500 text-slate-900 ring-slate-200/70 shadow-[0_0_18px_rgba(226,232,240,0.3)]',
  // Warm Gold metallic
  'from-amber-100 via-amber-300 to-amber-600 text-amber-950 ring-amber-200/70 shadow-[0_0_18px_rgba(251,191,36,0.35)]',
  // Cyan / Sapphire metallic
  'from-cyan-200 via-sky-400 to-indigo-600 text-slate-950 ring-cyan-200/70 shadow-[0_0_18px_rgba(56,189,248,0.35)]',
  // Muted Emerald metallic
  'from-emerald-200 via-emerald-400 to-emerald-600 text-emerald-950 ring-emerald-200/70 shadow-[0_0_16px_rgba(16,185,129,0.28)]',
];

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  profile,
  xpState,
  tasks,
  completions,
  dailyLogs,
  bodyMetrics,
  scans,
  workouts,
  slangTierNames = true,
  initialSubTab,
  onOpenQuickLog,
  onOpenOnboarding,
  onNavigate,
}) => {
  const { showToast } = useToast();
  const [range, setRange] = useState<'D' | 'W' | 'M' | 'Y'>('W');
  const [showAllBadges, setShowAllBadges] = useState(initialSubTab === 'profile');
  const today = toLocalDateKey();

  const rangeDays = range === 'D' ? 1 : range === 'W' ? 7 : range === 'M' ? 30 : 365;
  const startCutoff = addDays(today, -(rangeDays - 1));
  const enabledTasks = useMemo(() => tasks.filter((t) => t.enabled), [tasks]);

  // 7-day bar chart data
  const sevenDayBars = useMemo(() => {
    const totalMin = Math.max(1, enabledTasks.reduce((s, t) => s + t.minutes, 0));
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, -(6 - i));
      const doneMin = completions
        .filter((c) => c.date === date)
        .reduce((s, c) => s + c.minutes, 0);
      const score = Math.min(100, Math.round((doneMin / totalMin) * 100));
      return { date, score };
    });
  }, [completions, enabledTasks, today]);

  // Today's biometric + Health Score + Est. Metabolic Age
  const todayLog = useMemo(() => dailyLogs.find((l) => l.date === today), [dailyLogs, today]);
  const latestWeight = useMemo(() => {
    if (bodyMetrics.length === 0) return profile.weightKg;
    return [...bodyMetrics].sort((a, b) => b.createdAt - a.createdAt)[0].weightKg;
  }, [bodyMetrics, profile.weightKg]);

  const biometricSummary = useMemo(() => {
    const totalMin = Math.max(1, enabledTasks.reduce((s, t) => s + t.minutes, 0));
    const todayDoneMin = completions
      .filter((c) => c.date === today)
      .reduce((s, c) => s + c.minutes, 0);
    const todayRoutinePct = Math.min(100, Math.round((todayDoneMin / totalMin) * 100));

    const latestSleep =
      todayLog?.sleepHours && todayLog.sleepHours > 0
        ? todayLog.sleepHours
        : [...dailyLogs]
            .filter((l) => l.sleepHours > 0)
            .sort((a, b) => b.date.localeCompare(a.date))[0]?.sleepHours ?? 0;

    const weekCutoff = addDays(today, -6);
    const weeklyWorkouts = workouts.filter((w) => w.date >= weekCutoff).length;
    const hydrationPct = Math.min(
      100,
      Math.round(((todayLog?.waterMl ?? 0) / Math.max(500, profile.waterTargetMl)) * 100)
    );

    return {
      todayRoutinePct,
      ...estimateHealthAndMetabolicAge({
        age: profile.age,
        weightKg: latestWeight,
        heightCm: profile.heightCm,
        sleepHours: latestSleep,
        weeklyWorkouts,
        routineScorePct: todayRoutinePct,
        hydrationPct,
        restingHr: todayLog?.restingHr ?? null,
      }),
    };
  }, [
    enabledTasks,
    completions,
    today,
    todayLog,
    dailyLogs,
    workouts,
    profile,
    latestWeight,
  ]);

  // Concentric 3-ring metrics (Consistency, Sleep, Skincare Adherence)
  const overviewMetrics = useMemo(() => {
    const rangeCompletions = completions.filter((c) => c.date >= startCutoff);
    const totalPossible = Math.max(1, enabledTasks.length * rangeDays);
    const consistencyPct = Math.min(100, Math.round((rangeCompletions.length / totalPossible) * 100));

    const rangeLogs = dailyLogs.filter((l) => l.date >= startCutoff && l.sleepHours > 0);
    const sleepPct =
      rangeLogs.length > 0
        ? Math.min(
            100,
            Math.round(
              (rangeLogs.filter((l) => l.sleepHours >= profile.targetSleepHours - 0.8).length /
                rangeLogs.length) *
                100
            )
          )
        : 0;

    const skinTasks = enabledTasks.filter((t) => t.category === 'skin');
    const skinCompletions = rangeCompletions.filter((c) =>
      skinTasks.some((st) => st.id === c.taskId)
    );
    const skinPct =
      skinTasks.length > 0
        ? Math.min(100, Math.round((skinCompletions.length / (skinTasks.length * rangeDays)) * 100))
        : 0;

    return { consistencyPct, sleepPct, skinPct };
  }, [completions, dailyLogs, enabledTasks, profile.targetSleepHours, rangeDays, startCutoff]);

  // Strongest vs Needs Focus (last 7 days) + All-time Habit Rate List
  const { strongestHabit, focusHabit, allTimeRates } = useMemo(() => {
    const weekStart = addDays(today, -6);
    const weekComps = completions.filter((c) => c.date >= weekStart);
    const weekStats = enabledTasks.map((t) => {
      const count = weekComps.filter((c) => c.taskId === t.id).length;
      const pct = Math.min(100, Math.round((count / 7) * 100));
      return { task: t, pct, count };
    });
    const sortedWeek = [...weekStats].sort((a, b) => b.pct - a.pct);

    const activeSpanDays = Math.max(
      1,
      new Set(completions.map((c) => c.date)).size || 1
    );
    const allTime = enabledTasks
      .map((t) => {
        const total = completions.filter((c) => c.taskId === t.id).length;
        const pct = Math.min(100, Math.round((total / activeSpanDays) * 100));
        return { task: t, total, pct };
      })
      .sort((a, b) => b.pct - a.pct);

    return {
      strongestHabit: sortedWeek[0] ?? null,
      focusHabit: sortedWeek[sortedWeek.length - 1] ?? null,
      allTimeRates: allTime,
    };
  }, [completions, enabledTasks, today]);

  // 12-week heatmap (84 days) + 28-day matrix slice
  const heatmapCells = useMemo(() => {
    const totalMin = Math.max(1, enabledTasks.reduce((s, t) => s + t.minutes, 0));
    return Array.from({ length: 84 }, (_, i) => {
      const date = addDays(today, -(83 - i));
      const min = completions
        .filter((c) => c.date === date)
        .reduce((s, c) => s + c.minutes, 0);
      const pct = Math.min(100, Math.round((min / totalMin) * 100));
      return { date, pct };
    });
  }, [completions, enabledTasks, today]);

  const last28Days = useMemo(() => heatmapCells.slice(-28), [heatmapCells]);

  const unlockedSet = useMemo(
    () => new Set(xpState.unlockedBadges.map((b) => b.id)),
    [xpState.unlockedBadges]
  );

  const initials = (profile.name || 'A')
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  // Export Ascension Monthly Report PNG Canvas
  const handleDownloadReportPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#040407';
    ctx.fillRect(0, 0, 960, 600);

    ctx.strokeStyle = 'rgba(0, 255, 136, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, 904, 544);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('ASCEND.OS — MONTHLY BIOMETRIC REPORT', 60, 86);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      `${profile.name} · Generated ${today} · Level ${xpState.level} (${getRankForLevel(xpState.level)})`,
      60,
      122
    );

    const cards = [
      { label: 'Daily Health Score', val: `${biometricSummary.dailyHealthScore}/100` },
      { label: 'Est. Metabolic Age', val: `${biometricSummary.metabolicAge} yrs` },
      { label: 'Consistency Rate', val: `${overviewMetrics.consistencyPct}%` },
      { label: 'Skincare Adherence', val: `${overviewMetrics.skinPct}%` },
      {
        label: 'Latest PSL LAB',
        val: scans[0]
          ? `${scans[0].pslEstimate}/8 (${getPslTierMeta(scans[0].pslEstimate, slangTierNames).displayLabel})`
          : 'No scan',
      },
      { label: 'Current Streak', val: `${xpState.currentStreak} days` },
    ];

    cards.forEach((c, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = 60 + col * 290;
      const y = 165 + row * 140;
      ctx.fillStyle = '#0C1410';
      ctx.fillRect(x, y, 265, 115);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.strokeRect(x, y, 265, 115);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '15px sans-serif';
      ctx.fillText(c.label, x + 20, y + 36);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(c.val, x + 20, y + 82);
    });

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(
      `Strongest habit: ${strongestHabit?.task.title ?? '—'} (${strongestHabit?.pct ?? 0}%)   ·   Needs focus: ${focusHabit?.task.title ?? '—'} (${focusHabit?.pct ?? 0}%)`,
      60,
      485
    );
    ctx.fillStyle = '#6B7280';
    ctx.font = '14px sans-serif';
    ctx.fillText('Self-tracking estimates, not medical advice. 100% local on-device data.', 60, 535);

    const a = document.createElement('a');
    a.download = `ascend-report-${today}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('Downloaded Ascension Report PNG');
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Range Switcher & Export Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Insights &amp; Profile</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Compare you to your own past · Level {xpState.level} {getRankForLevel(xpState.level)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print max-w-full">
          <div className="flex gap-1 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10">
            {(['D', 'W', 'M', 'Y'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold min-h-[32px] transition ${
                  range === r
                    ? 'bg-white dark:bg-[#132018] text-slate-900 dark:text-[var(--accent)] shadow-sm border border-transparent dark:border-emerald-500/30'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDownloadReportPng}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[38px] whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> Report PNG
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#0C1410] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold min-h-[38px] whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Reference-Inspired Profile & Biometric Score Card with Emerald Bottom Glow */}
      <section className="ascend-card ascend-hero-glow p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400/25 via-emerald-500/15 to-transparent border-2 border-[var(--accent)]/50 flex items-center justify-center font-display text-lg font-bold text-[var(--accent)] shrink-0 shadow-[0_0_20px_-6px_var(--accent-glow)]">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold truncate">{profile.name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {profile.age} yrs, {profile.sex} · {xpState.totalXp} XP
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenOnboarding}
            aria-label="Edit Profile"
            className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/50 transition shrink-0"
          >
            <Pencil className="w-4 h-4 text-[var(--accent)]" />
          </button>
        </div>

        <div className="rounded-2xl bg-slate-50/90 dark:bg-black/35 border border-slate-200/80 dark:border-emerald-500/20 divide-y divide-slate-200/70 dark:divide-white/10">
          <div className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <HeartPulse className="w-4 h-4" />
              </span>
              <span className="text-xs sm:text-sm font-semibold truncate">Daily Health Score</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-mono-num text-base font-bold">
                {biometricSummary.dailyHealthScore}/100
              </span>
              <span className="block text-[10px] text-[var(--accent)] font-mono-num">
                {biometricSummary.todayRoutinePct}% routine today
              </span>
            </div>
          </div>

          <div className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-500 dark:text-[#F6D56F] flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4" />
              </span>
              <span className="text-xs sm:text-sm font-semibold truncate">Est. Metabolic Age</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-mono-num text-base font-bold">
                {biometricSummary.metabolicAge} yrs
              </span>
              <span className="block text-[10px] text-[var(--accent)]">
                {biometricSummary.deltaYears < 0
                  ? `${Math.abs(biometricSummary.deltaYears)}y younger than age`
                  : biometricSummary.deltaYears > 0
                  ? `${biometricSummary.deltaYears}y above chronological age`
                  : 'Aligned with chronological age'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Awards Metallic Medallions + Quick Links (Ref 1 Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 ascend-card p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAllBadges(!showAllBadges)}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-[var(--accent)] transition"
            >
              AWARDS ({xpState.unlockedBadges.length}/{BADGE_DEFINITIONS.length}){' '}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowAllBadges(!showAllBadges)}
              className="text-xs font-semibold text-[var(--accent)]"
            >
              {showAllBadges ? 'Show compact' : 'See all'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
            {(showAllBadges ? BADGE_DEFINITIONS : BADGE_DEFINITIONS.slice(0, 4)).map((b, idx) => {
              const earned = unlockedSet.has(b.id);
              const medallionClass = MEDALLION_STYLES[idx % MEDALLION_STYLES.length];
              return (
                <div
                  key={b.id}
                  title={b.description}
                  className={`flex flex-col items-center text-center min-w-0 transition ${
                    earned ? 'opacity-100' : 'opacity-45'
                  }`}
                >
                  <div
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center relative ring-2 ${
                      earned
                        ? `bg-gradient-to-br ${medallionClass}`
                        : 'bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 ring-slate-300 dark:ring-white/10'
                    }`}
                  >
                    <div className="absolute inset-1 rounded-full border border-white/35 pointer-events-none" />
                    {earned ? <Award className="w-6 h-6" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <span className="text-[11px] font-bold mt-2 leading-tight line-clamp-2 w-full">
                    {b.title}
                  </span>
                  {showAllBadges && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight line-clamp-2">
                      {b.description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 ascend-card p-5 space-y-3.5 flex flex-col justify-center">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
            QUICK LINKS
          </h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <span className="w-11 h-11 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] flex items-center justify-center">
                <Target className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight">Edit Goals</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('care')}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <span className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-500 dark:text-[#F6D56F] flex items-center justify-center">
                <PackagePlus className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight">Add Product</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenQuickLog('body')}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <span className="w-11 h-11 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-500 dark:text-[#B8A9F5] flex items-center justify-center">
                <Ruler className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight">Body Log</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenQuickLog('skin')}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <span className="w-11 h-11 rounded-full bg-emerald-500/12 border border-emerald-500/22 text-emerald-600 dark:text-[#34D399] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight">Skin Note</span>
            </button>
          </div>
        </div>
      </div>

      {/* Concentric Overview + 7-Day Score Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 ascend-card p-5">
          <h2 className="font-display text-base font-bold mb-4">Health &amp; Routine Overview ({range})</h2>
          <ConcentricRings
            rings={[
              { label: 'Consistency', value: overviewMetrics.consistencyPct },
              { label: 'Sleep Target', value: overviewMetrics.sleepPct },
              { label: 'Skincare', value: overviewMetrics.skinPct },
            ]}
          />
        </div>

        <div className="lg:col-span-7 ascend-card p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-bold">7-Day Daily Score</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Weighted % of planned protocol minutes completed each day
            </p>
          </div>
          <DailyScoreBarChart data={sevenDayBars} />
        </div>
      </div>

      {/* Strongest vs Needs Focus + Habit Completion Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="ascend-card p-4 flex flex-col items-center text-center">
              <span className="text-[11px] font-semibold text-emerald-500 mb-2">Strongest (7d)</span>
              <CircularRing value={strongestHabit?.pct ?? 0} size={68} strokeWidth={6} color="var(--accent)">
                <span className="font-mono-num text-xs font-bold">{strongestHabit?.pct ?? 0}%</span>
              </CircularRing>
              <span className="text-xs font-semibold mt-2 line-clamp-2">
                {strongestHabit?.task.title ?? 'No data'}
              </span>
            </div>

            <div className="ascend-card p-4 flex flex-col items-center text-center">
              <span className="text-[11px] font-semibold text-amber-500 mb-2">Needs Focus (7d)</span>
              <CircularRing value={focusHabit?.pct ?? 0} size={68} strokeWidth={6} color="var(--series-yellow)">
                <span className="font-mono-num text-xs font-bold">{focusHabit?.pct ?? 0}%</span>
              </CircularRing>
              <span className="text-xs font-semibold mt-2 line-clamp-2">
                {focusHabit?.task.title ?? 'No data'}
              </span>
            </div>
          </div>

          <div className="ascend-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="font-display text-sm font-bold">Weekly Review Summary</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Over the past 7 days, your strongest habit was{' '}
              <strong>{strongestHabit?.task.title ?? 'none logged yet'}</strong> ({strongestHabit?.pct ?? 0}%).{' '}
              {focusHabit && focusHabit.pct < 60
                ? `Consider simplifying or moving "${focusHabit.task.title}" (${focusHabit.pct}%) to an easier time block.`
                : 'Keep steady momentum without adding extra workload too quickly.'}
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 ascend-card p-4 space-y-3">
          <h2 className="font-display text-base font-bold">Habit Completion Rates (All-Time)</h2>
          {allTimeRates.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              Complete protocol tasks on Dashboard to populate habit rates.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {allTimeRates.map((item) => (
                <div key={item.task.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium truncate pr-2">{item.task.title}</span>
                    <span className="font-mono-num font-semibold shrink-0">{item.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.pct >= 75 ? 'bg-[var(--accent)]' : item.pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                      }`}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend Charts + 28-Day Dot Matrix + 12-Week Heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 ascend-card p-4 space-y-2.5">
          <h2 className="font-display text-sm font-bold">PSL LAB Trend &amp; Tier History</h2>
          <SmoothAreaChart
            points={[...scans].reverse().map((s) => ({ label: s.date.slice(5), value: s.pslEstimate }))}
            unit="/8"
            minVal={2.5}
            maxVal={7.5}
            emptyLabel="Log 2+ PSL LAB scans to chart progress."
          />
          {scans.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/10 max-h-36 overflow-y-auto">
              {[...scans].slice(0, 6).map((s) => {
                const tier = getPslTierMeta(s.pslEstimate, slangTierNames);
                return (
                  <div key={s.id ?? s.timestamp} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono-num text-slate-500 dark:text-slate-400">{s.date}</span>
                    <span className="font-semibold text-[var(--accent)] truncate">
                      {tier.displayLabel} ({s.pslEstimate}/8)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 pt-1">
            {PSL_HONEST_DISCLAIMER}
          </p>
        </div>

        <div className="lg:col-span-4 ascend-card p-4 space-y-2">
          <h2 className="font-display text-sm font-bold">Weight Trend</h2>
          <SmoothAreaChart
            points={[...bodyMetrics]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((b) => ({ label: b.date.slice(5), value: b.weightKg }))}
            unit=" kg"
            color="var(--series-yellow)"
            emptyLabel="Log weight entries in Quick Log or Trackers."
          />
        </div>

        <div className="md:col-span-2 lg:col-span-4 ascend-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">28-Day Execution Matrix</h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">84d grid below</span>
          </div>
          <DotMatrixProgress days={last28Days} />
          <div className="grid grid-cols-12 gap-1 pt-2 border-t border-slate-200/70 dark:border-white/10">
            {heatmapCells.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.pct}%`}
                className="aspect-square rounded-[4px]"
                style={{
                  backgroundColor:
                    cell.pct >= 80
                      ? 'var(--accent)'
                      : cell.pct >= 40
                      ? 'rgba(16, 185, 129, 0.45)'
                      : cell.pct > 0
                      ? 'rgba(16, 185, 129, 0.22)'
                      : 'rgba(148, 163, 184, 0.16)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
