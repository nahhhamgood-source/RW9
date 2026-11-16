import { addDays, daysBetween, toLocalDateKey } from '../lib/date';
import { calculateMifflinStJeor } from '../lib/fitness';
import { isAgeUnknown, isUnder18OrGrowing } from '../db/database';
import type { BodyMetricEntry, DailyLog, TrainingDayType, UserProfile, WeighInRule } from '../types';

export const PASSIVE_CUT_SAFETY_CARD =
  'Why we don’t plan this: it hurts performance and can be dangerous. If a weight class needs it, that is a coach + doctor decision.';

export const UNDER_18_FIGHT_WEIGHT_MSG =
  'Weight for a fight is a coach + doctor call at your age. Ask your coach and a doctor.';

export const WEIGH_IN_WEEK_GUIDANCE = [
  'Eat normally around normal training portions.',
  'Protect your sleep window every night.',
  'Keep food simple and familiar — nothing new on fight week.',
  'Follow your coach cleanly on schedule and warm-ups.',
];

export type CampTrackStatus = 'on_track' | 'behind' | 'ahead' | 'insufficient_data' | 'no_target';

export interface FightCampComputation {
  allowed: boolean;
  blockedReason: string | null;
  active: boolean;
  tournamentDate: string | null;
  daysToTournament: number | null;
  currentWeightKg: number;
  avg7dWeightKg: number | null;
  prior7dAvgKg: number | null;
  targetWeightKg: number | null;
  kgLeft: number | null;
  status: CampTrackStatus;
  safeWeeklyPaceKg: number;
  earliestSafeDate: string | null;
  tournamentTooSoon: boolean;
  realityCheckLine: string;
  cutPctOfBodyWeight: number;
  overFivePercentCut: boolean;
  weighInRule: WeighInRule;
  maintenanceKcal: number;
  calorieFloor: number;
  dailyCalorieTarget: number;
  deficitApplied: number;
  proteinTargetG: number;
  trainingDayTip: string;
  performanceEaseApplied: boolean;
  performanceNote: string | null;
  sundayAutoAdjustNote: string | null;
  sundayAdjustedCalories: number | null;
}

/**
 * Pure safe-pace calculator: 0.5–0.75 kg/week (~0.5–1% BW/wk).
 */
export function computeSafeWeeklyPaceKg(currentWeightKg: number): number {
  const safeWeight = Math.max(40, currentWeightKg || 70);
  const pctBased = safeWeight * 0.008;
  return Number(Math.max(0.5, Math.min(0.75, pctBased)).toFixed(2));
}

export function computeEarliestSafeDate(params: {
  startWeightKg: number;
  targetWeightKg: number;
  fromDateKey?: string;
}): { earliestDate: string; weeksNeeded: number; safeWeeklyPaceKg: number } {
  const fromDateKey = params.fromDateKey ?? toLocalDateKey();
  const safePace = computeSafeWeeklyPaceKg(params.startWeightKg);
  const kgToLose = Math.max(0, Number((params.startWeightKg - params.targetWeightKg).toFixed(2)));
  if (kgToLose <= 0.1) {
    return { earliestDate: fromDateKey, weeksNeeded: 0, safeWeeklyPaceKg: safePace };
  }
  const weeksNeeded = Number((kgToLose / safePace).toFixed(1));
  const daysNeeded = Math.max(1, Math.ceil(weeksNeeded * 7));
  return {
    earliestDate: addDays(fromDateKey, daysNeeded),
    weeksNeeded,
    safeWeeklyPaceKg: safePace,
  };
}

export function averageWeightInWindow(
  bodyMetrics: BodyMetricEntry[],
  startKey: string,
  endKey: string
): number | null {
  const vals = bodyMetrics
    .filter((m) => m.weightKg > 20 && m.date >= startKey && m.date <= endKey)
    .map((m) => m.weightKg);
  if (vals.length === 0) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}

