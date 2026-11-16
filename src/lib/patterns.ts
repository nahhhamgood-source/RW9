import { addDays } from './date';
import type {
  ActiveProtocolTask,
  BodyMetricEntry,
  DailyLog,
  EvidenceTag,
  MealScanEntry,
  TaskCompletion,
  TimeBlock,
  UserProfile,
  WorkoutSession,
} from '../types';

export interface DetectedPatternCard {
  id:
    | 'breakfast-gap'
    | 'big-lunch'
    | 'load-vs-sleep'
    | 'weight-trend-honesty'
    | 'time-of-day-consistency';
  title: string;
  headline: string;
  suggestion: string;
  why: string;
  evidence: EvidenceTag;
  action?:
    | {
        kind: 'move_block';
        label: string;
        fromBlock: TimeBlock;
        toBlock: TimeBlock;
      }
    | {
        kind: 'open_food_breakfast';
        label: string;
      }
    | {
        kind: 'set_rest_day';
        label: string;
      };
}

export interface PatternDetectionInput {
  todayKey: string;
  profile: UserProfile;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  workouts: WorkoutSession[];
  bodyMetrics: BodyMetricEntry[];
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dismissedIds?: string[];
  maxCards?: number;
}

export interface PatternDetectionResult {
  cards: DetectedPatternCard[];
  totalDetectedBeforeCap: number;
  insufficientSummary: string | null;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function detectUserPatterns(input: PatternDetectionInput): PatternDetectionResult {
  const {
    todayKey,
    profile,
    dailyLogs,
    mealScans,
    workouts,
    bodyMetrics,
    tasks,
    completions,
    dismissedIds = [],
    maxCards = 2,
  } = input;

  const dismissed = new Set(dismissedIds);
  const candidates: DetectedPatternCard[] = [];

  const last7Keys = Array.from({ length: 7 }, (_, i) => addDays(todayKey, -i));
  const last7Set = new Set(last7Keys);
  const prev7Start = addDays(todayKey, -13);
  const prev7End = addDays(todayKey, -7);

  // Group mealScans over last 7 days by date
  const mealsByDate = new Map<string, MealScanEntry[]>();
  for (const m of mealScans) {
    if (!last7Set.has(m.date)) continue;
    const arr = mealsByDate.get(m.date) ?? [];
    arr.push(m);
    mealsByDate.set(m.date, arr);
  }

  // 1. Breakfast gap: skipped breakfast 4+ of last 7 logged days & lunch above usual
  if (!dismissed.has('breakfast-gap') && mealsByDate.size >= 4) {
    let skippedBreakfastDays = 0;
    const lunchOnSkipped: number[] = [];
    const lunchOnFed: number[] = [];

    mealsByDate.forEach((dayMeals) => {
      const breakfastKcal = dayMeals
        .filter((m) => {
          if (m.mealType === 'breakfast') return true;
          if (!m.mealType) {
            const hr = new Date(m.timestamp).getHours();
            return hr < 11;
          }
          return false;
        })
        .reduce((s, m) => s + m.totalCalories, 0);

      const lunchKcal = dayMeals
        .filter((m) => m.mealType === 'lunch')
        .reduce((s, m) => s + m.totalCalories, 0);

      if (breakfastKcal < 150) {
        skippedBreakfastDays++;
        if (lunchKcal > 0) lunchOnSkipped.push(lunchKcal);
      } else if (lunchKcal > 0) {
        lunchOnFed.push(lunchKcal);
      }
    });

    const avgLunchSkipped = lunchOnSkipped.length
      ? Math.round(lunchOnSkipped.reduce((a, b) => a + b, 0) / lunchOnSkipped.length)
      : 0;
    const usualLunchBaseline = lunchOnFed.length
      ? Math.round(lunchOnFed.reduce((a, b) => a + b, 0) / lunchOnFed.length)
      : Math.round((profile.calorieGoal || 2200) * 0.35);

    if (skippedBreakfastDays >= 4 && avgLunchSkipped > usualLunchBaseline) {
      candidates.push({
        id: 'breakfast-gap',
        title: 'Breakfast gap & big lunch',
        headline: `You skipped breakfast on ${skippedBreakfastDays} of ${mealsByDate.size} logged days, and lunch averaged ${avgLunchSkipped} kcal.`,
        suggestion:
          'Add 25–30g protein in the morning (eggs, ful + 2 eggs, zabady yogurt, or milk). It usually makes lunch easier to control — individual results vary.',
        why: `Detected from your real meal logs over the last 7 days: ${skippedBreakfastDays} days had <150 kcal before noon, with lunch running above your ~${usualLunchBaseline} kcal baseline.`,
        evidence: 'Likely works',
        action: {
          kind: 'open_food_breakfast',
          label: 'Log quick protein breakfast',
        },
      });
    }
  }

  // 2. Big-lunch plate tip: lunch > 40% of daily kcal on 2+ recent days with 2+ meals logged
  if (!dismissed.has('big-lunch') && mealsByDate.size >= 2) {
    let bigLunchDays = 0;
    let avgShare = 0;

    mealsByDate.forEach((dayMeals) => {
      if (dayMeals.length < 2) return;
      const totalDay = dayMeals.reduce((s, m) => s + m.totalCalories, 0);
      if (totalDay < 600) return;
      const lunchCal = dayMeals
        .filter((m) => m.mealType === 'lunch')
        .reduce((s, m) => s + m.totalCalories, 0);
      const share = lunchCal / totalDay;
      if (share > 0.4) {
        bigLunchDays++;
        avgShare += share;
      }
    });

    if (bigLunchDays >= 2) {
      const pct = Math.round((avgShare / bigLunchDays) * 100);
      candidates.push({
        id: 'big-lunch',
        title: 'Big lunch share',
        headline: `Lunch made up ~${pct}% of your daily calories on ${bigLunchDays} recent days.`,
        suggestion:
          'Try the plate method: protein first, half plate salad/veg, then rice, pasta, or baladi bread — same lunch, smaller carb scoop.',
        why: `Calculated from ${bigLunchDays} multi-meal days in your Food log where lunch exceeded 40% of daily energy intake.`,
        evidence: 'Likely works',
      });
    }
  }

  // 3. Training load vs sleep: >= 3 workouts in 7 days AND 3+ short sleep nights (< targetSleepHours)
  if (!dismissed.has('load-vs-sleep')) {
    const recentWorkouts = workouts.filter((w) => last7Set.has(w.date));
    const targetSleep = profile.targetSleepHours || 7.5;
    const sleepLogs7 = dailyLogs.filter((l) => last7Set.has(l.date) && l.sleepHours > 0);
    const shortNights = sleepLogs7.filter((l) => l.sleepHours < targetSleep);

    if (recentWorkouts.length >= 3 && shortNights.length >= 3) {
      const avgSleep = round1(
        sleepLogs7.reduce((s, l) => s + l.sleepHours, 0) / Math.max(1, sleepLogs7.length)
      );
      candidates.push({
        id: 'load-vs-sleep',
        title: 'Training load vs sleep',
        headline: `${recentWorkouts.length} sessions logged this week with ${shortNights.length} nights under your ${targetSleep}h sleep target (avg ${avgSleep}h).`,
        suggestion:
          'Take an easier recovery day today — light walk, stretching, and earlier sleep. Performance first.',
        why: `Based on ${recentWorkouts.length} workouts and ${shortNights.length} short sleep entries logged in the past 7 days.`,
        evidence: 'Proven',
        action: {
          kind: 'set_rest_day',
          label: 'Switch today to Rest mode',
        },
      });
    }
  }

  // 4. Weight trend honesty: compare 7-day rolling averages vs prior 7-day rolling average
  if (!dismissed.has('weight-trend-honesty')) {
    const cur7Weights = bodyMetrics.filter((m) => last7Set.has(m.date));
    const prev7Weights = bodyMetrics.filter((m) => m.date >= prev7Start && m.date <= prev7End);

    if (cur7Weights.length >= 2 && prev7Weights.length >= 2) {
      const curAvg = round1(cur7Weights.reduce((s, w) => s + w.weightKg, 0) / cur7Weights.length);
      const prevAvg = round1(prev7Weights.reduce((s, w) => s + w.weightKg, 0) / prev7Weights.length);
      const delta = round1(curAvg - prevAvg);
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      candidates.push({
        id: 'weight-trend-honesty',
        title: '7-day weight trend (noise filtered)',
        headline: `7-day average: ${curAvg} kg (${sign} kg vs prior 7 days: ${prevAvg} kg).`,
        suggestion:
          'Judge progress by 7-day averages, not one scale reading. Normal day-to-day change is about 0.5–1.5 kg from water and food.',
        why: `Averaged ${cur7Weights.length} weigh-ins from the last 7 days against ${prev7Weights.length} weigh-ins from the week before.`,
        evidence: 'Proven',
      });
    }
  }

  // 5. Consistency by time of day (morning / afternoon / evening)
  if (!dismissed.has('time-of-day-consistency')) {
    const cutoff14 = addDays(todayKey, -13);
    const activeTasks = tasks.filter((t) => t.enabled && !t.scheduledDate);
    const taskBlockById = new Map<string, TimeBlock>();
    const tasksPerBlock: Record<TimeBlock, number> = { morning: 0, afternoon: 0, evening: 0 };
    for (const t of activeTasks) {
      taskBlockById.set(t.id, t.block);
      tasksPerBlock[t.block]++;
    }

    const recentComps = completions.filter((c) => c.date >= cutoff14);
    const activeDaysCount = new Set(recentComps.map((c) => c.date)).size;

    if (activeDaysCount >= 3) {
      const doneByBlock: Record<TimeBlock, number> = { morning: 0, afternoon: 0, evening: 0 };
      for (const c of recentComps) {
        const blk = taskBlockById.get(c.taskId);
        if (blk) doneByBlock[blk]++;
      }

      const blocksWithTasks = (['morning', 'afternoon', 'evening'] as TimeBlock[]).filter(
        (b) => tasksPerBlock[b] > 0
      );

      if (blocksWithTasks.length >= 2) {
        const rates = blocksWithTasks.map((b) => ({
          block: b,
          pct: Math.min(
            100,
            Math.round((doneByBlock[b] / (tasksPerBlock[b] * activeDaysCount)) * 100)
          ),
        }));
        rates.sort((a, b) => b.pct - a.pct);
        const best = rates[0];
        const weakest = rates[rates.length - 1];

        if (best.pct - weakest.pct >= 25 && weakest.pct < 55) {
          candidates.push({
            id: 'time-of-day-consistency',
            title: 'Your strongest time of day',
            headline: `You finish ~${best.pct}% of ${best.block} habits vs ~${weakest.pct}% in the ${weakest.block}.`,
            suggestion: `Want to move skipped ${weakest.block} habits to ${best.block}? Matching habits to your reliable window works better than forcing willpower.`,
            why: `Computed across ${activeDaysCount} active days in your task check-offs over the last 14 days.`,
            evidence: 'Likely works',
            action: {
              kind: 'move_block',
              label: `Move ${weakest.block} habits to ${best.block}`,
              fromBlock: weakest.block,
              toBlock: best.block,
            },
          });
        }
      }
    }
  }

  const visible = candidates.slice(0, Math.max(1, maxCards));
  let insufficientSummary: string | null = null;
  if (candidates.length === 0) {
    const loggedMealsDays = mealsByDate.size;
    const loggedSleepDays = dailyLogs.filter((l) => last7Set.has(l.date) && l.sleepHours > 0).length;
    const moreDays = Math.max(1, 4 - Math.max(loggedMealsDays, loggedSleepDays));
    insufficientSummary = `Not enough data yet — log meals, sleep, or check-offs for ${moreDays} more day${
      moreDays === 1 ? '' : 's'
    } to unlock real pattern cards.`;
  }

  return {
    cards: visible,
    totalDetectedBeforeCap: candidates.length,
    insufficientSummary,
  };
}

export function computeHonestDailyLine(params: {
  todayKey: string;
  workouts: WorkoutSession[];
  dailyLogs: DailyLog[];
  completions: TaskCompletion[];
  targetSleepHours: number;
  isRoughDay?: boolean;
}): string {
  if (params.isRoughDay) {
    return 'Rough day mode on — just two gentle steps today. Showing up lightly still counts.';
  }
  const cutoff7 = addDays(params.todayKey, -6);
  const recentWorkouts = params.workouts.filter((w) => w.date >= cutoff7 && w.date <= params.todayKey);
  if (recentWorkouts.length >= 2) {
    return `${recentWorkouts.length} training sessions logged this week. That's real.`;
  }

  const sleepHits = params.dailyLogs.filter(
    (l) =>
      l.date >= cutoff7 &&
      l.date <= params.todayKey &&
      l.sleepHours >= (params.targetSleepHours || 7.5)
  ).length;
  if (sleepHits >= 2) {
    return `${sleepHits} nights hitting your sleep target this week. Quiet win.`;
  }

  const cutoff3 = addDays(params.todayKey, -2);
  const recentTicks = params.completions.filter((c) => c.date >= cutoff3 && c.date <= params.todayKey);
  if (recentTicks.length > 0) {
    return `${recentTicks.length} habits checked off over the last 3 days — steady beats intense.`;
  }

  return 'Start with one small check-in today. Everything saves privately on your phone.';
}
