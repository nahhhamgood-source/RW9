import { addDays, daysBetween, toLocalDateKey } from './date';
import { calculateMifflinStJeor } from './fitness';
import { EVENT_OUTCOME_OPTIONS, getEventOutcomeOption } from '../data/eventPresets';
import type {
  AppSettings,
  BodyMetricEntry,
  CustomFoodEntry,
  DailyLog,
  DayTrackingStatus,
  EventOutcomeLevel,
  MealScanEntry,
  MealType,
  RealLifeFoodSettings,
  UserProfile,
  WorkoutSession,
} from '../types';

export function createDefaultRealLifeSettings(): RealLifeFoodSettings {
  return {
    loggingDetail: 'easy',
    budgetView: 'daily',
    showNumbers: 'full',
    eventModeEnabled: true,
    galleryImportEnabled: true,
    nextMorningCheckinEnabled: true,
    dailyOneQuestionEnabled: true,
    dailyOneQuestionTime: '21:00',
    autoFillUsualMeals: false,
    shareIntoAscendEnabled: true,
    includeEstimatedInAverages: true,
    justTakePhotosMode: false,
    foodReminderMode: 'if_empty_by_time',
    foodReminderEmptyTime: '20:00',
    habitStackCue: 'none',
    habitStackCustomText: '',
    targetSource: 'auto',
    kitchenScaleMode: false,
  };
}

export function getRealLifeSettings(
  settings?: Partial<AppSettings> | null
): RealLifeFoodSettings {
  return {
    ...createDefaultRealLifeSettings(),
    ...(settings?.realLifeFood ?? {}),
  };
}

export function isAdultFoodCalorieToolAllowed(
  profile: Pick<UserProfile, 'age' | 'stillGrowing' | 'ageExplicitlySet' | 'onboardingSkipped'>
): boolean {
  if (!Number.isFinite(profile.age) || profile.age <= 0) return false;
  if (profile.ageExplicitlySet === false) return false;
  if (profile.onboardingSkipped && profile.ageExplicitlySet !== true) return false;
  if (profile.age < 18 || profile.stillGrowing === 'yes') return false;
  return true;
}

export interface DayTrackingSummary {
  date: string;
  status: DayTrackingStatus;
  confidenceWeight: number;
  label: string;
  totalCalories: number;
  totalProteinG: number;
  mealCount: number;
  hasEvent: boolean;
}

export function classifyDayTrackingStatus(params: {
  dateKey: string;
  dailyLog?: DailyLog | null;
  meals: MealScanEntry[];
  settings?: Partial<AppSettings> | null;
}): DayTrackingSummary {
  const { dateKey, dailyLog, meals, settings } = params;
  const dayMeals = meals.filter((m) => m.date === dateKey);
  const mealSumKcal = dayMeals.reduce((s, m) => s + (m.totalCalories || 0), 0);
  const mealSumPro = dayMeals.reduce((s, m) => s + (m.totalProteinG || 0), 0);
  const totalCalories = Math.max(0, Math.round(dailyLog?.calories || mealSumKcal));
  const totalProteinG = Math.round(dailyLog?.proteinG || mealSumPro);
  const hasEvent = Boolean(dailyLog?.eventMode?.active || dailyLog?.eventMode?.outcome);
  const isSkipped = Boolean(settings?.skippedGapCheckinDates?.includes(dateKey));

  if (totalCalories <= 0 && dayMeals.length === 0) {
    return {
      date: dateKey,
      status: 'not_tracked',
      confidenceWeight: 0,
      label: isSkipped ? 'Skipped (not tracked)' : 'Not tracked',
      totalCalories: 0,
      totalProteinG: 0,
      mealCount: 0,
      hasEvent,
    };
  }

  const hasEstimateMeal = dayMeals.some(
    (m) =>
      m.isEstimate ||
      m.sourceKind === 'event_quick' ||
      m.sourceKind === 'one_question' ||
      m.sourceKind === 'recall' ||
      m.confidence === 'Low'
  );

  // Explicit saved status takes precedence if backed by food logs
  if (dailyLog?.dayStatus === 'estimated' || (hasEvent && dailyLog?.eventMode?.outcome) || (hasEstimateMeal && dayMeals.length <= 2)) {
    return {
      date: dateKey,
      status: 'estimated',
      confidenceWeight: 0.65,
      label: hasEvent ? 'Event day (estimated)' : 'Estimated',
      totalCalories,
      totalProteinG,
      mealCount: dayMeals.length,
      hasEvent,
    };
  }

  const distinctSlots = new Set(dayMeals.map((m) => m.mealType || 'lunch')).size;
  if (dailyLog?.dayStatus === 'complete' || dayMeals.length >= 3 || distinctSlots >= 2 || totalCalories >= 1100) {
    if (hasEstimateMeal && distinctSlots < 2 && dayMeals.length <= 1) {
      return {
        date: dateKey,
        status: 'estimated',
        confidenceWeight: 0.65,
        label: 'Estimated',
        totalCalories,
        totalProteinG,
        mealCount: dayMeals.length,
        hasEvent,
      };
    }
    return {
      date: dateKey,
      status: 'complete',
      confidenceWeight: 1,
      label: 'Complete',
      totalCalories,
      totalProteinG,
      mealCount: dayMeals.length,
      hasEvent,
    };
  }

  return {
    date: dateKey,
    status: 'partial',
    confidenceWeight: 0.45,
    label: 'Partial',
    totalCalories,
    totalProteinG,
    mealCount: dayMeals.length,
    hasEvent,
  };
}