export function computeFightCampPlan(params: {
  profile: UserProfile;
  bodyMetrics: BodyMetricEntry[];
  todayLog?: DailyLog | null;
  todayMode?: TrainingDayType;
  todayKey?: string;
}): FightCampComputation {
  const { profile, bodyMetrics, todayLog, todayMode = 'gym', todayKey = toLocalDateKey() } = params;
  const currentWeightKg = Number((profile.weightKg || 74).toFixed(1));
  const calorieFloor = profile.sex === 'female' ? 1300 : 1500;
  const mifflin = calculateMifflinStJeor({
    sex: profile.sex,
    weightKg: currentWeightKg,
    heightCm: profile.heightCm || 178,
    age: profile.age || 20,
    activityLevel: profile.activityLevel || 'moderate',
    goalMode: 'maintain',
  });
  const maintenanceKcal = mifflin.tdee;
  const proteinTargetG = Math.round(Math.max(currentWeightKg * 1.6, Math.min(currentWeightKg * 2.2, currentWeightKg * 1.9)));

  const ageBlocked = isAgeUnknown(profile) || isUnder18OrGrowing(profile);
  const goalActive =
    profile.mainGoalMode === 'fight_camp' ||
    profile.mainGoalMode === 'both' ||
    Boolean(profile.aboutMe?.tournamentUpcoming);

  if (ageBlocked) {
    return {
      allowed: false,
      blockedReason: UNDER_18_FIGHT_WEIGHT_MSG,
      active: false,
      tournamentDate: null,
      daysToTournament: null,
      currentWeightKg,
      avg7dWeightKg: null,
      prior7dAvgKg: null,
      targetWeightKg: null,
      kgLeft: null,
      status: 'no_target',
      safeWeeklyPaceKg: 0.5,
      earliestSafeDate: null,
      tournamentTooSoon: false,
      realityCheckLine: UNDER_18_FIGHT_WEIGHT_MSG,
      cutPctOfBodyWeight: 0,
      overFivePercentCut: false,
      weighInRule: 'not_sure',
      maintenanceKcal,
      calorieFloor,
      dailyCalorieTarget: maintenanceKcal,
      deficitApplied: 0,
      proteinTargetG,
      trainingDayTip: 'Eat balanced meals around training and protect 8–10h sleep.',
      performanceEaseApplied: false,
      performanceNote: null,
      sundayAutoAdjustNote: null,
      sundayAdjustedCalories: null,
    };
  }

  const avg7dWeightKg = averageWeightInWindow(bodyMetrics, addDays(todayKey, -6), todayKey);
  const prior7dAvgKg = averageWeightInWindow(bodyMetrics, addDays(todayKey, -13), addDays(todayKey, -7));
  const referenceKg = avg7dWeightKg ?? currentWeightKg;

  const targetWeightKg =
    profile.aboutMe?.targetWeightKg ?? profile.aboutMe?.weightClassKg ?? null;
  const tournamentDate = profile.aboutMe?.tournamentDate ?? null;
  const daysToTournament =
    tournamentDate ? Math.max(0, daysBetween(todayKey, tournamentDate)) : null;

  const kgLeft =
    targetWeightKg && targetWeightKg > 0
      ? Number(Math.max(0, referenceKg - targetWeightKg).toFixed(1))
      : null;

  const safePace = computeSafeWeeklyPaceKg(referenceKg);
  let earliestSafeDate: string | null = null;
  let tournamentTooSoon = false;
  let realityCheckLine = 'Set your tournament date and target weight class to check your timeline.';

  if (targetWeightKg && targetWeightKg > 0) {
    const earliest = computeEarliestSafeDate({
      startWeightKg: referenceKg,
      targetWeightKg,
      fromDateKey: todayKey,
    });
    earliestSafeDate = earliest.earliestDate;
    if (kgLeft !== null && kgLeft <= 0.1) {
      realityCheckLine = `You are already at or below ${targetWeightKg} kg. Focus on fuel, sleep, and clean performance.`;
    } else if (tournamentDate && earliest.earliestDate > tournamentDate) {
      tournamentTooSoon = true;
      realityCheckLine = `At a safe pace you reach ${targetWeightKg} kg around ${earliest.earliestDate}. Options: a higher weight class, a later event, or ask your coach what the weigh-in rule allows.`;
    } else {
      realityCheckLine = `At a safe ${safePace} kg/week pace, you can reach ${targetWeightKg} kg around ${earliest.earliestDate}.`;
    }
  }

  const cutPctOfBodyWeight =
    targetWeightKg && targetWeightKg > 0 && referenceKg > targetWeightKg
      ? Number((((referenceKg - targetWeightKg) / referenceKg) * 100).toFixed(1))
      : 0;
  const overFivePercentCut = cutPctOfBodyWeight > 5;

  // Base moderate deficit: 300-500 kcal when weight still needs to drop
  let baseDeficit = kgLeft && kgLeft > 0.2 ? 400 : 0;
  if (todayMode === 'rest' && baseDeficit > 0) {
    baseDeficit = Math.min(500, baseDeficit + 100);
  } else if ((todayMode === 'mma' || todayMode === 'sparring') && baseDeficit > 0) {
    baseDeficit = Math.max(300, baseDeficit - 50);
  }

  // Performance check: ease deficit if sleep < 6.5h or energy <= 2/5
  let performanceEaseApplied = false;
  let performanceNote: string | null = null;
  const lowSleep = Boolean(todayLog && todayLog.sleepHours > 0 && todayLog.sleepHours < 6.5);
  const lowEnergy = Boolean(todayLog && todayLog.energy > 0 && todayLog.energy <= 2);

  if (baseDeficit > 0 && (lowSleep || lowEnergy)) {
    baseDeficit = Math.max(0, baseDeficit - 200);
    performanceEaseApplied = true;
    performanceNote =
      lowSleep && lowEnergy
        ? 'Low sleep and low energy logged — eased deficit by 200 kcal so recovery and training stay strong.'
        : lowSleep
        ? 'Short sleep logged — eased deficit by 200 kcal today to protect recovery.'
        : 'Low energy logged — eased deficit by 200 kcal so your session stays sharp.';
  }

  const dailyCalorieTarget = Math.max(calorieFloor, maintenanceKcal - baseDeficit);
  const trainingDayTip =
    todayMode === 'mma' || todayMode === 'sparring' || todayMode === 'gym'
      ? 'Hard training day: include easy-to-digest carbs 60–90 min before your session (banana, dates, toast, or rice).'
      : 'Rest day: slightly lighter carbs and steady protein + hydration for recovery.';

  let status: CampTrackStatus = 'no_target';
  if (!targetWeightKg || targetWeightKg <= 0) {
    status = 'no_target';
  } else if (kgLeft !== null && kgLeft <= 0.2) {
    status = 'ahead';
  } else if (!avg7dWeightKg) {
    status = 'insufficient_data';
  } else if (tournamentTooSoon) {
    status = 'behind';
  } else {
    status = 'on_track';
  }

  // Weekly Sunday comparison
  let sundayAutoAdjustNote: string | null = null;
  let sundayAdjustedCalories: number | null = null;
  if (prior7dAvgKg !== null && avg7dWeightKg !== null && kgLeft && kgLeft > 0.2) {
    const weeklyDelta = Number((avg7dWeightKg - prior7dAvgKg).toFixed(2));
    if (weeklyDelta > -0.15) {
      const next = Math.max(calorieFloor, dailyCalorieTarget - 100);
      if (next < dailyCalorieTarget) {
        sundayAdjustedCalories = next;
        sundayAutoAdjustNote = `7-day avg moved ${weeklyDelta >= 0 ? '+' : ''}${weeklyDelta} kg vs last week — trimmed 100 kcal.`;
      } else {
        sundayAdjustedCalories = calorieFloor;
        sundayAutoAdjustNote = `Already at your ${calorieFloor} kcal safe floor — keep daily steps steady instead of cutting food.`;
      }
    } else if (weeklyDelta < -0.85) {
      const next = Math.min(maintenanceKcal, dailyCalorieTarget + 150);
      sundayAdjustedCalories = next;
      sundayAutoAdjustNote = `Dropping faster than 0.85 kg/week (${weeklyDelta} kg) — added +150 kcal to protect strength.`;
    } else {
      sundayAdjustedCalories = dailyCalorieTarget;
      sundayAutoAdjustNote = `7-day avg dropped ${Math.abs(weeklyDelta)} kg — steady pace, keeping calories unchanged.`;
    }
  }

  return {
    allowed: true,
    blockedReason: null,
    active: goalActive,
    tournamentDate,
    daysToTournament,
    currentWeightKg,
    avg7dWeightKg,
    prior7dAvgKg,
    targetWeightKg,
    kgLeft,
    status,
    safeWeeklyPaceKg: safePace,
    earliestSafeDate,
    tournamentTooSoon,
    realityCheckLine,
    cutPctOfBodyWeight,
    overFivePercentCut,
    weighInRule: profile.weighInRule ?? 'not_sure',
    maintenanceKcal,
    calorieFloor,
    dailyCalorieTarget,
    deficitApplied: Math.max(0, maintenanceKcal - dailyCalorieTarget),
    proteinTargetG,
    trainingDayTip,
    performanceEaseApplied,
    performanceNote,
    sundayAutoAdjustNote,
    sundayAdjustedCalories,
  };
}
