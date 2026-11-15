import React, { useEffect, useMemo, useState } from 'react';
import {
  Dumbbell,
  Moon,
  Scale,
  Plus,
  Trash2,
  Timer,
  Trophy,
  Play,
  Square,
  Check,
  Utensils,
} from 'lucide-react';
import { db, getOrCreateDailyLog, isUnder18OrGrowing, recalculateXpAndBadges } from '../db/database';
import { toLocalDateKey } from '../lib/date';
import {
  calculateEstimated1RM,
  calculateMifflinStJeor,
  calculateUSNavyBodyFat,
} from '../lib/fitness';
import { SmoothAreaChart } from '../components/ui/Charts';
import { CircularRing } from '../components/ui/ProgressRings';
import type {
  BodyMetricEntry,
  DailyLog,
  UserProfile,
  WorkoutExercise,
  WorkoutSession,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';

interface TrackersScreenProps {
  profile: UserProfile;
  dailyLogs: DailyLog[];
  bodyMetrics: BodyMetricEntry[];
  workouts: WorkoutSession[];
  initialTab?: string;
  onOpenNutrition?: () => void;
}

const DEFAULT_EXERCISES = [
  'Goblet Squat',
  'Bench Press / Push-Up',
  'Lat Pulldown / Pull-Up',
  'Romanian Deadlift',
  'Overhead Dumbbell Press',
  'Dumbbell Lateral Raise',
  'Dumbbell Shrug',
];

export const TrackersScreen: React.FC<TrackersScreenProps> = ({
  profile,
  dailyLogs,
  bodyMetrics,
  workouts,
  initialTab,
  onOpenNutrition,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'body' | 'sleep' | 'workouts'>(
    initialTab === 'workouts' ? 'workouts' : initialTab === 'sleep' ? 'sleep' : 'body'
  );

  // Body & Calculators state
  const [weightKg, setWeightKg] = useState(String(profile.weightKg));
  const [waistCm, setWaistCm] = useState(profile.waistCm ? String(profile.waistCm) : '82');
  const [neckCm, setNeckCm] = useState(profile.neckCm ? String(profile.neckCm) : '38');
  const [goalMode, setGoalMode] = useState<'cut' | 'maintain' | 'lean_gain'>('maintain');

  // Sleep log state
  const [sleepHours, setSleepHours] = useState('7.5');
  const [sleepQuality, setSleepQuality] = useState(4);
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('06:30');

  // Workout builder state
  const [workoutName, setWorkoutName] = useState('Full Body A');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([
    { name: 'Bench Press / Push-Up', sets: [{ reps: 8, weightKg: 60, completed: false }] },
    { name: 'Lat Pulldown / Pull-Up', sets: [{ reps: 10, weightKg: 55, completed: false }] },
  ]);
  const [newExName, setNewExName] = useState(DEFAULT_EXERCISES[0]);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const t = setTimeout(() => {
      if (restSeconds === 1) {
        showToast('Rest timer complete — next set ready');
        setRestSeconds(null);
      } else {
        setRestSeconds(restSeconds - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [restSeconds, showToast]);

  const hideCut = isUnder18OrGrowing(profile);
  const safeGoalMode = hideCut && goalMode === 'cut' ? 'maintain' : goalMode;

  const calorieCalc = useMemo(
    () =>
      calculateMifflinStJeor({
        sex: profile.sex,
        weightKg: Number(weightKg) || profile.weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        activityLevel: profile.activityLevel,
        goalMode: safeGoalMode,
      }),
    [profile, weightKg, safeGoalMode]
  );

  const navyBf = useMemo(
    () =>
      calculateUSNavyBodyFat({
        sex: profile.sex,
        heightCm: profile.heightCm,
        waistCm: Number(waistCm) || 0,
        neckCm: Number(neckCm) || 0,
      }),
    [profile.sex, profile.heightCm, waistCm, neckCm]
  );

  const sleepLogs = useMemo(
    () => dailyLogs.filter((l) => l.sleepHours > 0).sort((a, b) => a.date.localeCompare(b.date)),
    [dailyLogs]
  );

  const sleepScore = useMemo(() => {
    const recent = sleepLogs.slice(-7);
    if (recent.length === 0) return 0;
    const avgHrs = recent.reduce((s, l) => s + l.sleepHours, 0) / recent.length;
    const avgQual = recent.reduce((s, l) => s + (l.sleepQuality || 3), 0) / recent.length;
    const hrsScore = Math.max(0, 100 - Math.abs(avgHrs - profile.targetSleepHours) * 18);
    return Math.round(hrsScore * 0.65 + (avgQual / 5) * 100 * 0.35);
  }, [sleepLogs, profile.targetSleepHours]);

  // Compute Personal Records (max estimated 1RM per exercise)
  const personalRecords = useMemo(() => {
    const map = new Map<string, { oneRm: number; date: string; weight: number; reps: number }>();
    for (const w of workouts) {
      for (const ex of w.exercises) {
        for (const st of ex.sets) {
          const est = calculateEstimated1RM(st.weightKg, st.reps);
          const prev = map.get(ex.name);
          if (est > 0 && (!prev || est > prev.oneRm)) {
            map.set(ex.name, { oneRm: est, date: w.date, weight: st.weightKg, reps: st.reps });
          }
        }
      }
    }
    return Array.from(map.entries());
  }, [workouts]);

  const handleSaveBody = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weightKg);
    const waist = Number(waistCm) || null;
    const neck = Number(neckCm) || null;
    const today = toLocalDateKey();
    await db.bodyMetrics.add({
      date: today,
      weightKg: w,
      waistCm: waist,
      neckCm: neck,
      bodyFatPct: navyBf?.bodyFatPct ?? null,
      createdAt: Date.now(),
    });
    await db.profile.update('me', {
      weightKg: w,
      waistCm: waist,
      neckCm: neck,
      calorieGoal: calorieCalc.recommendedCalories,
      proteinTargetG: calorieCalc.proteinGrams,
      waterTargetMl: calorieCalc.waterMl,
      updatedAt: Date.now(),
    });
    showToast('Saved body metrics & updated calorie/protein targets');
  };

  const handleSaveSleep = async (e: React.FormEvent) => {
    e.preventDefault();
    const today = toLocalDateKey();
    await getOrCreateDailyLog(today);
    await db.dailyLogs.update(today, {
      sleepHours: Number(sleepHours),
      sleepQuality,
      bedtime,
      wakeTime,
      updatedAt: Date.now(),
    });
    showToast('Sleep entry logged');
  };

  const handleSaveWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exercises.length === 0) return;
    await db.workouts.add({
      date: toLocalDateKey(),
      name: workoutName.trim() || 'Training Session',
      durationMin: 45,
      exercises,
      notes: '',
      createdAt: Date.now(),
    });
    await recalculateXpAndBadges();
    showToast('Workout logged (+40 XP)');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Lifestyle Trackers &amp; Gym</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Transparent formulas · Real logged averages · Automatic 1RM &amp; PR tracking
        </p>
      </div>

      <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 w-fit max-w-full overflow-x-auto">
        {([
          { id: 'body', label: 'Body & Calories', icon: <Scale className="w-3.5 h-3.5" /> },
          { id: 'sleep', label: 'Sleep', icon: <Moon className="w-3.5 h-3.5" /> },
          { id: 'workouts', label: 'Workouts & PRs', icon: <Dumbbell className="w-3.5 h-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0 transition ${
              tab === t.id
                ? 'bg-white dark:bg-[#0E1612] text-slate-900 dark:text-white shadow-sm border border-transparent dark:border-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* BODY & NUTRITION */}
      {tab === 'body' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form onSubmit={handleSaveBody} className="lg:col-span-6 ascend-card p-4 space-y-4">
            <h2 className="font-display text-base font-bold">Body Composition &amp; Targets</h2>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Waist (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={waistCm}
                  onChange={(e) => setWaistCm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Neck (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={neckCm}
                  onChange={(e) => setNeckCm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                />
              </div>
            </div>

            {hideCut ? (
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 space-y-1.5 text-xs">
                <p className="font-bold text-sky-700 dark:text-sky-300">
                  Growth-first mode (Under 18 / Still growing)
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Calorie-cut calculators are hidden while you are growing. Focus on: eat enough, sleep 8–10h, stay active.
                </p>
                <div className="flex justify-between pt-1">
                  <span>Protein target</span>
                  <strong className="font-mono-num">{calorieCalc.proteinGrams} g/day</strong>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Pace Goal</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'cut', label: 'Gradual Cut' },
                      { id: 'maintain', label: 'Maintain' },
                      { id: 'lean_gain', label: 'Lean Gain' },
                    ] as const).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGoalMode(g.id)}
                        className={`py-2 rounded-xl text-xs font-semibold min-h-[44px] ${
                          safeGoalMode === g.id
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'bg-slate-100 dark:bg-white/5'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>US Navy Body Fat (approximate)</span>
                    <strong className="font-mono-num text-[var(--accent)]">
                      {navyBf ? `${navyBf.bodyFatPct}%` : 'Enter waist > neck'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Calorie Target (Floor {calorieCalc.safeFloor} kcal)</span>
                    <strong className="font-mono-num">{calorieCalc.recommendedCalories} kcal</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Protein Target</span>
                    <strong className="font-mono-num">{calorieCalc.proteinGrams} g/day</strong>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-200 dark:border-white/10">
                    {calorieCalc.formulaLabel}. {navyBf ? navyBf.formulaText : ''} Facial fat cannot be spot-reduced; steady systemic pacing works best.
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
            >
              Save Measurement &amp; Apply Targets
            </button>
          </form>

          <div className="lg:col-span-6 space-y-4">
            {onOpenNutrition && (
              <div className="ascend-card ascend-hero-glow p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                    Multimodal Plate Scanner
                  </p>
                  <p className="text-sm font-bold truncate mt-0.5">
                    AI Nutrition &amp; Debloat Vision
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Snap your meal for instant macros, sodium &amp; 4L hydration tracking.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenNutrition}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px]"
                >
                  <Utensils className="w-4 h-4" />
                  Scan Meal
                </button>
              </div>
            )}
            <div className="ascend-card p-4 space-y-2">
              <h2 className="font-display text-base font-bold">Weight Trend</h2>
              <SmoothAreaChart
                points={[...bodyMetrics]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((m) => ({ label: m.date.slice(5), value: m.weightKg }))}
                unit=" kg"
                emptyLabel="Log your weight to chart trend over time."
              />
            </div>

            <div className="ascend-card p-4 space-y-2">
              <h2 className="font-display text-base font-bold">Waist &amp; Body Fat History</h2>
              {bodyMetrics.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  No measurements logged yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10 max-h-48 overflow-y-auto">
                  {[...bodyMetrics].reverse().map((m) => (
                    <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                      <span>{m.date}</span>
                      <span className="font-mono-num">
                        {m.weightKg} kg {m.waistCm ? `· ${m.waistCm} cm` : ''}{' '}
                        {m.bodyFatPct ? `· ~${m.bodyFatPct}% BF` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SLEEP */}
      {tab === 'sleep' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 ascend-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">7-Day Sleep Consistency</p>
                <div className="font-mono-num text-3xl font-bold mt-1">
                  {sleepLogs.length > 0 ? `${sleepScore}/100` : 'No logs'}
                </div>
              </div>
              <CircularRing value={sleepScore} size={76} strokeWidth={7} color="var(--series-lavender)">
                <Moon className="w-5 h-5 text-violet-400" />
              </CircularRing>
            </div>

            <form onSubmit={handleSaveSleep} className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Bedtime</label>
                  <input
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Wake</label>
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Quality (1–5):</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSleepQuality(q)}
                      className={`w-9 h-9 rounded-xl font-mono-num text-xs font-bold ${
                        sleepQuality === q
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-slate-100 dark:bg-white/5'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
              >
                Log Tonight&apos;s / Last Night&apos;s Sleep
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 ascend-card p-5 space-y-4">
            <h2 className="font-display text-base font-bold">Sleep Duration &amp; Bed/Wake Blocks</h2>
            <SmoothAreaChart
              points={sleepLogs.slice(-14).map((l) => ({ label: l.date.slice(5), value: l.sleepHours }))}
              unit="h"
              color="var(--series-lavender)"
              minVal={4}
              maxVal={10}
              emptyLabel="Log sleep hours to view your duration chart."
            />
            {sleepLogs.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-white/10 max-h-48 overflow-y-auto text-xs">
                {[...sleepLogs].reverse().slice(0, 7).map((l) => (
                  <div key={l.date} className="py-2 flex items-center justify-between">
                    <span>{l.date}</span>
                    <span className="font-mono-num">
                      {l.sleepHours}h · Q{l.sleepQuality}/5 {l.bedtime && l.wakeTime ? `· ${l.bedtime}→${l.wakeTime}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKOUTS */}
      {tab === 'workouts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form onSubmit={handleSaveWorkout} className="lg:col-span-7 ascend-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                className="font-display text-base font-bold bg-transparent border-b border-slate-300 dark:border-white/20 focus:outline-none pb-1"
              />
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-[var(--accent)]" />
                {restSeconds !== null ? (
                  <button
                    type="button"
                    onClick={() => setRestSeconds(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-400 font-mono-num text-xs font-bold"
                  >
                    <Square className="w-3 h-3" /> {restSeconds}s
                  </button>
                ) : (
                  <div className="flex gap-1">
                    {[60, 90, 120].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setRestSeconds(sec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-mono-num font-semibold"
                      >
                        <Play className="w-3 h-3" /> {sec}s
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {exercises.map((ex, exIdx) => (
                <div
                  key={`${ex.name}-${exIdx}`}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{ex.name}</span>
                    <button
                      type="button"
                      onClick={() => setExercises((prev) => prev.filter((_, i) => i !== exIdx))}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {ex.sets.map((st, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-2 font-mono-num text-slate-500">Set {sIdx + 1}</span>
                      <div className="col-span-4 flex items-center gap-1">
                        <input
                          type="number"
                          value={st.weightKg}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setExercises((prev) =>
                              prev.map((item, i) =>
                                i === exIdx
                                  ? {
                                      ...item,
                                      sets: item.sets.map((s, j) => (j === sIdx ? { ...s, weightKg: val } : s)),
                                    }
                                  : item
                              )
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 font-mono-num"
                        />
                        <span>kg</span>
                      </div>
                      <div className="col-span-4 flex items-center gap-1">
                        <input
                          type="number"
                          value={st.reps}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setExercises((prev) =>
                              prev.map((item, i) =>
                                i === exIdx
                                  ? {
                                      ...item,
                                      sets: item.sets.map((s, j) => (j === sIdx ? { ...s, reps: val } : s)),
                                    }
                                  : item
                              )
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 font-mono-num"
                        />
                        <span>reps</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setExercises((prev) =>
                            prev.map((item, i) =>
                              i === exIdx
                                ? {
                                    ...item,
                                    sets: item.sets.map((s, j) =>
                                      j === sIdx ? { ...s, completed: !s.completed } : s
                                    ),
                                  }
                                : item
                            )
                          );
                          if (!st.completed) setRestSeconds(90);
                        }}
                        className={`col-span-2 h-8 rounded-lg flex items-center justify-center ${
                          st.completed
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'bg-slate-200 dark:bg-white/10'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExercises((prev) =>
                          prev.map((item, i) =>
                            i === exIdx
                              ? {
                                  ...item,
                                  sets: [
                                    ...item.sets,
                                    { ...(item.sets[item.sets.length - 1] ?? { reps: 8, weightKg: 40 }), completed: false },
                                  ],
                                }
                              : item
                          )
                        )
                      }
                      className="text-[var(--accent)] font-semibold"
                    >
                      + Add Set
                    </button>
                    <span className="font-mono-num text-slate-500">
                      Est. 1RM:{' '}
                      {Math.max(...ex.sets.map((s) => calculateEstimated1RM(s.weightKg, s.reps)), 0)} kg
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <select
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[42px]"
              >
                {DEFAULT_EXERCISES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setExercises((prev) => [
                    ...prev,
                    { name: newExName, sets: [{ reps: 10, weightKg: 30, completed: false }] },
                  ])
                }
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[42px]"
              >
                <Plus className="w-4 h-4" /> Exercise
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              Finish &amp; Save Workout Session
            </button>
          </form>

          <div className="lg:col-span-5 space-y-4">
            <div className="ascend-card p-4 space-y-2.5">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Personal Records (Est. 1RM)
              </h2>
              {personalRecords.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Log your first workout session to compute automatic 1RM PRs.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10 text-xs">
                  {personalRecords.map(([name, pr]) => (
                    <div key={name} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {pr.weight} kg × {pr.reps} · {pr.date}
                        </p>
                      </div>
                      <span className="font-mono-num font-bold text-[var(--accent)]">
                        {pr.oneRm} kg
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ascend-card p-4 space-y-2.5">
              <h2 className="font-display text-base font-bold">Recent Sessions ({workouts.length})</h2>
              {workouts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No workouts saved yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
                  {[...workouts].reverse().map((w) => (
                    <div key={w.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{w.name}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {w.date} · {w.exercises.length} exercises
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => db.workouts.delete(w.id!)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
