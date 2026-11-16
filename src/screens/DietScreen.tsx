import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Flame,
  HelpCircle,
  Lock,
  MessageSquareText,
  PenLine,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  isAgeUnknown,
  isUnder18OrGrowing,
  saveAndVerifyProfile,
  saveMealScanEntry,
} from '../db/database';
import {
  evaluateMealFitForToday,
  MEAL_LIBRARY,
  type LibraryMealItem,
} from '../data/mealLibrary';
import { en } from '../i18n/en';
import { formatDisplayNumber } from '../i18n/arabicHints';
import { addDays, toLocalDateKey } from '../lib/date';
import { computeFightCampPlan } from '../lib/fightCamp';
import { calculateMifflinStJeor } from '../lib/fitness';
import {
  computeDailyNutritionTargets,
  computeDebloatImpact,
  evaluateWeeklyWeightAdjustment,
  resolveSafeDietGoal,
} from '../lib/nutrition';
import { CircularRing } from '../components/ui/ProgressRings';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  DietGoalMode,
  MealFoodItem,
  MealScanEntry,
  MealType,
  UserProfile,
} from '../types';

interface DietScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  bodyMetrics: BodyMetricEntry[];
  onBack: () => void;
  onNavigate: (screen: string, subTab?: string) => void;
  onOpenCoach?: (prompt?: string) => void;
}

interface EditableMealDraft {
  id: string;
  title: string;
  slot: MealType;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  sodiumMg: number;
  addedSugarG: number;
}

