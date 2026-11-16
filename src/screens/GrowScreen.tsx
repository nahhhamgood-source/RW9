import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Info,
  MessageCircle,
  Moon,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  ShieldAlert,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  db,
  getOrCreateDailyLog,
  recalculateXpAndBadges,
  saveAndVerifyProfile,
  toggleGrowthCheckoff,
  toggleGrowthProgramDay,
} from '../db/database';
import { addDays, toLocalDateKey } from '../lib/date';
import { en } from '../i18n/en';
import {
  DAILY_GROWTH_HABITS,
  GROWTH_SUPPLEMENTS_INFO,
  SEVEN_DAY_GROWTH_PROGRAMS,
  STAND_TALL_FINISHED_BANNER,
  STAND_TALL_PLAN_ITEMS,
  STAND_TALLER_TIPS,
} from '../data/growthProgram';
import {
  PERCENTILE_Z_CURVES,
  WHO_LMS_BOYS,
  WHO_LMS_GIRLS,
  WHO_SOURCE_INFO,
  computeDreamHeightEstimate,
  computeGrowthCompletePct,
  computeHeightPercentile,
  computeMidParentalOutlook,
  heightAtPercentileLms,
  isProbablyFinishedGrowing,
} from '../data/growthTables';
import { ExerciseDemoLinks } from '../components/ui/ExerciseDemoLinks';
import { useToast } from '../components/ui/ToastProvider';
import type {
  DailyLog,
  GrowthCheckoffEntry,
  GrowthProgramProgress,
  HeightLogEntry,
  UnitSystem,
  UserProfile,
} from '../types';
import type { GrowthProgramDefinition } from '../data/growthProgram';

const LazyExercisePlayer = lazy(() =>
  import('../components/exercises/ExercisePlayer').then((m) => ({ default: m.ExercisePlayer }))
);

interface GrowScreenProps {
  profile: UserProfile;
  units: UnitSystem;
  heightLogs: HeightLogEntry[];
  growthCheckoffs: GrowthCheckoffEntry[];
  growthPrograms: GrowthProgramProgress[];
  dailyLogs?: DailyLog[];
  onOpenHeightLog: () => void;
  onAskCoach: () => void;
}

function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    if (inches === 12) return `${feet + 1}' 0" (${cm.toFixed(1)} cm)`;
    return `${feet}' ${inches}" (${cm.toFixed(1)} cm)`;
  }
  return `${cm.toFixed(1)} cm`;
}

