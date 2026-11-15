import { describe, expect, it } from 'vitest';
import {
  calculateMifflinStJeor,
  calculateNavyBodyFat,
  cmToFtIn,
  cmToInches,
  ftInToCm,
  kgToLbs,
  lbsToKg,
} from '../fitness';
import {
  computeDreamHeightEstimate,
  computeGrowthCompletePct,
  computeHeightPercentile,
  computeMidParentalOutlook,
  heightAtPercentileLms,
  isProbablyFinishedGrowing,
} from '../../data/growthTables';
import { xpRequiredForLevel } from '../../data/badges';
import { getPslTierMeta } from '../faceMetricsConstants';
import { createDefaultProfile, isAgeUnknown, isUnder18OrGrowing } from '../../db/database';
import { evaluateWeeklyWeightAdjustment, resolveSafeDietGoal } from '../nutrition';
import { addDays } from '../date';

describe('Fitness & Anthropometry formulas', () => {
  it('computes Mifflin-St Jeor BMR & TDEE realistically', () => {
    const res = calculateMifflinStJeor({
      sex: 'male',
      weightKg: 75,
      heightCm: 180,
      age: 22,
      activityLevel: 'moderate',
      goalMode: 'maintain',
    });
    // 10*75 + 6.25*180 - 5*22 + 5 = 750 + 1125 - 110 + 5 = 1770
    expect(res.bmr).toBe(1770);
    expect(res.tdee).toBe(Math.round(1770 * 1.55));
    expect(res.recommendedCalories).toBe(res.tdee);

    const cut = calculateMifflinStJeor({
      sex: 'male',
      weightKg: 75,
      heightCm: 180,
      age: 22,
      activityLevel: 'moderate',
      goalMode: 'cut',
    });
    expect(cut.recommendedCalories).toBeLessThan(res.tdee);
    expect(cut.recommendedCalories).toBeGreaterThanOrEqual(1500);
  });

  it('computes US Navy body fat within plausible bounds', () => {
    const bf = calculateNavyBodyFat('male', 180, 82, 38);
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(8);
    expect(bf!).toBeLessThan(25);
    expect(calculateNavyBodyFat('male', 180, 35, 38)).toBeNull();
  });

  it('converts metric and imperial units accurately', () => {
    expect(kgToLbs(70)).toBeCloseTo(154.3, 1);
    expect(lbsToKg(154.3)).toBeCloseTo(70.0, 0);
    expect(cmToInches(177.8)).toBeCloseTo(70.0, 0);
    expect(cmToFtIn(180)).toEqual({ feet: 5, inches: 11 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.3, 0);
  });
});

describe('WHO 2007 growth reference & finished-growth logic (F1, F2)', () => {
  it('matches WHO 50th percentile medians at ages 5, 10, 15, 19 within 0.5 cm', () => {
    expect(heightAtPercentileLms(5, 'male', 0)).toBeCloseTo(110.3, 0);
    expect(heightAtPercentileLms(10, 'male', 0)).toBeCloseTo(137.8, 0);
    expect(heightAtPercentileLms(15, 'male', 0)).toBeCloseTo(170.6, 0);
    expect(heightAtPercentileLms(19, 'male', 0)).toBeCloseTo(176.5, 0);

    expect(heightAtPercentileLms(5, 'female', 0)).toBeCloseTo(109.4, 0);
    expect(heightAtPercentileLms(10, 'female', 0)).toBeCloseTo(138.6, 0);
    expect(heightAtPercentileLms(15, 'female', 0)).toBeCloseTo(162.0, 0);
    expect(heightAtPercentileLms(19, 'female', 0)).toBeCloseTo(163.2, 0);
  });

  it('computes ~50th percentile when height equals age median', () => {
    const med = heightAtPercentileLms(15, 'male', 0);
    const est = computeHeightPercentile(med, 15, 'male');
    expect(est?.pct).toBe(50);
    expect(est?.zScore).toBeCloseTo(0, 1);
  });

  it('computes mid-parental height outlook accurately', () => {
    const out = computeMidParentalOutlook('male', 180, 165);
    // (180 + 165 + 13) / 2 = 179.0
    expect(out?.midpointCm).toBe(179);
    expect(out?.minCm).toBe(170.5);
    expect(out?.maxCm).toBe(187.5);
  });

  it('returns consistent 99-100% completeness and realistic small adult odds when finished growing (F2)', () => {
    const adult = { age: 23, sex: 'male' as const, stillGrowing: 'no' as const };
    expect(isProbablyFinishedGrowing(adult)).toBe(true);
    expect(computeGrowthCompletePct(adult, 175, 182)).toBe(100);

    // At 175 cm adult, 185 cm dream height must be very low probability (1-5%), NOT high based on tall parents
    const dream = computeDreamHeightEstimate(185, 175, 182, true);
    expect(dream).not.toBeNull();
    expect(dream!.chancePct).toBeLessThanOrEqual(5);
    expect(dream!.tier).toBe('Low');

    // While still growing at 14, mid-parental outlook drives probability and completeness
    const teen = { age: 14, sex: 'male' as const, stillGrowing: 'yes' as const };
    expect(isProbablyFinishedGrowing(teen)).toBe(false);
    expect(computeGrowthCompletePct(teen, 164, 180)).toBe(91);
  });
});

describe('Tier thresholds, XP ladder, and under-18/unknown-age safety (F4)', () => {
  it('maps centered PSL tier thresholds cleanly in both slang and neutral mode', () => {
    expect(getPslTierMeta(7.6, true).id).toBe('Chad');
    expect(getPslTierMeta(7.6, false).displayLabel).toBe('Elite');

    expect(getPslTierMeta(6.8, true).id).toBe('Chadlite');
    expect(getPslTierMeta(6.0, true).id).toBe('HTN');
    expect(getPslTierMeta(4.9, true).id).toBe('True Normie');
    expect(getPslTierMeta(4.0, true).id).toBe('LTN');
    expect(getPslTierMeta(3.1, true).id).toBe('Developing');
  });

  it('treats unknown, zero, and skipped ages as under-18/protected (F4)', () => {
    expect(isAgeUnknown({ age: 0, ageExplicitlySet: false, onboardingSkipped: false })).toBe(true);
    expect(isUnder18OrGrowing({ age: 0, stillGrowing: 'no', ageExplicitlySet: true, onboardingSkipped: false })).toBe(true);
    expect(isUnder18OrGrowing({ age: 20, stillGrowing: 'no', ageExplicitlySet: false, onboardingSkipped: true })).toBe(true);
    expect(isUnder18OrGrowing({ age: 17, stillGrowing: 'no', ageExplicitlySet: true, onboardingSkipped: false })).toBe(true);
    expect(isUnder18OrGrowing({ age: 22, stillGrowing: 'yes', ageExplicitlySet: true, onboardingSkipped: false })).toBe(true);
    expect(isUnder18OrGrowing({ age: 22, stillGrowing: 'no', ageExplicitlySet: true, onboardingSkipped: false })).toBe(false);
  });

  it('computes monotonically increasing level XP requirements', () => {
    expect(xpRequiredForLevel(1)).toBeGreaterThan(0);
    expect(xpRequiredForLevel(5)).toBeGreaterThan(xpRequiredForLevel(2));
  });
});

describe('Unified diet goal locks & weekly auto-adjust (Phase C2)', () => {
  it('locks fat-loss cut for under-18/unknown age and BMI < 18.5', () => {
    const base = createDefaultProfile();
    const teen = { ...base, age: 16, ageExplicitlySet: true, stillGrowing: 'yes' as const, heightCm: 175, weightKg: 68 };
    expect(resolveSafeDietGoal(teen, 'cut')).toEqual({
      goal: 'maintain',
      cutLocked: true,
      lockReason: 'under18',
    });

    const thinAdult = { ...base, age: 24, ageExplicitlySet: true, stillGrowing: 'no' as const, heightCm: 180, weightKg: 56 };
    expect(resolveSafeDietGoal(thinAdult, 'cut')).toEqual({
      goal: 'maintain',
      cutLocked: true,
      lockReason: 'underweight',
    });

    const adult = { ...base, age: 24, ageExplicitlySet: true, stillGrowing: 'no' as const, heightCm: 180, weightKg: 78 };
    expect(resolveSafeDietGoal(adult, 'cut')).toEqual({
      goal: 'cut',
      cutLocked: false,
      lockReason: null,
    });
  });

  it('suggests gentle 120 kcal trim when 7-day cut weight avg stalls, respecting safe floor', () => {
    const adult = {
      ...createDefaultProfile(),
      age: 25,
      ageExplicitlySet: true,
      stillGrowing: 'no' as const,
      sex: 'male' as const,
      heightCm: 178,
      weightKg: 78,
      dietGoal: 'cut' as const,
      calorieGoal: 2100,
    };
    const today = '2026-11-15';
    expect(evaluateWeeklyWeightAdjustment(adult, [], today).status).toBe('insufficient_data');

    const metrics = [
      { id: 1, date: addDays(today, -12), weightKg: 78.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 1 },
      { id: 2, date: addDays(today, -9), weightKg: 78.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 2 },
      { id: 3, date: addDays(today, -4), weightKg: 78.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 3 },
      { id: 4, date: addDays(today, -1), weightKg: 78.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 4 },
    ];
    const adj = evaluateWeeklyWeightAdjustment(adult, metrics, today);
    expect(adj.status).toBe('nudge_down');
    expect(adj.suggestedCalorieGoal).toBe(1980);
  });
});

import { computeQuitHabitStats } from '../quitStats';

describe('No-guilt Quit habit stats (F3 / Phase C4)', () => {
  it('preserves cumulative days in control across a slip instead of resetting to 0', () => {
    const today = '2026-11-15';
    // Created 10 days ago (11 total days inclusive)
    const createdAt = Date.parse('2026-11-05T09:00:00Z');
    const item = {
      id: 1,
      category: 'sugar' as const,
      title: 'Late-night sweets',
      slipDates: ['2026-11-15'],
      lastResetAt: createdAt,
      longestDays: 0,
      createdAt,
    };
    const slips = [
      { id: 10, habitId: 1, date: '2026-11-15', trigger: 'Stress', tweak: 'Brush teeth early', createdAt: Date.now() },
    ];
    const stats = computeQuitHabitStats(item, slips, today);
    expect(stats.totalTrackedDays).toBe(11);
    expect(stats.daysInControl).toBe(10);
    expect(stats.successRate30d).toBe(91);
    expect(stats.recentSlips).toHaveLength(1);
  });
});

import { evaluateScanComparisonMatch } from '../faceMetricsConstants';

describe('Scan comparison setup-match check (Phase E)', () => {
  it('marks steady lighting/distance/angle scans Comparable and mismatched setups Not comparable', () => {
    const a = { lightingScore: 76, savedFrontSnapshot: { faceWidthFrac: 0.34, yawDeg: 2 } };
    const b = { lightingScore: 71, savedFrontSnapshot: { faceWidthFrac: 0.36, yawDeg: -1 } };
    expect(evaluateScanComparisonMatch(a, b).label).toBe('Comparable');

    const bad = { lightingScore: 32, savedFrontSnapshot: { faceWidthFrac: 0.52, yawDeg: 15 } };
    const res = evaluateScanComparisonMatch(a, bad);
    expect(res.label).toBe('Not comparable');
    expect(res.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
