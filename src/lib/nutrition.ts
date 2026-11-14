import { calculateMifflinStJeor } from './fitness';
import type { DebloatStatus, MealFoodItem, UserProfile } from '../types';

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
