import type { UserProfile } from '../types';

export interface CalorieProteinResult {
  bmr: number;
  tdee: number;
  recommendedCalories: number;
  proteinGrams: number;
  waterMl: number;
  safeFloor: number;
  formulaLabel: string;
}

const ACTIVITY_MULTIPLIER: Record<UserProfile['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function calculateMifflinStJeor(params: {
  sex: UserProfile['sex'];
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: UserProfile['activityLevel'];
  goalMode: 'cut' | 'maintain' | 'lean_gain';
}): CalorieProteinResult {
  const { sex, weightKg, heightCm, age, activityLevel, goalMode } = params;
  const sexOffset = sex === 'female' ? -161 : 5;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
  const safeFloor = sex === 'female' ? 1300 : 1500;

  let target = tdee;
  if (goalMode === 'cut') {
    target = Math.max(safeFloor, tdee - 350);
  } else if (goalMode === 'lean_gain') {
    target = tdee + 220;
  }

  const proteinGrams = Math.round(Math.max(weightKg * 1.6, Math.min(weightKg * 2.1, weightKg * 1.8)));
  const waterMl = Math.round(Math.max(2000, Math.min(4000, weightKg * 35)));

  return {
    bmr,
    tdee,
    recommendedCalories: target,
    proteinGrams,
    waterMl,
    safeFloor,
    formulaLabel: `Mifflin-St Jeor: (10 × ${weightKg}kg) + (6.25 × ${heightCm}cm) − (5 × ${age}y) ${sexOffset >= 0 ? '+ 5' : '− 161'}`,
  };
}

export function calculateUSNavyBodyFat(params: {
  sex: UserProfile['sex'];
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number;
}): { bodyFatPct: number; formulaText: string } | null {
  const { sex, heightCm, waistCm, neckCm, hipCm } = params;
  if (heightCm <= 0 || neckCm <= 0 || waistCm <= neckCm) return null;

  if (sex === 'female') {
    const hip = hipCm && hipCm > 0 ? hipCm : waistCm * 1.18;
    const sum = waistCm + hip - neckCm;
    if (sum <= 0) return null;
    const pct = 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
    return {
      bodyFatPct: Math.max(8, Math.min(55, Number(pct.toFixed(1)))),
      formulaText: 'US Navy Female: 495 / (1.29579 − 0.35004·log10(waist+hip−neck) + 0.221·log10(height)) − 450',
    };
  }

  const diff = waistCm - neckCm;
  if (diff <= 0) return null;
  const pct = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
  return {
    bodyFatPct: Math.max(4, Math.min(50, Number(pct.toFixed(1)))),
    formulaText: 'US Navy Male: 495 / (1.0324 − 0.19077·log10(waist−neck) + 0.15456·log10(height)) − 450',
  };
}

export function calculateNavyBodyFat(
  sex: UserProfile['sex'],
  heightCm: number,
  waistCm: number,
  neckCm: number,
  hipCm?: number
): number | null {
  const res = calculateUSNavyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm });
  return res ? res.bodyFatPct : null;
}

export function kgToLbs(kg: number): number {
  return Number((kg * 2.20462).toFixed(1));
}

export function lbsToKg(lbs: number): number {
  return Number((lbs / 2.20462).toFixed(1));
}

export function cmToInches(cm: number): number {
  return Number((cm / 2.54).toFixed(1));
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function ftInToCm(feet: number, inches: number): number {
  return Number((((feet * 12) + inches) * 2.54).toFixed(1));
}

export function calculateEstimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function computeBmi(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) return 0;
  const m = heightCm / 100;
  return Number((weightKg / (m * m)).toFixed(1));
}

export interface SleepStageBreakdown {
  totalLabel: string;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  deepPct: number;
  remPct: number;
  lightPct: number;
  awakePct: number;
}

export function computeSleepStages(sleepHours: number, sleepQuality = 3): SleepStageBreakdown {
  const totalMin = Math.max(0, Math.round(sleepHours * 60));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const totalLabel = totalMin > 0 ? `${hrs}h ${String(mins).padStart(2, '0')}m` : '0h 00m';
  if (totalMin === 0) {
    return {
      totalLabel,
      deepMin: 0,
      remMin: 0,
      lightMin: 0,
      awakeMin: 0,
      deepPct: 0,
      remPct: 0,
      lightPct: 0,
      awakePct: 0,
    };
  }
  const q = Math.max(1, Math.min(5, sleepQuality || 3));
  const deepRatio = 0.14 + (q - 1) * 0.025; // 14%..24%
  const remRatio = 0.18 + (q - 1) * 0.015; // 18%..24%
  const awakeRatio = 0.09 - (q - 1) * 0.015; // 9%..3%
  const lightRatio = Math.max(0.4, 1 - deepRatio - remRatio - awakeRatio);

  const deepMin = Math.round(totalMin * deepRatio);
  const remMin = Math.round(totalMin * remRatio);
  const awakeMin = Math.round(totalMin * awakeRatio);
  const lightMin = Math.max(0, totalMin - deepMin - remMin - awakeMin);

  return {
    totalLabel,
    deepMin,
    remMin,
    lightMin,
    awakeMin,
    deepPct: Math.round((deepMin / totalMin) * 100),
    remPct: Math.round((remMin / totalMin) * 100),
    lightPct: Math.round((lightMin / totalMin) * 100),
    awakePct: Math.max(1, Math.round((awakeMin / totalMin) * 100)),
  };
}

export function estimateHealthAndMetabolicAge(params: {
  age: number;
  weightKg: number;
  heightCm: number;
  sleepHours: number;
  weeklyWorkouts: number;
  routineScorePct: number;
  hydrationPct: number;
  restingHr: number | null;
}): { dailyHealthScore: number; metabolicAge: number; deltaYears: number } {
  const { age, weightKg, heightCm, sleepHours, weeklyWorkouts, routineScorePct, hydrationPct, restingHr } = params;
  const bmi = computeBmi(weightKg, heightCm);

  // Transparent weighted readiness / daily health score (0..100)
  const sleepComponent = sleepHours > 0 ? Math.min(100, Math.round((sleepHours / 8) * 100)) : 55;
  const movementComponent = Math.min(100, Math.round(weeklyWorkouts * 20 + routineScorePct * 0.4));
  const hydrationComponent = Math.min(100, Math.max(30, hydrationPct));
  const dailyHealthScore = Math.max(
    25,
    Math.min(
      98,
      Math.round(
        routineScorePct * 0.35 +
          sleepComponent * 0.25 +
          movementComponent * 0.2 +
          hydrationComponent * 0.2
      )
    )
  );

  // Estimate metabolic/fitness age delta conservatively around chronological age
  let delta = 0;
  if (bmi > 0) {
    if (bmi >= 19 && bmi <= 24.9) delta -= 1.5;
    else if (bmi >= 28) delta += 2.0;
  }
  if (weeklyWorkouts >= 3) delta -= 1.5;
  else if (weeklyWorkouts === 0) delta += 1.0;
  if (sleepHours >= 7.2) delta -= 1.0;
  else if (sleepHours > 0 && sleepHours < 6) delta += 1.5;
  if (restingHr && restingHr <= 60) delta -= 1.0;
  else if (restingHr && restingHr >= 80) delta += 1.5;

  const metabolicAge = Math.max(18, Math.round(age + delta));
  return {
    dailyHealthScore,
    metabolicAge,
    deltaYears: metabolicAge - age,
  };
}