export interface NutritionAveragesResult {
  daysInWindow: number;
  countedDays: number;
  completeDays: number;
  estimatedDays: number;
  partialDays: number;
  notTrackedDays: number;
  avgCalories: number | null;
  avgProteinG: number | null;
  summaries: DayTrackingSummary[];
}

/**
 * Computes average intake over the last `daysBack` days (inclusive of todayKey).
 * Strictly NEVER treats 'not_tracked' days as 0 kcal.
 * Uses only 'complete' (weight 1.0) and optionally 'estimated' (weight 0.65) days.
 */
export function computeNutritionAverages(params: {
  todayKey?: string;
  daysBack: number;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  settings?: Partial<AppSettings> | null;
  includeEstimated?: boolean;
}): NutritionAveragesResult {
  const todayKey = params.todayKey ?? toLocalDateKey();
  const includeEstimated =
    params.includeEstimated ?? getRealLifeSettings(params.settings).includeEstimatedInAverages;
  const logByDate = new Map(params.dailyLogs.map((l) => [l.date, l]));

  const summaries: DayTrackingSummary[] = [];
  for (let i = params.daysBack - 1; i >= 0; i--) {
    const dt = addDays(todayKey, -i);
    summaries.push(
      classifyDayTrackingStatus({
        dateKey: dt,
        dailyLog: logByDate.get(dt) ?? null,
        meals: params.mealScans,
        settings: params.settings,
      })
    );
  }

  let completeDays = 0;
  let estimatedDays = 0;
  let partialDays = 0;
  let notTrackedDays = 0;
  let weightedKcalSum = 0;
  let weightedProSum = 0;
  let totalWeight = 0;
  let countedDays = 0;

  for (const s of summaries) {
    if (s.status === 'complete') {
      completeDays++;
      weightedKcalSum += s.totalCalories * 1;
      weightedProSum += s.totalProteinG * 1;
      totalWeight += 1;
      countedDays++;
    } else if (s.status === 'estimated') {
      estimatedDays++;
      if (includeEstimated && s.totalCalories > 0) {
        weightedKcalSum += s.totalCalories * 0.65;
        weightedProSum += s.totalProteinG * 0.65;
        totalWeight += 0.65;
        countedDays++;
      }
    } else if (s.status === 'partial') {
      partialDays++;
    } else {
      notTrackedDays++;
    }
  }

  return {
    daysInWindow: params.daysBack,
    countedDays,
    completeDays,
    estimatedDays,
    partialDays,
    notTrackedDays,
    avgCalories: totalWeight > 0 ? Math.round(weightedKcalSum / totalWeight) : null,
    avgProteinG: totalWeight > 0 ? Math.round(weightedProSum / totalWeight) : null,
    summaries,
  };
}

export interface WeeklyCalorieBudgetSummary {
  weeklyTargetKcal: number;
  dailyTargetKcal: number;
  spentKcal: number;
  remainingKcal: number;
  trackedDaysCount: number;
  untrackedDaysCount: number;
  projectedRemainingDailyAvg: number;
  hasEventThisWeek: boolean;
  progressPct: number;
  plainSummary: string;
}