function getAgeAtLog(birthDate: string | undefined, fallbackAge: number, logDate: string): number {
  if (birthDate) {
    const birth = new Date(`${birthDate}T12:00:00`);
    const target = new Date(`${logDate}T12:00:00`);
    if (!Number.isNaN(birth.getTime()) && !Number.isNaN(target.getTime())) {
      const years = (target.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (years >= 3 && years <= 90) return years;
    }
  }
  return fallbackAge || 18;
}

export const GrowScreen: React.FC<GrowScreenProps> = ({
  profile,
  units,
  heightLogs,
  growthCheckoffs,
  growthPrograms,
  dailyLogs = [],
  onOpenHeightLog,
  onAskCoach,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();

  const sortedLogsDesc = useMemo(
    () => [...heightLogs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [heightLogs]
  );
  const sortedLogsAsc = useMemo(
    () => [...heightLogs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [heightLogs]
  );

  const latestLog = sortedLogsDesc[0] ?? null;
  const earliestLog = sortedLogsAsc[0] ?? null;
  const currentHeightCm =
    latestLog?.heightCm ?? (profile.heightCm > 0 ? profile.heightCm : null);

  // Parent & dream height editors
  const [editingParents, setEditingParents] = useState(false);
  const [fatherInput, setFatherInput] = useState(
    profile.fatherHeightCm ? String(profile.fatherHeightCm) : ''
  );
  const [motherInput, setMotherInput] = useState(
    profile.motherHeightCm ? String(profile.motherHeightCm) : ''
  );
  const [showOutlookFormula, setShowOutlookFormula] = useState(false);

  const [editingDream, setEditingDream] = useState(false);
  const [dreamInput, setDreamInput] = useState(
    profile.dreamHeightCm ? String(profile.dreamHeightCm) : ''
  );

  useEffect(() => {
    if (!editingParents) {
      setFatherInput(profile.fatherHeightCm ? String(profile.fatherHeightCm) : '');
      setMotherInput(profile.motherHeightCm ? String(profile.motherHeightCm) : '');
    }
  }, [profile.fatherHeightCm, profile.motherHeightCm, editingParents]);

  useEffect(() => {
    if (!editingDream) {
      setDreamInput(profile.dreamHeightCm ? String(profile.dreamHeightCm) : '');
    }
  }, [profile.dreamHeightCm, editingDream]);

  // Interactive UI states
  const [chartSexRef, setChartSexRef] = useState<'male' | 'female'>(
    profile.sex === 'female' ? 'female' : 'male'
  );
  useEffect(() => {
    if (profile.sex === 'male' || profile.sex === 'female') {
      setChartSexRef(profile.sex);
    }
  }, [profile.sex]);

  const [animateChart, setAnimateChart] = useState(false);
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setAnimateChart(true);
      return;
    }
    const id = requestAnimationFrame(() => setAnimateChart(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showSupplementsInfo, setShowSupplementsInfo] = useState(false);
  const [showWhoSources, setShowWhoSources] = useState(false);
  const [activeGrowthPlayer, setActiveGrowthPlayer] = useState<{
    program: GrowthProgramDefinition;
    dayNumber: number;
  } | null>(null);

  // Posture-from-Photo interactive state (strictly local memory, zero network upload)
  const [posturePhotoUrl, setPosturePhotoUrl] = useState<string | null>(null);
  const [earPt, setEarPt] = useState<{ x: number; y: number } | null>(null);
  const [shoulderPt, setShoulderPt] = useState<{ x: number; y: number } | null>(null);
  const [manualAngleInput, setManualAngleInput] = useState('');

  useEffect(() => {
    return () => {
      if (posturePhotoUrl) URL.revokeObjectURL(posturePhotoUrl);
    };
  }, [posturePhotoUrl]);

  // Derived Growth Calculations (strictly real logs & approximate WHO 2007 curves)
  const outlook = useMemo(
    () => computeMidParentalOutlook(profile.sex, profile.fatherHeightCm, profile.motherHeightCm),
    [profile.sex, profile.fatherHeightCm, profile.motherHeightCm]
  );

  const percentileInfo = useMemo(() => {
    if (!currentHeightCm) return null;
    return computeHeightPercentile(currentHeightCm, profile.age, profile.sex);
  }, [currentHeightCm, profile.age, profile.sex]);

  const probablyFinishedGrowing = useMemo(
    () => isProbablyFinishedGrowing(profile),
    [profile]
  );

  const growthCompletePct = useMemo(
    () => computeGrowthCompletePct(profile, currentHeightCm, outlook?.midpointCm ?? null),
    [profile, currentHeightCm, outlook]
  );

  const dreamEstimate = useMemo(() => {
    if (!profile.dreamHeightCm) return null;
    return computeDreamHeightEstimate(
      profile.dreamHeightCm,
      currentHeightCm,
      outlook?.midpointCm ?? null,
      probablyFinishedGrowing
    );
  }, [profile.dreamHeightCm, currentHeightCm, outlook, probablyFinishedGrowing]);

  // Morning vs Evening height comparison from real logged readings
  const morningVsEvening = useMemo(() => {
    const mornings = sortedLogsDesc.filter((l) => l.timeOfDay === 'morning');
    const evenings = sortedLogsDesc.filter((l) => l.timeOfDay === 'evening');
    const latestMorning = mornings[0] ?? null;
    const latestEvening = evenings[0] ?? null;
    const diffCm =
      latestMorning && latestEvening
        ? Number((latestMorning.heightCm - latestEvening.heightCm).toFixed(1))
        : null;
    return { latestMorning, latestEvening, diffCm };
  }, [sortedLogsDesc]);

  // Computed ear-shoulder angle from tapped points (normalized 0-100 coordinates)
  const measuredAngleDeg = useMemo(() => {
    if (earPt && shoulderPt) {
      const dx = Math.abs(earPt.x - shoulderPt.x);
      const dy = Math.max(2, Math.abs(shoulderPt.y - earPt.y));
      return Math.min(45, Math.round((Math.atan2(dx, dy) * 180) / Math.PI));
    }
    const parsed = Number(manualAngleInput);
    if (manualAngleInput.trim() && Number.isFinite(parsed) && parsed >= 0 && parsed <= 45) {
      return Math.round(parsed);
    }
    return null;
  }, [earPt, shoulderPt, manualAngleInput]);

  const postureHistory = useMemo(
    () =>
      dailyLogs
        .filter((l) => typeof l.earShoulderAngleDeg === 'number')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7),
    [dailyLogs]
  );

  // Daily Growth Checkoffs -> Score % & Streak
  const todayCheckedSet = useMemo(() => {
    return new Set(growthCheckoffs.filter((c) => c.date === todayKey).map((c) => c.habitId));
  }, [growthCheckoffs, todayKey]);

  const activeRoutineIds = useMemo(
    () =>
      probablyFinishedGrowing
        ? STAND_TALL_PLAN_ITEMS.map((item) => item.id)
        : DAILY_GROWTH_HABITS.map((h) => h.id),
    [probablyFinishedGrowing]
  );

  const growthHabitsScorePct = useMemo(() => {
    if (activeRoutineIds.length === 0) return 0;
    const doneCount = activeRoutineIds.filter((id) => todayCheckedSet.has(id)).length;
    return Math.round((doneCount / activeRoutineIds.length) * 100);
  }, [activeRoutineIds, todayCheckedSet]);

  const growthStreakDays = useMemo(() => {
    const datesWithAny = new Set(growthCheckoffs.map((c) => c.date));
    if (datesWithAny.size === 0) return 0;
    let cursor = datesWithAny.has(todayKey) ? todayKey : addDays(todayKey, -1);
    if (!datesWithAny.has(cursor)) return 0;
    let streak = 0;
    while (datesWithAny.has(cursor) && streak < 3650) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }, [growthCheckoffs, todayKey]);

  // Real measurement delta since start
  const measuredDeltaCm = useMemo(() => {
    if (sortedLogsAsc.length < 2 || !earliestLog || !latestLog) return null;
    return Number((latestLog.heightCm - earliestLog.heightCm).toFixed(1));
  }, [sortedLogsAsc, earliestLog, latestLog]);

  // Program completion map
  const programMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const p of growthPrograms) {
      map[p.id] = p.completedDays;
    }
    return map;
  }, [growthPrograms]);

  const handleSavePostureAngle = async () => {
    if (measuredAngleDeg === null) {
      showToast('Tap Ear and Shoulder on a side photo (or enter degrees 0–45).', 'warning');
      return;
    }
    const postureScore = Math.max(20, Math.min(100, Math.round(100 - Math.max(0, measuredAngleDeg - 4) * 2.4)));
    await getOrCreateDailyLog(todayKey);
    await db.dailyLogs.update(todayKey, {
      earShoulderAngleDeg: measuredAngleDeg,
      postureCheckPhotoDate: todayKey,
      postureScore,
      updatedAt: Date.now(),
    });
    showToast(`Saved posture check: ${measuredAngleDeg}° offset (${postureScore}/100)`);
  };

  // Save handlers
  const handleSaveParents = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fatherInput.trim() ? Number(fatherInput) : null;
    const m = motherInput.trim() ? Number(motherInput) : null;
    if ((f !== null && (f < 110 || f > 240)) || (m !== null && (m < 110 || m > 240))) {
      showToast('Enter parent heights between 110 and 240 cm', 'warning');
      return;
    }
    await saveAndVerifyProfile({
      ...profile,
      fatherHeightCm: f ? Number(f.toFixed(1)) : null,
      motherHeightCm: m ? Number(m.toFixed(1)) : null,
      updatedAt: Date.now(),
    });
    setEditingParents(false);
    showToast('Parents’ heights saved');
  };

  const handleSaveDream = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = dreamInput.trim() ? Number(dreamInput) : null;
    if (d !== null && (d < 110 || d > 245)) {
      showToast('Enter a dream height between 110 and 245 cm', 'warning');
      return;
    }
    await saveAndVerifyProfile({
      ...profile,
      dreamHeightCm: d ? Number(d.toFixed(1)) : null,
      updatedAt: Date.now(),
    });
    setEditingDream(false);
    showToast(d ? 'Dream height saved' : 'Dream height cleared');
  };

  const handleToggleMonthlyReminder = async () => {
    const next = !profile.monthlyHeightReminder;
    await saveAndVerifyProfile({
      ...profile,
      monthlyHeightReminder: next,
      updatedAt: Date.now(),
    });
    showToast(next ? 'Monthly morning height reminder on' : 'Monthly reminder turned off');
  };

  // WHO Chart geometry
  const hasWhoTables = WHO_LMS_BOYS.length > 0 && WHO_LMS_GIRLS.length > 0;
  const chartMinAge = 5;
  const chartMaxAge = 19;
  const chartW = 340;
  const chartH = 196;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const minCm = 100;
  const maxCm = 200;

  const xForAge = (age: number) =>
    padL + ((Math.max(chartMinAge, Math.min(chartMaxAge, age)) - chartMinAge) / (chartMaxAge - chartMinAge)) * innerW;
  const yForCm = (cm: number) =>
    padT + innerH - ((Math.max(minCm, Math.min(maxCm, cm)) - minCm) / (maxCm - minCm)) * innerH;

  const ageSamples = useMemo(() => {
    const list: number[] = [];
    for (let a = chartMinAge; a <= chartMaxAge; a += 0.5) list.push(a);
    return list;
  }, []);

  const userChartPoints = useMemo(() => {
    return sortedLogsAsc.map((log) => {
      const age = getAgeAtLog(profile.birthDate, profile.age, log.date);
      const clampedAge = Math.max(chartMinAge, Math.min(chartMaxAge, age));
      return {
        x: xForAge(clampedAge),
        y: yForCm(log.heightCm),
        cm: log.heightCm,
        date: log.date,
        clampedAdult: age > chartMaxAge,
      };
    });
  }, [sortedLogsAsc, profile.birthDate, profile.age]);

  const userPolylinePoints = userChartPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="space-y-4 pb-4">
      {/* 1. TOP CARDS: Current height | Height outlook */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card A: Current Height */}
        <div className="ascend-card ascend-hero-glow p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                Current Height
              </p>
              <p className="font-mono-num text-3xl font-bold mt-1">
                {currentHeightCm ? formatHeight(currentHeightCm, units) : 'Not enough data yet'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {latestLog
                  ? `Last measured ${latestLog.date} (${latestLog.timeOfDay})`
                  : currentHeightCm
                  ? 'From your profile — log a wall reading for trends'
                  : en.growHub.noHeightYet}
              </p>
            </div>
            <span className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Ruler className="w-5 h-5" />
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenHeightLog}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> Log height
            </button>
            {sortedLogsDesc.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllLogs((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                {sortedLogsDesc.length} reading{sortedLogsDesc.length > 1 ? 's' : ''}
                {showAllLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {showAllLogs && sortedLogsDesc.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/10 max-h-52 overflow-y-auto">
              {sortedLogsDesc.map((entry) => (
                <div key={entry.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono-num text-xs font-bold">
                      {formatHeight(entry.heightCm, units)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {entry.date} · {entry.timeOfDay}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => entry.id && db.heightLogs.delete(entry.id)}
                    aria-label="Delete height reading"
                    className="p-2 text-slate-400 hover:text-rose-500 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card B: Height Outlook (Mid-Parental Estimate) */}
        <div className="ascend-card p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Height Outlook
              </p>
              {outlook ? (
                <>
                  <p className="font-mono-num text-2xl font-bold mt-1">
                    {outlook.minCm.toFixed(0)}–{outlook.maxCm.toFixed(0)} cm
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Midpoint ~<span className="font-mono-num font-semibold">{outlook.midpointCm.toFixed(1)} cm</span>
                    {units === 'imperial' && ` (${formatHeight(outlook.midpointCm, 'imperial').split(' (')[0]})`}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-bold mt-1">Not enough data yet</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Add both parents&apos; heights to compute your genetic family range.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowOutlookFormula((v) => !v)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold min-h-[44px]"
              >
                What&apos;s this?
              </button>
              <button
                type="button"
                onClick={() => setEditingParents((v) => !v)}
                aria-label="Edit parents heights"
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showOutlookFormula && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-semibold">Mid-parental target formula:</p>
              <p>Boys: (father + mother + 13 cm) / 2 ± 8.5 cm</p>
              <p>Girls: (father + mother − 13 cm) / 2 ± 8.5 cm</p>
              {outlook && (
                <p className="font-mono-num text-[11px] text-[var(--accent)] pt-0.5">
                  Yours: {outlook.formulaText}
                </p>
              )}
            </div>
          )}

          {(!outlook || editingParents) && (
            <form onSubmit={handleSaveParents} className="space-y-2.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Father (cm)
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={110}
                    max={240}
                    value={fatherInput}
                    onChange={(e) => setFatherInput(e.target.value)}
                    placeholder="e.g. 178"
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base font-mono-num min-h-[44px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Mother (cm)
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={110}
                    max={240}
                    value={motherInput}
                    onChange={(e) => setMotherInput(e.target.value)}
                    placeholder="e.g. 165"
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base font-mono-num min-h-[44px]"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                >
                  Save outlook
                </button>
                {editingParents && (
                  <button
                    type="button"
                    onClick={() => setEditingParents(false)}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </section>

      {/* 2. HONEST FINISHED-GROWTH OR POSTURE BANNER */}
      <section className="ascend-card p-4 border-l-4 border-l-[var(--accent)] flex items-start gap-3">
        <Info className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          <p className="font-semibold">
            {probablyFinishedGrowing
              ? STAND_TALL_FINISHED_BANNER
              : 'Posture gain: Good posture and spine stretching can give back up to about 1–2 cm of apparent height after sitting.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Important: stretching and dead hangs temporarily decompress spinal discs and fix slouching — this is <strong>not bone growth</strong>.
          </p>
        </div>
      </section>

      {/* 2B. MORNING VS EVENING HEIGHT CHECK & POSTURE PHOTO CHECK */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Morning vs Evening Height Check */}
        <div className="ascend-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">Morning vs Evening Check</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Spinal discs compress during the day — people usually measure 1–2 cm taller in the morning.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenHeightLog}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-bold min-h-[44px] shrink-0"
            >
              + Log
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-semibold">
                <Sun className="w-3.5 h-3.5" /> Morning
              </p>
              <p className="font-mono-num text-sm font-bold mt-1">
                {morningVsEvening.latestMorning
                  ? `${morningVsEvening.latestMorning.heightCm.toFixed(1)} cm`
                  : 'Not logged'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="inline-flex items-center gap-1 text-[11px] text-sky-400 font-semibold">
                <Moon className="w-3.5 h-3.5" /> Evening
              </p>
              <p className="font-mono-num text-sm font-bold mt-1">
                {morningVsEvening.latestEvening
                  ? `${morningVsEvening.latestEvening.heightCm.toFixed(1)} cm`
                  : 'Not logged'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Daily delta</p>
              <p className="font-mono-num text-sm font-bold text-[var(--accent)] mt-1">
                {morningVsEvening.diffCm !== null
                  ? `${morningVsEvening.diffCm > 0 ? '+' : ''}${morningVsEvening.diffCm} cm`
                  : 'Need both'}
              </p>
            </div>
          </div>
        </div>

        {/* Posture-from-Photo Check (Ear-Shoulder Angle) */}
        <div className="ascend-card p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--accent)]" /> Posture-from-Photo Check
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Side photo stays on-device. Tap your <strong>Ear</strong>, then your <strong>Shoulder</strong> to measure forward-head angle.
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold cursor-pointer min-h-[44px] shrink-0">
              <Camera className="w-3.5 h-3.5" /> Pick photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (posturePhotoUrl) URL.revokeObjectURL(posturePhotoUrl);
                  setPosturePhotoUrl(URL.createObjectURL(file));
                  setEarPt(null);
                  setShoulderPt(null);
                }}
                className="hidden"
              />
            </label>
          </div>

          {posturePhotoUrl && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[var(--accent)]">
                {!earPt
                  ? 'Step 1: Tap center of your Ear on the photo'
                  : !shoulderPt
                  ? 'Step 2: Tap center of your Shoulder joint on the photo'
                  : `Measured ear-shoulder plumb offset: ${measuredAngleDeg ?? 0}°`}
              </p>
              <div
                className="relative w-full max-w-[260px] mx-auto rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 cursor-crosshair select-none"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  if (!earPt) {
                    setEarPt({ x, y });
                  } else if (!shoulderPt) {
                    setShoulderPt({ x, y });
                  } else {
                    setEarPt({ x, y });
                    setShoulderPt(null);
                  }
                }}
              >
                <img
                  src={posturePhotoUrl}
                  alt="Side posture check preview"
                  className="w-full h-auto block"
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {shoulderPt && (
                    <line
                      x1={shoulderPt.x}
                      y1={0}
                      x2={shoulderPt.x}
                      y2={100}
                      stroke="rgba(255,255,255,0.5)"
                      strokeDasharray="2 2"
                      strokeWidth="0.6"
                    />
                  )}
                  {earPt && shoulderPt && (
                    <line
                      x1={earPt.x}
                      y1={earPt.y}
                      x2={shoulderPt.x}
                      y2={shoulderPt.y}
                      stroke="#34D399"
                      strokeWidth="1.2"
                    />
                  )}
                  {earPt && <circle cx={earPt.x} cy={earPt.y} r="2.5" fill="#38BDF8" stroke="#fff" strokeWidth="0.6" />}
                  {shoulderPt && <circle cx={shoulderPt.x} cy={shoulderPt.y} r="2.5" fill="#34D399" stroke="#fff" strokeWidth="0.6" />}
                </svg>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEarPt(null);
                  setShoulderPt(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[var(--accent)] min-h-[36px]"
              >
                <RotateCcw className="w-3 h-3" /> Reset markers
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!posturePhotoUrl && (
              <input
                type="number"
                min={0}
                max={45}
                value={manualAngleInput}
                onChange={(e) => setManualAngleInput(e.target.value)}
                placeholder="Or enter angle deg (e.g. 8)"
                className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono-num min-h-[44px]"
              />
            )}
            <button
              type="button"
              onClick={handleSavePostureAngle}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              Save posture check{measuredAngleDeg !== null ? ` (${measuredAngleDeg}°)` : ''}
            </button>
          </div>

          {postureHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Recent ear-shoulder angle trend (lower offset = taller stack):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {postureHistory.map((log) => (
                  <span
                    key={log.date}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 font-mono-num text-[11px]"
                  >
                    {log.date.slice(5)}: <strong>{log.earShoulderAngleDeg}°</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. HEIGHT / AGE CHART (Approximate WHO 2007 LMS + USER LOGS) */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent)]" /> Height / Age Chart
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {WHO_SOURCE_INFO.label} (ages 5–19, 3rd–97th percentile) + your logged points
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowWhoSources((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold min-h-[36px]"
            >
              Sources &amp; accuracy
            </button>
            {profile.sex === 'other' && (
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                {(['male', 'female'] as const).map((sexOpt) => (
                  <button
                    key={sexOpt}
                    type="button"
                    onClick={() => setChartSexRef(sexOpt)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold min-h-[36px] ${
                      chartSexRef === sexOpt
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {sexOpt === 'male' ? 'Boys ref' : 'Girls ref'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showWhoSources && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold">Sources &amp; accuracy note</p>
            <p>{WHO_SOURCE_INFO.disclaimer}</p>
          </div>
        )}

        {!hasWhoTables ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
            Percentile unavailable
          </p>
        ) : (
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-auto block"
              role="img"
              aria-label="WHO height-for-age percentile chart with your logged height readings"
            >
              {/* Horizontal cm grid */}
              {[120, 140, 160, 180, 200].map((cm) => {
                const y = yForCm(cm);
                return (
                  <g key={cm}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={chartW - padR}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-white/10"
                      strokeWidth="0.7"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={padL - 5}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[8px] font-mono-num"
                    >
                      {cm}
                    </text>
                  </g>
                );
              })}

              {/* Age x-axis ticks */}
              {[5, 8, 11, 14, 17, 19].map((age) => {
                const x = xForAge(age);
                return (
                  <text
                    key={age}
                    x={x}
                    y={chartH - 7}
                    textAnchor="middle"
                    className="fill-slate-400 text-[8px] font-mono-num"
                  >
                    {age}y
                  </text>
                );
              })}

              {/* WHO Percentile curves */}
              {PERCENTILE_Z_CURVES.map((curve) => {
                const pts = ageSamples
                  .map((a) => {
                    const hCm = heightAtPercentileLms(a, chartSexRef, curve.z);
                    return `${xForAge(a).toFixed(1)},${yForCm(hCm).toFixed(1)}`;
                  })
                  .join(' ');
                const isMedian = curve.pct === 50;
                const lastY = yForCm(heightAtPercentileLms(chartMaxAge, chartSexRef, curve.z));
                return (
                  <g key={curve.label}>
                    <polyline
                      fill="none"
                      stroke={isMedian ? 'var(--accent)' : 'currentColor'}
                      className={isMedian ? 'opacity-70' : 'text-slate-400/50 dark:text-slate-500/50'}
                      strokeWidth={isMedian ? 1.6 : 1}
                      strokeDasharray={isMedian ? undefined : '3 3'}
                      points={pts}
                    />
                    <text
                      x={chartW - padR + 2}
                      y={lastY + 2.5}
                      className="fill-slate-400 text-[7px] font-mono-num"
                    >
                      {curve.pct}
                    </text>
                  </g>
                );
              })}

              {/* User logged height path (animated line in) */}
              {userChartPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="600"
                  strokeDashoffset={animateChart ? 0 : 600}
                  style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
                  points={userPolylinePoints}
                />
              )}

              {/* User logged dots */}
              {userChartPoints.map((pt, idx) => (
                <g key={`${pt.date}-${idx}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>
              ))}
            </svg>
          </div>
        )}

        {sortedLogsAsc.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            No height points logged yet — tap <strong>+ Log height</strong> above to plot your real trend.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap justify-between gap-2">
            <span>Green dots = your real height logs ({sortedLogsAsc.length})</span>
            {profile.age > 19 && <span>Ages over 19 plot on the 19y adult edge</span>}
          </p>
        )}
      </section>

      {/* 4. TALLER THAN X% & 5. GROWTH COMPLETE ≈ Y% */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 4. Taller than X% */}
        <div className="ascend-card p-5 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            4. Age Percentile (WHO LMS)
          </p>
          {percentileInfo ? (
            <>
              <p className="font-display text-xl font-bold">
                Taller than <span className="font-mono-num text-[var(--accent)]">{percentileInfo.pct}%</span> of people your age
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {percentileInfo.basisNote} (Z-score {percentileInfo.zScore >= 0 ? '+' : ''}
                {percentileInfo.zScore}).
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold">Not enough data yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Log your height and age (5+) to compute your WHO 2007 percentile.
              </p>
            </>
          )}
        </div>

        {/* 5. Growth Complete ≈ Y% */}
        <div className="ascend-card p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              5. Growth Complete
            </p>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              approximate
            </span>
          </div>
          {growthCompletePct !== null && (probablyFinishedGrowing || outlook) ? (
            <>
              <p className="font-display text-2xl font-bold font-mono-num text-[var(--accent)]">
                ≈ {growthCompletePct}%
              </p>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${growthCompletePct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {probablyFinishedGrowing
                  ? `You are likely finished growing (${profile.stillGrowing === 'no' ? 'marked done growing' : `at age ${profile.age}, growth plates are typically closed`}). Focus now shifts to posture & standing tall.`
                  : outlook
                  ? `Calculated as ${currentHeightCm?.toFixed(1)} cm / ${outlook.midpointCm.toFixed(1)} cm genetic midpoint. Approximate — growth spurts and timing vary widely.`
                  : 'Log your current height and parents’ heights to refine your estimate.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold">Not enough data yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Needs your current height and parents&apos; heights above.
              </p>
            </>
          )}
        </div>
      </section>

      {/* 6. DREAM HEIGHT */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent)]" /> Dream Height
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Honest gap check and genetic probability range
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingDream((v) => !v)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
          >
            {profile.dreamHeightCm ? 'Edit goal' : '+ Set goal'}
          </button>
        </div>

        {(editingDream || !profile.dreamHeightCm) && (
          <form onSubmit={handleSaveDream} className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[140px]">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Goal height (cm)
              </span>
              <input
                type="number"
                step="0.5"
                min={110}
                max={245}
                value={dreamInput}
                onChange={(e) => setDreamInput(e.target.value)}
                placeholder="e.g. 183"
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base font-mono-num min-h-[44px]"
              />
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              Save goal
            </button>
          </form>
        )}

        {profile.dreamHeightCm ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Target</p>
                <p className="font-mono-num text-xl font-bold">
                  {formatHeight(profile.dreamHeightCm, units)}
                </p>
              </div>
              {currentHeightCm !== null && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Honest gap</p>
                  <p className="font-mono-num text-base font-bold">
                    {profile.dreamHeightCm - currentHeightCm <= 0
                      ? 'Goal reached'
                      : `+${(profile.dreamHeightCm - currentHeightCm).toFixed(1)} cm away`}
                  </p>
                </div>
              )}
            </div>

            {dreamEstimate ? (
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Chance to reach it:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold font-mono-num ${
                      dreamEstimate.tier === 'High'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : dreamEstimate.tier === 'Medium'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                        : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {dreamEstimate.tier} (~{dreamEstimate.chancePct}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {dreamEstimate.explanation}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                Enter parents&apos; heights above to estimate chance — rough estimate, adult height varies.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Not enough data yet — add a goal height above if you want to compare against your family outlook.
          </p>
        )}
      </section>

      {/* 7. DAILY GROWTH ROUTINE */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">Daily Growth Routine</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real daily check-offs · Honest evidence ratings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-300 text-xs font-bold font-mono-num">
              <Flame className="w-3.5 h-3.5" /> {growthStreakDays}d streak
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold font-mono-num">
              {growthHabitsScorePct}% today
            </span>
          </div>
        </div>

        {probablyFinishedGrowing ? (
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-xs font-semibold text-[var(--accent)]">
              Stand Tall Plan active — spinal decompression, upper-back alignment, sleep &amp; daily steps.
            </div>
            {STAND_TALL_PLAN_ITEMS.map((item) => {
              const done = todayCheckedSet.has(item.id);
              const open = expandedHabitId === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    done
                      ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGrowthCheckoff(todayKey, item.id, 12)}
                      aria-label={done ? `Uncheck ${item.title}` : `Check ${item.title}`}
                      className={`mt-0.5 w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] -m-1.5 transition ${
                        done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-white/25 bg-transparent'
                      }`}
                    >
                      {done && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-sm font-semibold ${done ? 'line-through opacity-75' : ''}`}>
                          {item.title}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            item.evidence === 'Proven'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                              : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                          }`}
                        >
                          {item.evidence}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.dose}</p>
                      <button
                        type="button"
                        onClick={() => setExpandedHabitId(open ? null : item.id)}
                        className="text-xs font-semibold text-[var(--accent)] hover:underline min-h-[36px] inline-flex items-center gap-1"
                      >
                        {open ? 'Hide form & links' : 'Watch & why'}
                        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 space-y-2.5 text-xs">
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{item.why}</p>
                      <ExerciseDemoLinks
                        title={item.title}
                        slug={item.id}
                        searchQuery={item.watchQuery}
                        doseLabel={item.dose}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {DAILY_GROWTH_HABITS.map((habit) => {
              const done = todayCheckedSet.has(habit.id);
              const open = expandedHabitId === habit.id;
              return (
                <div
                  key={habit.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    done
                      ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGrowthCheckoff(todayKey, habit.id, habit.xp)}
                      aria-label={done ? `Uncheck ${habit.title}` : `Check ${habit.title}`}
                      className={`mt-0.5 w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] -m-1.5 transition ${
                        done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-white/25 bg-transparent'
                      }`}
                    >
                      {done && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-sm font-semibold ${done ? 'line-through opacity-75' : ''}`}>
                          {habit.title}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            habit.evidence === 'Proven'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                              : habit.evidence === 'Likely works'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                          }`}
                        >
                          {habit.evidence === 'Not proven' ? 'Posture / Not bone growth' : habit.evidence}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">{habit.dose}</p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setExpandedHabitId(open ? null : habit.id)}
                          className="text-xs font-semibold text-[var(--accent)] hover:underline min-h-[36px] inline-flex items-center gap-1"
                        >
                          {open ? 'Hide why & form' : 'Ask why & watch'}
                          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 space-y-2.5 text-xs">
                      <p className="text-slate-700 dark:text-slate-200 font-medium">
                        {habit.evidenceDetail}
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{habit.why}</p>
                      {habit.watchQuery && (
                        <ExerciseDemoLinks
                          title={habit.title}
                          slug={habit.slug}
                          searchQuery={habit.watchQuery}
                          doseLabel={habit.dose}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 8. SUPPLEMENTS AND "TRICKS" (Info cards only — never tasks) */}
      <section className="ascend-card p-5 space-y-3">
        <button
          type="button"
          onClick={() => setShowSupplementsInfo((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left min-h-[44px]"
        >
          <div>
            <h2 className="font-display text-base font-bold">Supplements &amp; &ldquo;Tricks&rdquo;</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Info cards only (never tasks) — plain truth on pills, milk + honey, &amp; clinical treatments
            </p>
          </div>
          <span className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 shrink-0">
            {showSupplementsInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showSupplementsInfo && (
          <div className="space-y-2.5 pt-1">
            {GROWTH_SUPPLEMENTS_INFO.map((item) => (
              <div
                key={item.name}
                className={`p-3.5 rounded-2xl border space-y-1 ${
                  item.category === 'medical'
                    ? 'bg-rose-500/[0.06] border-rose-500/25'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{item.name}</p>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      item.category === 'medical'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                        : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.category === 'medical' ? 'Doctor only' : 'Info only'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.whatItIs}</p>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Verdict: {item.verdict}
                </p>
                {item.risks && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-300">
                    Risks: {item.risks}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 9. 7-DAY GROWTH PROGRAMS (Dots & Levels) */}
      <section className="ascend-card p-5 space-y-3.5">
        <div>
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" /> 7-Day Growth Programs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tap each day dot as you finish it — all saved to your log
          </p>
        </div>

        <div className="space-y-3">
          {SEVEN_DAY_GROWTH_PROGRAMS.map((prog) => {
            const doneDays = programMap[prog.id] ?? [];
            const isOpen = expandedProgramId === prog.id;
            const completeCount = doneDays.length;
            return (
              <div
                key={prog.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{prog.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{prog.subtitle}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold font-mono-num shrink-0">
                    {completeCount}/7 days
                  </span>
                </div>

                {/* 7-day dot strip */}
                <div className="grid grid-cols-7 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                    const checked = doneDays.includes(dayNum);
                    return (
                      <button
                        key={dayNum}
                        type="button"
                        onClick={() => toggleGrowthProgramDay(prog.id, dayNum)}
                        aria-label={`${prog.title} Day ${dayNum}`}
                        className={`min-h-[44px] rounded-xl border text-xs font-mono-num font-bold flex flex-col items-center justify-center transition ${
                          checked
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-white dark:bg-[#0D131F] border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>D{dayNum}</span>
                        {checked && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setExpandedProgramId(isOpen ? null : prog.id)}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 min-h-[36px]"
                  >
                    {isOpen ? 'Hide daily breakdown' : 'See 7-day plan'}
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextDay = [1, 2, 3, 4, 5, 6, 7].find((d) => !doneDays.includes(d)) ?? 1;
                      setActiveGrowthPlayer({ program: prog, dayNumber: nextDay });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
                  >
                    <Play className="w-3.5 h-3.5" /> Start guided player
                  </button>
                </div>

                {isOpen && (
                  <ul className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
                    {prog.dailyFocus.map((line, i) => (
                      <li key={i} className={doneDays.includes(i + 1) ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 10. "CAN I STILL GROW?" / "STAND TALLER" MODE */}
      <section
        className={`ascend-card p-5 space-y-3 ${
          probablyFinishedGrowing ? 'border-amber-500/35 bg-amber-500/[0.04]' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            {probablyFinishedGrowing ? (
              <>
                <Sparkles className="w-4 h-4 text-amber-500" /> Stand Taller Mode
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-[var(--accent)]" /> Can I still grow?
              </>
            )}
          </h2>
          <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[11px] font-semibold">
            Age {profile.age} ·{' '}
            {profile.stillGrowing === 'yes'
              ? 'Still growing'
              : profile.stillGrowing === 'no'
              ? 'Finished growing'
              : 'Unsure'}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Height growth only happens while open growth zones near the ends of your long bones (<strong>growth plates</strong>) are still open — usually closing around ages 15–17 in girls and 17–20 in boys, though timing differs by person. Only a doctor&apos;s hand/wrist X-ray can confirm whether growth plates are still open.
        </p>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Talk to a doctor if height is far below family range, growth slows sharply for over a year, or puberty feels noticeably delayed.
        </p>

        {probablyFinishedGrowing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {STAND_TALLER_TIPS.map((tip) => (
              <div
                key={tip.title}
                className="p-3 rounded-xl bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-1"
              >
                <p className="text-xs font-bold">{tip.title}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tip.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 11. ACHIEVEMENTS, MONTHLY MEASURING REMINDER, GUIDE & ASK COACH */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Award className="w-4 h-4 text-[var(--accent)]" /> Achievements &amp; Measuring Guide
          </h2>
          <button
            type="button"
            onClick={handleToggleMonthlyReminder}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] border ${
              profile.monthlyHeightReminder
                ? 'bg-[var(--accent-soft)] border-[var(--accent)]/35 text-[var(--accent)]'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
            }`}
          >
            {profile.monthlyHeightReminder ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            Monthly reminder: {profile.monthlyHeightReminder ? 'On' : 'Off'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Since you started</p>
            <p className="font-mono-num text-sm font-bold mt-0.5">
              {measuredDeltaCm !== null
                ? `${measuredDeltaCm >= 0 ? '+' : ''}${measuredDeltaCm.toFixed(1)} cm measured (${sortedLogsAsc.length} readings)`
                : sortedLogsAsc.length === 1
                ? '1 reading saved — log again next month to measure change'
                : 'No height readings logged yet'}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Routine consistency</p>
            <p className="font-mono-num text-sm font-bold mt-0.5">
              {growthStreakDays > 0
                ? `${growthStreakDays}-day routine streak`
                : 'Check off today’s growth habits to start a streak'}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          <p className="font-bold text-slate-800 dark:text-slate-100">How to measure accurately (once a month):</p>
          <p>1. Barefoot on a hard floor with heels, calves, glutes, and shoulder blades lightly touching a flat wall.</p>
          <p>2. Look straight ahead (ear canal level with bottom of eye socket), place a flat rigid book on top of the head.</p>
          <p>3. Measure at the same morning time within 30 minutes of waking, take 3 readings, and log the average.</p>
        </div>

        <button
          type="button"
          onClick={onAskCoach}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
        >
          <MessageCircle className="w-4 h-4" /> Ask coach about height
        </button>
      </section>

      {activeGrowthPlayer && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center text-white text-sm font-semibold">
              Loading guided player...
            </div>
          }
        >
          <LazyExercisePlayer
            programId={activeGrowthPlayer.program.id}
            programTitle={activeGrowthPlayer.program.title}
            domain="grow"
            level={1}
            dayNumber={activeGrowthPlayer.dayNumber}
            steps={activeGrowthPlayer.program.guidedSteps}
            onComplete={async (summary) => {
              await db.exerciseLogs.add({
                date: todayKey,
                programId: summary.programId,
                programTitle: summary.programTitle,
                domain: 'grow',
                level: 1,
                minutes: summary.minutes,
                xpEarned: 20,
                completedAt: Date.now(),
              });
              const doneArr = programMap[activeGrowthPlayer.program.id] ?? [];
              if (!doneArr.includes(activeGrowthPlayer.dayNumber)) {
                await toggleGrowthProgramDay(
                  activeGrowthPlayer.program.id,
                  activeGrowthPlayer.dayNumber
                );
              }
              await recalculateXpAndBadges();
              showToast(`Logged ${summary.programTitle} Day ${activeGrowthPlayer.dayNumber} (+20 XP)`);
            }}
            onClose={() => setActiveGrowthPlayer(null)}
          />
        </Suspense>
      )}
    </div>
  );
};
