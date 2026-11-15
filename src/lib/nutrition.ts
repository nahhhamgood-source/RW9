import { calculateMifflinStJeor, computeBmi } from './fitness';
import { addDays, toLocalDateKey } from './date';
import { isUnder18OrGrowing } from '../db/database';
import type { BodyMetricEntry, DebloatStatus, DietGoalMode, MealFoodItem, UserProfile } from '../types';

export interface DailyNutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  debloatWaterMl: number;
  sodiumLimitMg: number;
  addedSugarLimitG: number;
  formulaLabel: string;
}

export function resolveSafeDietGoal(
  profile: UserProfile,
  requestedGoal?: DietGoalMode
): {
  goal: DietGoalMode;
  cutLocked: boolean;
  lockReason: 'under18' | 'underweight' | null;
} {
  const underage = isUnder18OrGrowing(profile);
  const bmi = computeBmi(profile.weightKg, profile.heightCm);
  const underweight = bmi > 0 && bmi < 18.5;
  const candidate = requestedGoal ?? profile.dietGoal ?? 'maintain';

  if (underage) {
    return {
      goal: candidate === 'cut' ? 'maintain' : candidate,
      cutLocked: true,
      lockReason: 'under18',
    };
  }
  if (underweight) {
    return {
      goal: candidate === 'cut' ? 'maintain' : candidate,
      cutLocked: true,
      lockReason: 'underweight',
    };
  }
  return { goal: candidate, cutLocked: false, lockReason: null };
}

export interface WeeklyWeightAdjustment {
  status: 'insufficient_data' | 'on_track' | 'nudge_down' | 'nudge_up';
  headline: string;
  detail: string;
  deltaCalories: number;
  suggestedCalorieGoal: number | null;
  week1AvgKg: number | null;
  week2AvgKg: number | null;
}

/**
 * Checks the last two consecutive 7-day weight averages (Days -13..-7 vs Days -6..0)
 * against the user's current diet goal. Never projects or fabricates numbers.
 */