export function computeWeeklyCalorieBudget(params: {
  todayKey?: string;
  dailyTargetKcal: number;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  settings?: Partial<AppSettings> | null;
}): WeeklyCalorieBudgetSummary {
  const todayKey = params.todayKey ?? toLocalDateKey();
  const dailyTargetKcal = Math.max(1200, Math.round(params.dailyTargetKcal || 2200));
  const weeklyTargetKcal = dailyTargetKcal * 7;
  const logByDate = new Map(params.dailyLogs.map((l) => [l.date, l]));

  let spentKcal = 0;
  let trackedDaysCount = 0;
  let untrackedDaysCount = 0;
  let hasEventThisWeek = false;

  for (let i = 6; i >= 0; i--) {
    const dt = addDays(todayKey, -i);
    const summary = classifyDayTrackingStatus({
      dateKey: dt,
      dailyLog: logByDate.get(dt) ?? null,
      meals: params.mealScans,
      settings: params.settings,
    });
    if (summary.hasEvent) hasEventThisWeek = true;
    if (summary.status !== 'not_tracked' && summary.totalCalories > 0) {
      spentKcal += summary.totalCalories;
      trackedDaysCount++;
    } else {
      untrackedDaysCount++;
    }
  }

  // Remaining over the 7-day rolling budget; never cuts below safe daily level
  const remainingKcal = Math.max(0, weeklyTargetKcal - spentKcal);
  const effectiveDaysLogged = Math.max(1, trackedDaysCount);
  const progressPct = Math.min(100, Math.round((spentKcal / Math.max(1, weeklyTargetKcal)) * 100));

  const plainSummary = hasEventThisWeek
    ? 'One event fits inside your 7-day average — tomorrow stays a normal day with zero payback cuts.'
    : trackedDaysCount === 0
    ? 'Start logging meals whenever you are ready — your 7-day weekly budget fills from real days.'
    : `${trackedDaysCount} tracked ${trackedDaysCount === 1 ? 'day' : 'days'} in this 7-day window (avg ${Math.round(
        spentKcal / effectiveDaysLogged
      )} kcal/day).`;

  return {
    weeklyTargetKcal,
    dailyTargetKcal,
    spentKcal,
    remainingKcal,
    trackedDaysCount,
    untrackedDaysCount,
    projectedRemainingDailyAvg: dailyTargetKcal, // Never shrinks tomorrow's budget to compensate
    hasEventThisWeek,
    progressPct,
    plainSummary,
  };
}

/**
 * Explicit No-Compensation Guarantee:
 * Next day's calorie target NEVER drops below the base daily plan after a high-calorie / event day.
 */
export function resolveNextDayTargetNoCompensation(params: {
  baseDailyTargetKcal: number;
  yesterdayLog?: DailyLog | null;
}): {
  targetKcal: number;
  compensationApplied: false;
  note: string;
} {
  const base = Math.max(1300, Math.round(params.baseDailyTargetKcal || 2200));
  const hadEventYesterday = Boolean(
    params.yesterdayLog?.eventMode?.active || params.yesterdayLog?.eventMode?.outcome
  );
  return {
    targetKcal: base,
    compensationApplied: false,
    note: hadEventYesterday
      ? 'Yesterday was an event day — today stays your normal calorie and protein plan. Never cut food to pay it back.'
      : 'Normal daily target.',
  };
}

export interface AdaptiveCalibrationResult {
  ready: boolean;
  allowed: boolean;
  reason: string;
  validCalorieDays: number;
  weightSpanDays: number;
  estimatedMaintenanceKcal: number | null;
  formulaMaintenanceKcal: number;
  suggestedTargetKcal: number | null;
  label: 'estimate, improves with data';
}

/**
 * After 3+ weeks (21+ days span with >=14 valid calorie days and >=4 weights across >=14 days),
 * estimates empirical maintenance from real calorie intake vs weight change.
 */