export const DietScreen: React.FC<DietScreenProps> = ({
  profile,
  settings,
  dailyLogs,
  mealScans,
  bodyMetrics,
  onBack,
  onNavigate,
  onOpenCoach,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const hideCut = isUnder18OrGrowing(profile);
  const ageUnknown = isAgeUnknown(profile);
  const arabicDigits = Boolean(settings.arabicIndicDigits);

  const { goal: activeGoal } = useMemo(() => resolveSafeDietGoal(profile), [profile]);
  const targets = useMemo(
    () => computeDailyNutritionTargets(profile, activeGoal),
    [profile, activeGoal]
  );

  const [showMath, setShowMath] = useState(false);
  const [mealSearch, setMealSearch] = useState('');
  const [mealFilter, setMealFilter] = useState<'all' | 'street' | 'egypt'>('all');
  const [editingMeal, setEditingMeal] = useState<EditableMealDraft | null>(null);

  const todayLog = useMemo(
    () => dailyLogs.find((l) => l.date === todayKey),
    [dailyLogs, todayKey]
  );
  const todayMeals = useMemo(
    () => mealScans.filter((m) => m.date === todayKey),
    [mealScans, todayKey]
  );

  const totals = useMemo(() => {
    const mealCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const mealPro = todayMeals.reduce((s, m) => s + m.totalProteinG, 0);
    return {
      calories: Math.max(mealCal, todayLog?.calories ?? 0),
      proteinG: Number(Math.max(mealPro, todayLog?.proteinG ?? 0).toFixed(1)),
    };
  }, [todayMeals, todayLog]);

  const calTarget = profile.calorieGoal || targets.calories;
  const proteinTarget = profile.proteinTargetG || targets.proteinG;
  const calPct = Math.min(100, Math.round((totals.calories / Math.max(1, calTarget)) * 100));
  const proPct = Math.min(100, Math.round((totals.proteinG / Math.max(1, proteinTarget)) * 100));
  const kcalLeft = Math.max(0, calTarget - totals.calories);

  const fightCampActive =
    !hideCut &&
    (profile.mainGoalMode === 'fight_camp' || profile.mainGoalMode === 'both');

  const fightCampPlan = useMemo(
    () =>
      computeFightCampPlan({
        profile,
        bodyMetrics,
        todayLog: todayLog ?? null,
        todayMode: settings.dayModeByDate?.[todayKey] ?? 'gym',
        todayKey,
      }),
    [profile, bodyMetrics, todayLog, settings.dayModeByDate, todayKey]
  );

  const mifflinMath = useMemo(
    () =>
      calculateMifflinStJeor({
        sex: profile.sex,
        weightKg: profile.weightKg || 74,
        heightCm: profile.heightCm || 178,
        age: profile.age || 20,
        activityLevel: profile.activityLevel || 'moderate',
        goalMode: activeGoal,
      }),
    [profile.sex, profile.weightKg, profile.heightCm, profile.age, profile.activityLevel, activeGoal]
  );

  const weeklyAdjust = useMemo(
    () => evaluateWeeklyWeightAdjustment(profile, bodyMetrics, todayKey),
    [profile, bodyMetrics, todayKey]
  );

  const recentWeightStats = useMemo(() => {
    const sorted = [...bodyMetrics]
      .filter((m) => m.weightKg > 20)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const weekStart = addDays(todayKey, -6);
    const weekVals = sorted.filter((m) => m.date >= weekStart && m.date <= todayKey);
    const avg7d =
      weekVals.length > 0
        ? Number((weekVals.reduce((s, m) => s + m.weightKg, 0) / weekVals.length).toFixed(1))
        : null;
    const latest = sorted[0]?.weightKg ?? null;
    return {
      count: sorted.length,
      latest,
      avg7d,
    };
  }, [bodyMetrics, todayKey]);

  const filteredMeals = useMemo(() => {
    const q = mealSearch.trim().toLowerCase();
    return MEAL_LIBRARY.filter((m) => {
      if (mealFilter === 'street' && !m.isStreetFood) return false;
      if (mealFilter === 'egypt' && !m.isStaple && !m.isStreetFood) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.why.toLowerCase().includes(q) ||
        (m.lighterSwap && m.lighterSwap.toLowerCase().includes(q))
      );
    }).slice(0, 18);
  }, [mealSearch, mealFilter]);

  const handleSelectGoal = async (nextGoal: DietGoalMode) => {
    const resolved = resolveSafeDietGoal(profile, nextGoal);
    const nextTargets = computeDailyNutritionTargets(profile, resolved.goal);
    await saveAndVerifyProfile({
      ...profile,
      dietGoal: resolved.goal,
      calorieGoal: nextTargets.calories,
      proteinTargetG: nextTargets.proteinG,
      waterTargetMl: nextTargets.debloatWaterMl,
    });
    const label =
      resolved.goal === 'cut'
        ? en.diet.loseFat
        : resolved.goal === 'lean_gain'
        ? en.diet.buildMuscle
        : en.diet.staySame;
    showToast(`Diet goal: ${label} (${nextTargets.calories} kcal)`);
  };

  const handleToggleFightCamp = async () => {
    if (hideCut) return;
    const nextMode = fightCampActive ? 'look_better' : 'fight_camp';
    await saveAndVerifyProfile({
      ...profile,
      mainGoalMode: nextMode,
    });
    showToast(fightCampActive ? 'Fight camp turned off' : 'Fight camp active');
  };

  const handleApplyWeeklyAdjustment = async () => {
    if (hideCut || weeklyAdjust.suggestedCalorieGoal === null) return;
    await saveAndVerifyProfile({
      ...profile,
      calorieGoal: weeklyAdjust.suggestedCalorieGoal,
    });
    showToast(`Updated daily target to ${weeklyAdjust.suggestedCalorieGoal} kcal`);
  };

  const handleLogMealDraft = async (meal: EditableMealDraft) => {
    const item: MealFoodItem = {
      id: `diet-${Date.now()}`,
      name: meal.title.trim() || 'Meal',
      portionGrams: Math.max(10, Math.round(meal.grams)),
      baseGrams: Math.max(10, Math.round(meal.grams)),
      calories: Math.max(0, Math.round(meal.calories)),
      proteinG: Math.max(0, Number(meal.proteinG.toFixed(1))),
      carbsG: Math.max(0, Number(meal.carbsG.toFixed(1))),
      fatsG: Math.max(0, Number(meal.fatsG.toFixed(1))),
      sodiumMg: Math.max(0, Math.round(meal.sodiumMg)),
      addedSugarG: Math.max(0, Number(meal.addedSugarG.toFixed(1))),
      notes: 'Logged from Diet library (editable estimate)',
    };
    const debloat = computeDebloatImpact(item.sodiumMg, item.addedSugarG);
    await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealType: meal.slot,
      mealTitle: item.name,
      confidence: 'Medium',
      items: [item],
      totalCalories: item.calories,
      totalProteinG: item.proteinG,
      totalCarbsG: item.carbsG,
      totalFatsG: item.fatsG,
      totalSodiumMg: item.sodiumMg,
      totalAddedSugarG: item.addedSugarG,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: `${en.meals[meal.slot]} · Estimate edited/logged from Diet`,
      isManual: true,
    });
    setEditingMeal(null);
    showToast(`Logged "${item.name}" to ${en.meals[meal.slot]}`);
  };

  const openEditor = (m: LibraryMealItem) => {
    setEditingMeal({
      id: m.id,
      title: m.title,
      slot: m.slot,
      grams: m.grams,
      calories: m.calories,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatsG: m.fatsG,
      sodiumMg: m.sodiumMg,
      addedSugarG: m.addedSugarG,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold truncate">Diet &amp; Daily Targets</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hideCut
                ? 'Steady fuel & protein targets · Set age in Settings to unlock cut controls'
                : 'Goal, calories, protein, weekly trend & everyday Egyptian meals'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onOpenCoach && (
            <button
              type="button"
              onClick={() => onOpenCoach('Adjust my diet or suggest easy meals for today')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[44px]"
            >
              <MessageSquareText className="w-4 h-4" /> Ask
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('food')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
          >
            Food Log
          </button>
        </div>
      </div>

      {/* Under-18 / Unknown-Age Safety Notice (always visible, hides deficit/cut options) */}
      {(hideCut || ageUnknown) && (
        <section className="ascend-card p-4 bg-sky-500/10 border border-sky-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Lock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-slate-900 dark:text-white">
                Set your age to unlock this
              </p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {ageUnknown
                  ? 'Deficit, fat-loss, and Fight Camp weight-cut options stay hidden until an adult age (18+) is confirmed.'
                  : 'While under 18 or still growing, calorie-deficit and Fight Camp cuts are hidden. Eat enough to fuel training and growth.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[44px] shrink-0"
          >
            Open Settings
          </button>
        </section>
      )}

      {/* Goal Picker + Fight Camp (age >= 18 only) */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">{en.diet.goalTitle}</h2>
          <button
            type="button"
            onClick={() => setShowMath((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[var(--accent)] min-h-[36px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showMath ? 'Hide formula' : 'How targets work'}
          </button>
        </div>

        <div className={`grid gap-2 ${hideCut ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {!hideCut && (
            <button
              type="button"
              onClick={() => void handleSelectGoal('cut')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] transition ${
                activeGoal === 'cut'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                  : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
              }`}
            >
              {en.diet.loseFat}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSelectGoal('maintain')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] transition ${
              activeGoal === 'maintain'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
            }`}
          >
            {en.diet.staySame}
          </button>
          <button
            type="button"
            onClick={() => void handleSelectGoal('lean_gain')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] transition ${
              activeGoal === 'lean_gain'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
            }`}
          >
            {en.diet.buildMuscle}
          </button>
          {!hideCut && (
            <button
              type="button"
              onClick={() => void handleToggleFightCamp()}
              className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] transition ${
                fightCampActive
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
              }`}
            >
              <Shield className="w-3.5 h-3.5" /> Fight camp
            </button>
          )}
        </div>

        {showMath && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-mono-num">
              BMR: <strong>{mifflinMath.bmr}</strong> kcal · TDEE: <strong>{mifflinMath.tdee}</strong> kcal · Safe floor: <strong>{mifflinMath.safeFloor}</strong> kcal
            </p>
            <p>{mifflinMath.formulaLabel}. Numbers are starting estimates — adjust from your 2-week weight average.</p>
          </div>
        )}

        {fightCampActive && !hideCut && fightCampPlan.allowed && (
          <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-xs space-y-1">
            <p className="font-bold text-[var(--accent)] flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> Fight Camp Target Active
            </p>
            <p className="text-slate-700 dark:text-slate-200">
              Safe weekly pace: <strong>{fightCampPlan.safeWeeklyPaceKg} kg/wk</strong> · Camp fuel:{' '}
              <strong className="font-mono-num">{fightCampPlan.dailyCalorieTarget} kcal</strong> · Protein:{' '}
              <strong className="font-mono-num">{fightCampPlan.proteinTargetG}g</strong>
              {fightCampPlan.targetWeightKg ? ` · Goal: ${fightCampPlan.targetWeightKg} kg` : ''}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {fightCampPlan.trainingDayTip}
            </p>
          </div>
        )}

        {/* Daily Calorie & Protein Target Rings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3.5">
            <CircularRing value={calPct} size={68} strokeWidth={7} color="var(--accent)">
              <span className="font-mono-num text-xs font-bold">
                {formatDisplayNumber(`${calPct}%`, arabicDigits)}
              </span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[var(--accent)]" /> Daily Calories
              </p>
              <p className="font-mono-num text-lg font-bold">
                {formatDisplayNumber(totals.calories, arabicDigits)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatDisplayNumber(calTarget, arabicDigits)} kcal
                </span>
              </p>
              <p className="text-xs font-mono-num text-[var(--accent)]">
                {hideCut
                  ? 'Steady fuel target'
                  : `${formatDisplayNumber(kcalLeft, arabicDigits)} kcal left`}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3.5">
            <CircularRing value={proPct} size={68} strokeWidth={7} color="#10B981">
              <span className="font-mono-num text-xs font-bold">
                {formatDisplayNumber(`${proPct}%`, arabicDigits)}
              </span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Daily Protein Target
              </p>
              <p className="font-mono-num text-lg font-bold">
                {formatDisplayNumber(`${totals.proteinG}g`, arabicDigits)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatDisplayNumber(`${proteinTarget}g`, arabicDigits)}
                </span>
              </p>
              <p className="text-xs font-mono-num text-emerald-500">
                {formatDisplayNumber(`${Math.max(0, Math.round(proteinTarget - totals.proteinG))}g left`, arabicDigits)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Weight Trend + Weekly Auto-Adjust Note */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
            Weekly Weight Trend &amp; Auto-Adjust
          </h2>
          <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[10px] font-bold uppercase tracking-wider">
            Real Logs Only
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">7-day average</p>
            <p className="font-mono-num text-base font-bold mt-0.5">
              {recentWeightStats.avg7d !== null ? `${recentWeightStats.avg7d} kg` : 'Not enough data yet'}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-slate-500 dark:text-slate-400">Latest logged weight</p>
            <p className="font-mono-num text-base font-bold mt-0.5">
              {recentWeightStats.latest !== null ? `${recentWeightStats.latest} kg` : 'No weigh-ins yet'}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2 text-xs">
          <p className="font-bold">{weeklyAdjust.headline}</p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {hideCut
              ? 'While under 18 or age unset, keep steady meals and track how energy feels — calorie cuts stay turned off.'
              : weeklyAdjust.detail}
          </p>
          {!hideCut &&
            (weeklyAdjust.status === 'nudge_down' || weeklyAdjust.status === 'nudge_up') &&
            weeklyAdjust.suggestedCalorieGoal !== null && (
              <button
                type="button"
                onClick={() => void handleApplyWeeklyAdjustment()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Check className="w-4 h-4" /> Apply{' '}
                {weeklyAdjust.deltaCalories > 0
                  ? `+${weeklyAdjust.deltaCalories}`
                  : weeklyAdjust.deltaCalories}{' '}
                kcal ({weeklyAdjust.suggestedCalorieGoal} kcal)
              </button>
            )}
        </div>
      </section>

      {/* "What should I eat?" + Meal Library incl. Egyptian Street Food (estimates, editable) */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" /> What should I eat?
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {en.streetFood.estimateBadge} · Edit any item to match your real plate
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={mealSearch}
              onChange={(e) => setMealSearch(e.target.value)}
              placeholder="Search koshari, foul, chicken, eggs, shawarma..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex gap-1.5">
            {([
              { id: 'all', label: 'All meals' },
              { id: 'egypt', label: 'Egyptian staples' },
              { id: 'street', label: 'Street food' },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMealFilter(f.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[44px] ${
                  mealFilter === f.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-slate-100 dark:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {editingMeal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogMealDraft(editingMeal);
            }}
            className="p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-sm">Edit estimate before logging</p>
              <button
                type="button"
                onClick={() => setEditingMeal(null)}
                className="px-2.5 py-1 rounded-lg bg-white/70 dark:bg-white/10 font-semibold min-h-[36px]"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={editingMeal.title}
                onChange={(e) => setEditingMeal({ ...editingMeal, title: e.target.value })}
                className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] font-semibold min-h-[44px]"
              />
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Calories (kcal)</label>
                <input
                  type="number"
                  min={0}
                  value={editingMeal.calories}
                  onChange={(e) =>
                    setEditingMeal({ ...editingMeal, calories: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Protein (g)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={editingMeal.proteinG}
                  onChange={(e) =>
                    setEditingMeal({ ...editingMeal, proteinG: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Portion (g)</label>
                <input
                  type="number"
                  min={10}
                  value={editingMeal.grams}
                  onChange={(e) =>
                    setEditingMeal({ ...editingMeal, grams: Number(e.target.value) || 100 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Meal slot</label>
                <select
                  value={editingMeal.slot}
                  onChange={(e) =>
                    setEditingMeal({ ...editingMeal, slot: e.target.value as MealType })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] min-h-[44px]"
                >
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => (
                    <option key={s} value={s}>
                      {en.meals[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[44px]"
            >
              Save &amp; Log Meal
            </button>
          </form>
        )}

        <div className="space-y-2">
          {filteredMeals.map((m) => {
            const fit = !hideCut ? evaluateMealFitForToday(m.calories, kcalLeft) : null;
            return (
              <div
                key={m.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span aria-hidden="true">{m.icon}</span>
                    <p className="text-sm font-bold">{m.title}</p>
                    {m.isStreetFood && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-bold">
                        Street food
                      </span>
                    )}
                    {fit && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          fit === 'Fits today'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {fit}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono-num text-[var(--accent)]">
                    {m.calorieRange ? `${m.calorieRange} kcal` : `~${m.calories} kcal`} · {m.proteinG}g protein · {m.grams}g
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {m.why}
                    {m.lighterSwap ? ` · Lighter swap: ${m.lighterSwap}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditor(m)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleLogMealDraft({
                        id: m.id,
                        title: m.title,
                        slot: m.slot,
                        grams: m.grams,
                        calories: m.calories,
                        proteinG: m.proteinG,
                        carbsG: m.carbsG,
                        fatsG: m.fatsG,
                        sodiumMg: m.sodiumMg,
                        addedSugarG: m.addedSugarG,
                      })
                    }
                    className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                  >
                    + Log
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <ShieldAlert className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <span>All calorie &amp; macro numbers are practical estimates saved only on your device.</span>
      </div>
    </div>
  );
};