export function evaluateWeeklyWeightAdjustment(
  profile: UserProfile,
  bodyMetrics: BodyMetricEntry[],
  todayKey: string = toLocalDateKey()
): WeeklyWeightAdjustment {
  const { goal, cutLocked } = resolveSafeDietGoal(profile);
  const safeFloor = profile.sex === 'female' ? 1300 : 1500;
  const currentTarget = profile.calorieGoal || computeDailyNutritionTargets(profile, goal).calories;

  const w1Start = addDays(todayKey, -13);
  const w1End = addDays(todayKey, -7);
  const w2Start = addDays(todayKey, -6);

  const w1Weights = bodyMetrics
    .filter((m) => m.weightKg > 20 && m.date >= w1Start && m.date <= w1End)
    .map((m) => m.weightKg);
  const w2Weights = bodyMetrics
    .filter((m) => m.weightKg > 20 && m.date >= w2Start && m.date <= todayKey)
    .map((m) => m.weightKg);

  if (w1Weights.length < 2 || w2Weights.length < 2) {
    return {
      status: 'insufficient_data',
      headline: 'Log weight 2+ times per week for 2 weeks',
      detail: `Need at least 2 logged weights in both the prior week (${w1Weights.length}/2) and this week (${w2Weights.length}/2) before suggesting any calorie change.`,
      deltaCalories: 0,
      suggestedCalorieGoal: null,
      week1AvgKg: w1Weights.length ? Number((w1Weights.reduce((a, b) => a + b, 0) / w1Weights.length).toFixed(1)) : null,
      week2AvgKg: w2Weights.length ? Number((w2Weights.reduce((a, b) => a + b, 0) / w2Weights.length).toFixed(1)) : null,
    };
  }

  const avg1 = Number((w1Weights.reduce((a, b) => a + b, 0) / w1Weights.length).toFixed(1));
  const avg2 = Number((w2Weights.reduce((a, b) => a + b, 0) / w2Weights.length).toFixed(1));
  const diffKg = Number((avg2 - avg1).toFixed(2));

  if (goal === 'cut' && !cutLocked) {
    if (diffKg > -0.1) {
      const nextTarget = Math.max(safeFloor, currentTarget - 120);
      const delta = nextTarget - currentTarget;
      return {
        status: delta < 0 ? 'nudge_down' : 'on_track',
        headline:
          delta < 0
            ? `7-day avg stayed flat (${avg1} → ${avg2} kg): trim 120 kcal`
            : `7-day avg (${avg1} → ${avg2} kg) is at safe calorie floor`,
        detail:
          delta < 0
            ? `Gentle tweak from ${currentTarget} to ${nextTarget} kcal (or add 2,000 daily steps) without dropping below your ${safeFloor} kcal floor.`
            : `Your calorie target is already at the ${safeFloor} kcal safe floor — focus on daily steps and hydration instead of cutting food further.`,
        deltaCalories: delta,
        suggestedCalorieGoal: nextTarget,
        week1AvgKg: avg1,
        week2AvgKg: avg2,
      };
    }
    if (diffKg < -0.9) {
      const nextTarget = currentTarget + 150;
      return {
        status: 'nudge_up',
        headline: `Dropping fast (${avg1} → ${avg2} kg): add +150 kcal`,
        detail: `To protect muscle and energy, raise daily target gently from ${currentTarget} to ${nextTarget} kcal.`,
        deltaCalories: 150,
        suggestedCalorieGoal: nextTarget,
        week1AvgKg: avg1,
        week2AvgKg: avg2,
      };
    }
    return {
      status: 'on_track',
      headline: `Steady fat-loss pace (${avg1} → ${avg2} kg)`,
      detail: `Your 7-day average moved ${diffKg} kg cleanly — keep your current ${currentTarget} kcal plan.`,
      deltaCalories: 0,
      suggestedCalorieGoal: currentTarget,
      week1AvgKg: avg1,
      week2AvgKg: avg2,
    };
  }

  if (goal === 'lean_gain') {
    if (diffKg < 0.05) {
      const nextTarget = currentTarget + 130;
      return {
        status: 'nudge_up',
        headline: `7-day avg flat (${avg1} → ${avg2} kg): add +130 kcal`,
        detail: `For steady muscle gain without extra fat, raise your target from ${currentTarget} to ${nextTarget} kcal.`,
        deltaCalories: 130,
        suggestedCalorieGoal: nextTarget,
        week1AvgKg: avg1,
        week2AvgKg: avg2,
      };
    }
    if (diffKg > 0.55) {
      const nextTarget = Math.max(safeFloor, currentTarget - 110);
      return {
        status: 'nudge_down',
        headline: `Gaining quickly (${avg1} → ${avg2} kg): trim 110 kcal`,
        detail: `Adjust slightly from ${currentTarget} to ${nextTarget} kcal to keep gains lean.`,
        deltaCalories: nextTarget - currentTarget,
        suggestedCalorieGoal: nextTarget,
        week1AvgKg: avg1,
        week2AvgKg: avg2,
      };
    }
  }

  return {
    status: 'on_track',
    headline: `Weight steady (${avg1} → ${avg2} kg)`,
    detail: `Your 7-day average changed by ${diffKg >= 0 ? '+' : ''}${diffKg} kg — keep steady around ${currentTarget} kcal.`,
    deltaCalories: 0,
    suggestedCalorieGoal: currentTarget,
    week1AvgKg: avg1,
    week2AvgKg: avg2,
  };
}

export function computeDailyNutritionTargets(
  profile: UserProfile,
  goalMode: 'cut' | 'maintain' | 'lean_gain' = 'maintain'
): DailyNutritionTargets {
  const mifflin = calculateMifflinStJeor({
    sex: profile.sex,
    weightKg: profile.weightKg || 74,
    heightCm: profile.heightCm || 178,
    age: profile.age || 24,
    activityLevel: profile.activityLevel || 'moderate',
    goalMode,
  });

  const calories = mifflin.recommendedCalories;
  const proteinG = mifflin.proteinGrams;
  const fatCalories = Math.round(calories * 0.27);
  const fatsG = Math.max(40, Math.round(fatCalories / 9));
  const remainingCalories = Math.max(200, calories - proteinG * 4 - fatsG * 9);
  const carbsG = Math.round(remainingCalories / 4);

  return {
    calories,
    proteinG,
    carbsG,
    fatsG,
    debloatWaterMl: 4000,
    sodiumLimitMg: 1800,
    addedSugarLimitG: 25,
    formulaLabel: mifflin.formulaLabel,
  };
}

export interface DebloatAnalysis {
  status: DebloatStatus;
  headline: string;
  detail: string;
  score: number; // 0..100 (higher = cleaner / better for facial debloating)
}