export function computeAdaptiveMaintenanceCalibration(params: {
  todayKey?: string;
  profile: UserProfile;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  bodyMetrics: BodyMetricEntry[];
  settings?: Partial<AppSettings> | null;
}): AdaptiveCalibrationResult {
  const todayKey = params.todayKey ?? toLocalDateKey();
  const { profile, dailyLogs, mealScans, bodyMetrics, settings } = params;
  const formula = calculateMifflinStJeor({
    sex: profile.sex,
    weightKg: profile.weightKg || 74,
    heightCm: profile.heightCm || 178,
    age: profile.age || 22,
    activityLevel: profile.activityLevel || 'moderate',
    goalMode: 'maintain',
  });
  const formulaMaintenanceKcal = formula.tdee;

  if (!isAdultFoodCalorieToolAllowed(profile)) {
    return {
      ready: false,
      allowed: false,
      reason: 'Adaptive calorie calibration stays off while under 18, still growing, or age is not set.',
      validCalorieDays: 0,
      weightSpanDays: 0,
      estimatedMaintenanceKcal: null,
      formulaMaintenanceKcal,
      suggestedTargetKcal: null,
      label: 'estimate, improves with data',
    };
  }

  const windowStart = addDays(todayKey, -27);
  const averages = computeNutritionAverages({
    todayKey,
    daysBack: 28,
    dailyLogs,
    mealScans,
    settings,
    includeEstimated: true,
  });

  const validCalorieDays = averages.completeDays + averages.estimatedDays;
  const weightsInWindow = bodyMetrics
    .filter((w) => w.weightKg > 20 && w.date >= windowStart && w.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const weightSpanDays =
    weightsInWindow.length >= 2
      ? Math.max(0, daysBetween(weightsInWindow[0].date, weightsInWindow[weightsInWindow.length - 1].date))
      : 0;

  if (validCalorieDays < 14 || weightsInWindow.length < 4 || weightSpanDays < 18 || !averages.avgCalories) {
    return {
      ready: false,
      allowed: true,
      reason: `Needs 3+ weeks of real data (${validCalorieDays}/14 food days · ${weightSpanDays}/18 weight span days).`,
      validCalorieDays,
      weightSpanDays,
      estimatedMaintenanceKcal: null,
      formulaMaintenanceKcal,
      suggestedTargetKcal: null,
      label: 'estimate, improves with data',
    };
  }

  const half = Math.floor(weightsInWindow.length / 2);
  const earlySlice = weightsInWindow.slice(0, half);
  const lateSlice = weightsInWindow.slice(half);
  const earlyAvgKg = earlySlice.reduce((s, w) => s + w.weightKg, 0) / earlySlice.length;
  const lateAvgKg = lateSlice.reduce((s, w) => s + w.weightKg, 0) / lateSlice.length;
  const spanBetweenHalvesDays = Math.max(7, Math.round(weightSpanDays * 0.55));
  const dailyWeightDeltaKg = (lateAvgKg - earlyAvgKg) / spanBetweenHalvesDays;
  const impliedDailySurplusKcal = dailyWeightDeltaKg * 7700;

  const rawEstimated = Math.round(averages.avgCalories - impliedDailySurplusKcal);
  const safeFloor = profile.sex === 'female' ? 1300 : 1500;
  const clampedMaintenance = Math.max(
    Math.max(safeFloor + 200, formulaMaintenanceKcal - 650),
    Math.min(formulaMaintenanceKcal + 650, rawEstimated)
  );

  const goal = profile.dietGoal ?? 'maintain';
  const suggestedTargetKcal =
    goal === 'cut'
      ? Math.max(safeFloor, clampedMaintenance - 400)
      : goal === 'lean_gain'
      ? clampedMaintenance + 250
      : clampedMaintenance;

  return {
    ready: true,
    allowed: true,
    reason: `Estimated from ${validCalorieDays} tracked days and ${weightsInWindow.length} weigh-ins over ${weightSpanDays} days.`,
    validCalorieDays,
    weightSpanDays,
    estimatedMaintenanceKcal: clampedMaintenance,
    formulaMaintenanceKcal,
    suggestedTargetKcal,
    label: 'estimate, improves with data',
  };
}

export interface GalleryMealCluster {
  clusterId: string;
  dateKey: string;
  mealType: MealType;
  captureTimeLabel: string;
  firstTimestamp: number;
  files: File[];
}

export function inferMealSlotFromTimestamp(ts: number): MealType {
  const d = new Date(ts);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins < 11 * 60 + 30) return 'breakfast';
  if (mins < 16 * 60 + 30) return 'lunch';
  if (mins < 21 * 60 + 30) return 'dinner';
  return 'snack';
}

export function groupGalleryFilesByMealTime(
  files: File[],
  todayKey: string = toLocalDateKey()
): GalleryMealCluster[] {
  if (!files || files.length === 0) return [];
  const minAllowedDate = addDays(todayKey, -7);

  const sorted = [...files].sort((a, b) => (a.lastModified || Date.now()) - (b.lastModified || Date.now()));
  const clusters: GalleryMealCluster[] = [];

  for (const file of sorted) {
    const ts = file.lastModified && file.lastModified > 0 ? file.lastModified : Date.now();
    const rawDateKey = toLocalDateKey(new Date(ts));
    const dateKey =
      rawDateKey > todayKey ? todayKey : rawDateKey < minAllowedDate ? todayKey : rawDateKey;
    const mealType = inferMealSlotFromTimestamp(ts);

    const last = clusters[clusters.length - 1];
    const withinWindow =
      last &&
      last.dateKey === dateKey &&
      Math.abs(ts - last.firstTimestamp) <= 90 * 60 * 1000;

    if (withinWindow) {
      last.files.push(file);
    } else {
      const timeLabel = new Date(ts).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      clusters.push({
        clusterId: `cluster-${clusters.length + 1}-${ts}`,
        dateKey,
        mealType,
        captureTimeLabel: timeLabel,
        firstTimestamp: ts,
        files: [file],
      });
    }
  }

  return clusters;
}

export interface MealMemorySuggestion {
  id: string;
  slot: MealType;
  label: string;
  reason: string;
  sourceMeal: MealScanEntry;
}

export function buildMealMemorySuggestions(params: {
  todayKey?: string;
  mealScans: MealScanEntry[];
  workouts: WorkoutSession[];
  slot?: MealType;
}): MealMemorySuggestion[] {
  const todayKey = params.todayKey ?? toLocalDateKey();
  const { mealScans, workouts } = params;
  if (mealScans.length === 0) return [];

  const targetDate = new Date(`${todayKey}T12:00:00`);
  const isFriday = targetDate.getDay() === 5;
  const hadWorkoutToday = workouts.some((w) => w.date === todayKey);

  const suggestions: MealMemorySuggestion[] = [];
  const slotsToCheck: MealType[] = params.slot
    ? [params.slot]
    : ['breakfast', 'lunch', 'dinner'];

  for (const s of slotsToCheck) {
    let pool = mealScans.filter((m) => (m.mealType || 'lunch') === s && m.date !== todayKey);
    if (isFriday && s === 'lunch') {
      const fridayPool = pool.filter((m) => new Date(`${m.date}T12:00:00`).getDay() === 5);
      if (fridayPool.length > 0) pool = fridayPool;
    }
    if (hadWorkoutToday && (s === 'dinner' || s === 'lunch')) {
      const workoutDates = new Set(workouts.map((w) => w.date));
      const postWorkoutPool = pool.filter((m) => workoutDates.has(m.date));
      if (postWorkoutPool.length > 0) pool = postWorkoutPool;
    }
    if (pool.length === 0) continue;

    const counts = new Map<string, { count: number; latest: MealScanEntry }>();
    for (const m of pool) {
      const key = m.mealTitle.trim().toLowerCase();
      const prev = counts.get(key);
      if (!prev) {
        counts.set(key, { count: 1, latest: m });
      } else {
        counts.set(key, {
          count: prev.count + 1,
          latest: m.timestamp > prev.latest.timestamp ? m : prev.latest,
        });
      }
    }

    const best = Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || b.latest.timestamp - a.latest.timestamp
    )[0];

    if (best) {
      const reason =
        isFriday && s === 'lunch'
          ? 'Your usual Friday lunch'
          : hadWorkoutToday && s === 'dinner'
          ? 'Your usual training-day meal'
          : best.count >= 2
          ? `Logged ${best.count} times for ${s}`
          : `Recent ${s} favorite`;

      suggestions.push({
        id: `mem-${s}-${best.latest.id ?? best.latest.timestamp}`,
        slot: s,
        label: best.latest.mealTitle,
        reason,
        sourceMeal: best.latest,
      });
    }
  }

  return suggestions;
}

export interface ContextFoodPrompt {
  id: string;
  slot: MealType;
  headline: string;
  subline: string;
  suggestedMeal: MealScanEntry | null;
}