export function computeDebloatImpact(sodiumMg: number, addedSugarG: number): DebloatAnalysis {
  const s = Math.max(0, sodiumMg);
  const g = Math.max(0, addedSugarG);

  if (s > 900 || g > 18) {
    const score = Math.max(15, Math.round(100 - Math.min(60, (s - 400) / 20) - Math.min(35, g * 1.5)));
    return {
      status: 'high_retention',
      headline: 'High Sodium Warning — May Cause Facial Water Retention',
      detail:
        s > 900
          ? `Estimated ${Math.round(s)} mg sodium triggers extracellular fluid retention. Pair with +500 ml water and potassium-rich greens.`
          : `Estimated ${g.toFixed(1)} g added sugar elevates insulin-mediated sodium retention. Counter with water & light walking.`,
      score,
    };
  }

  if (s > 550 || g > 8) {
    const score = Math.max(45, Math.round(92 - Math.max(0, (s - 350) / 22) - g * 1.3));
    return {
      status: 'moderate',
      headline: 'Moderate Debloat Load — Balance with Hydration',
      detail: `${Math.round(s)} mg sodium and ${g.toFixed(1)} g added sugar. Keep remaining meals low-sodium and push toward 4.0L water today.`,
      score,
    };
  }

  const score = Math.max(82, Math.min(99, Math.round(98 - s / 80 - g * 1.2)));
  return {
    status: 'optimal',
    headline: 'Low Sodium — Optimal for Facial Debloating',
    detail: `Clean mineral profile (${Math.round(s)} mg sodium, ${g.toFixed(1)} g added sugar) supports sharp facial definition and low water retention.`,
    score,
  };
}

export function scaleFoodItemWeight(item: MealFoodItem, nextGrams: number): MealFoodItem {
  const clamped = Math.max(5, Math.min(2500, Math.round(nextGrams)));
  const currentGrams = Math.max(1, item.portionGrams);
  const factor = clamped / currentGrams;
  return {
    ...item,
    portionGrams: clamped,
    calories: Math.max(0, Math.round(item.calories * factor)),
    proteinG: Math.max(0, Number((item.proteinG * factor).toFixed(1))),
    carbsG: Math.max(0, Number((item.carbsG * factor).toFixed(1))),
    fatsG: Math.max(0, Number((item.fatsG * factor).toFixed(1))),
    sodiumMg: Math.max(0, Math.round(item.sodiumMg * factor)),
    addedSugarG: Math.max(0, Number((item.addedSugarG * factor).toFixed(1))),
  };
}

export function sumMealItems(items: MealFoodItem[]) {
  return items.reduce(
    (acc, it) => ({
      totalCalories: acc.totalCalories + Math.round(it.calories || 0),
      totalProteinG: Number((acc.totalProteinG + (it.proteinG || 0)).toFixed(1)),
      totalCarbsG: Number((acc.totalCarbsG + (it.carbsG || 0)).toFixed(1)),
      totalFatsG: Number((acc.totalFatsG + (it.fatsG || 0)).toFixed(1)),
      totalSodiumMg: acc.totalSodiumMg + Math.round(it.sodiumMg || 0),
      totalAddedSugarG: Number((acc.totalAddedSugarG + (it.addedSugarG || 0)).toFixed(1)),
    }),
    {
      totalCalories: 0,
      totalProteinG: 0,
      totalCarbsG: 0,
      totalFatsG: 0,
      totalSodiumMg: 0,
      totalAddedSugarG: 0,
    }
  );
}

export async function prepareMealImageAssets(
  source: File | string
): Promise<{ apiBase64: string; mimeType: string; previewDataUrl: string; thumbnailDataUrl: string }> {
  const dataUrl =
    typeof source === 'string'
      ? source
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read selected image file.'));
          reader.readAsDataURL(source);
        });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image format.'));
    el.src = dataUrl;
  });

  const resize = (maxDim: number, quality: number) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  };

  let apiDataUrl = resize(768, 0.6);
  let apiBase64 = apiDataUrl.split(',')[1] || '';

  // Ensure uploaded image stays under ~300 KB
  const approxBytes = (b64: string) => Math.round((b64.length * 3) / 4);
  if (approxBytes(apiBase64) > 295 * 1024) {
    apiDataUrl = resize(768, 0.48);
    apiBase64 = apiDataUrl.split(',')[1] || '';
  }
  if (approxBytes(apiBase64) > 295 * 1024) {
    apiDataUrl = resize(640, 0.45);
    apiBase64 = apiDataUrl.split(',')[1] || '';
  }

  const previewDataUrl = apiDataUrl;
  const thumbnailDataUrl = resize(420, 0.6);

  return {
    apiBase64,
    mimeType: 'image/jpeg',
    previewDataUrl,
    thumbnailDataUrl,
  };
}