export function detectContextFoodPrompt(params: {
  todayKey?: string;
  now?: Date;
  workouts: WorkoutSession[];
  mealScans: MealScanEntry[];
  dailyLog?: DailyLog | null;
  skippedDates?: string[];
}): ContextFoodPrompt | null {
  const todayKey = params.todayKey ?? toLocalDateKey();
  const now = params.now ?? new Date();
  if (params.skippedDates?.includes(todayKey)) return null;
  if (params.dailyLog?.eventMode?.active) return null;

  const todayMeals = params.mealScans.filter((m) => m.date === todayKey);
  const hasTodayWorkout = params.workouts.some((w) => w.date === todayKey);

  // Case 1: Gym / MMA session logged today with 0 meals logged
  if (hasTodayWorkout && todayMeals.length === 0) {
    const workoutSuggestion = buildMealMemorySuggestions({
      todayKey,
      mealScans: params.mealScans,
      workouts: params.workouts,
      slot: 'dinner',
    })[0];
    return {
      id: `ctx-post-workout-${todayKey}`,
      slot: 'dinner',
      headline: 'Training logged — what did you eat after?',
      subline: workoutSuggestion
        ? `Tap once to draft "${workoutSuggestion.label}" or tell ASCEND.`
        : 'Log your post-training meal quickly when ready.',
      suggestedMeal: workoutSuggestion?.sourceMeal ?? null,
    };
  }

  // Case 2: Friday >= 18:00 with no lunch logged
  const isFriday = now.getDay() === 5;
  const hasLunch = todayMeals.some((m) => m.mealType === 'lunch');
  if (isFriday && now.getHours() >= 18 && !hasLunch) {
    const fridaySuggestion = buildMealMemorySuggestions({
      todayKey,
      mealScans: params.mealScans,
      workouts: params.workouts,
      slot: 'lunch',
    })[0];
    return {
      id: `ctx-friday-lunch-${todayKey}`,
      slot: 'lunch',
      headline: 'Friday family lunch?',
      subline: fridaySuggestion
        ? `No lunch logged yet — use "${fridaySuggestion.label}", mark Event, or skip.`
        : 'No lunch logged yet. Quick estimate, Event, or skip anytime.',
      suggestedMeal: fridaySuggestion?.sourceMeal ?? null,
    };
  }

  return null;
}

export function parseDeliveryOrSharedText(rawText: string): {
  cleanedText: string;
  detectedSource: 'talabat' | 'elmenus' | 'whatsapp' | 'generic';
} {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const detectedSource: 'talabat' | 'elmenus' | 'whatsapp' | 'generic' = lower.includes('talabat')
    ? 'talabat'
    : lower.includes('elmenus')
    ? 'elmenus'
    : lower.includes('lunch:') || lower.includes('dinner:') || lower.includes('breakfast:')
    ? 'whatsapp'
    : 'generic';

  // Strip noise words like order #, EGP prices, delivery fee lines
  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/order\s*#?\s*\d+/gi, '')
        .replace(/\b\d+(?:\.\d+)?\s*(?:egp|le|usd|\$|sar)\b/gi, '')
        .replace(/delivery\s*fee.*$/gi, '')
        .replace(/service\s*fee.*$/gi, '')
        .replace(/subtotal.*$/gi, '')
        .replace(/total.*$/gi, '')
        .trim()
    )
    .filter((line) => line.length >= 2);

  return {
    cleanedText: cleanedLines.join(', ') || text,
    detectedSource,
  };
}

export function buildEventOutcomeDraftMeal(params: {
  dateKey: string;
  eventTypeLabel: string;
  outcome: EventOutcomeLevel;
  platesCount?: number;
  hadDessert?: boolean;
  mealType?: MealType;
}): Omit<MealScanEntry, 'id'> {
  const opt = getEventOutcomeOption(params.outcome);
  const platesMult =
    params.platesCount && params.platesCount > 1
      ? Math.min(1.6, 1 + (params.platesCount - 1) * 0.25)
      : 1;
  const dessertExtraKcal = params.hadDessert ? 320 : 0;
  const dessertExtraPro = params.hadDessert ? 3 : 0;
  const dessertExtraSugar = params.hadDessert ? 24 : 0;

  const totalCalories = Math.round(opt.estimatedKcal * platesMult + dessertExtraKcal);
  const totalProteinG = Math.round(opt.estimatedProteinG * platesMult + dessertExtraPro);
  const totalSodiumMg = Math.round(opt.estimatedSodiumMg * platesMult + (params.hadDessert ? 90 : 0));
  const minRange = Math.round(opt.kcalMin * platesMult + dessertExtraKcal);
  const maxRange = Math.round(opt.kcalMax * platesMult + dessertExtraKcal);
  const rangeLabel = `about ${minRange}–${maxRange} kcal`;

  const titleParts = [`${params.eventTypeLabel} (${opt.label.toLowerCase()})`];
  if (params.platesCount) titleParts.push(`${params.platesCount} ${params.platesCount === 1 ? 'plate' : 'plates'}`);
  if (params.hadDessert) titleParts.push('+ dessert');

  return {
    date: params.dateKey,
    timestamp: Date.now(),
    mealType: params.mealType ?? 'dinner',
    mealTitle: titleParts.join(' · '),
    confidence: 'Low',
    items: [
      {
        id: `event-${Date.now()}`,
        name: titleParts.join(' · '),
        icon: '🎉',
        portionLabel: opt.description,
        kcalRange: rangeLabel,
        confidence: 'Low',
        portionGrams: 420,
        baseGrams: 420,
        calories: totalCalories,
        proteinG: totalProteinG,
        carbsG: Math.round((totalCalories * 0.45) / 4),
        fatsG: Math.round((totalCalories * 0.35) / 9),
        sodiumMg: totalSodiumMg,
        addedSugarG: dessertExtraSugar + 6,
        notes: 'Estimate — edit anytime or add voice/photos later.',
      },
    ],
    totalCalories,
    totalProteinG,
    totalCarbsG: Math.round((totalCalories * 0.45) / 4),
    totalFatsG: Math.round((totalCalories * 0.35) / 9),
    totalSodiumMg,
    totalAddedSugarG: dessertExtraSugar + 6,
    debloatStatus: totalSodiumMg > 950 ? 'high_retention' : 'moderate',
    debloatHeadline: 'Event day logged as estimate',
    summaryNote: `${rangeLabel}. Estimate only — tomorrow stays a normal day.`,
    isManual: true,
    isEstimate: true,
    estimateRangeLabel: rangeLabel,
    sourceKind: 'event_quick',
  };
}

export function buildOneQuestionDayEstimate(params: {
  dateKey: string;
  level: EventOutcomeLevel;
}): Omit<MealScanEntry, 'id'> {
  // For a whole-day quick estimate when user picks Light / Normal / Heavy / Big event at 9pm
  const map: Record<EventOutcomeLevel, { kcal: number; min: number; max: number; pro: number; label: string }> = {
    light: { kcal: 1450, min: 1200, max: 1700, pro: 65, label: 'Light eating day' },
    normal: { kcal: 2050, min: 1800, max: 2300, pro: 95, label: 'Normal eating day' },
    heavy: { kcal: 2650, min: 2350, max: 2950, pro: 105, label: 'Heavy eating day' },
    very_heavy: { kcal: 3150, min: 2800, max: 3600, pro: 110, label: 'Big event day' },
  };
  const chosen = map[params.level] ?? map.normal;
  const rangeLabel = `about ${chosen.min}–${chosen.max} kcal`;

  return {
    date: params.dateKey,
    timestamp: Date.now(),
    mealType: 'dinner',
    mealTitle: `${chosen.label} (quick check-in)`,
    confidence: 'Low',
    items: [
      {
        id: `oneq-${Date.now()}`,
        name: chosen.label,
        icon: params.level === 'very_heavy' ? '🎉' : '🍽️',
        portionLabel: 'Estimated full-day total',
        kcalRange: rangeLabel,
        confidence: 'Low',
        portionGrams: 800,
        baseGrams: 800,
        calories: chosen.kcal,
        proteinG: chosen.pro,
        carbsG: Math.round((chosen.kcal * 0.45) / 4),
        fatsG: Math.round((chosen.kcal * 0.32) / 9),
        sodiumMg: 1200,
        addedSugarG: 18,
      },
    ],
    totalCalories: chosen.kcal,
    totalProteinG: chosen.pro,
    totalCarbsG: Math.round((chosen.kcal * 0.45) / 4),
    totalFatsG: Math.round((chosen.kcal * 0.32) / 9),
    totalSodiumMg: 1200,
    totalAddedSugarG: 18,
    debloatStatus: 'moderate',
    debloatHeadline: 'Quick daily estimate saved',
    summaryNote: `${rangeLabel}. One tap fixes or replaces this anytime.`,
    isManual: true,
    isEstimate: true,
    estimateRangeLabel: rangeLabel,
    sourceKind: 'one_question',
  };
}

export function getCustomFoodMatchScoreHint(
  _customFoods?: CustomFoodEntry[]
): number {
  return EVENT_OUTCOME_OPTIONS.length;
}
