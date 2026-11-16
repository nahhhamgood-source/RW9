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
import {
  UNDER_18_FIGHT_WEIGHT_MSG,
  computeEarliestSafeDate,
  computeFightCampPlan,
  computeSafeWeeklyPaceKg,
} from '../fightCamp';
import { buildNormalizedImportPreview, parseHealthFileText } from '../connections';
import { evaluateMealFitForToday } from '../../data/mealLibrary';

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

import { vi } from 'vitest';
import { buildPlanForProfile, createDefaultAboutMe, createDefaultSettings, isAboutMeItemConfirmed } from '../../db/database';
import { formatDisplayNumber } from '../../i18n/arabicHints';
import { answerCoachQuery } from '../coach';
import { toLocalDateKey } from '../date';
import {
  MEWING_LINES,
  NECK_SET_LINES,
  computeMewingWeeklyCount,
  computeNeckSetStreak,
  generateRemindersIcs,
  getFriendlyReminderLine,
  getInAppDueReminders,
  getReminderDeliveryInfo,
  isWithinQuietHours,
} from '../notifications';
import { CCW_TEMPORALIS_INFO_CARD, GLOSSARY_TERMS } from '../../data/academy';
import { computeHonestDailyLine, detectUserPatterns } from '../patterns';
import type { ActiveProtocolTask, DailyLog, ExerciseSessionLog, MealScanEntry, TaskCompletion, WorkoutSession } from '../../types';

describe('Understand Me: Pattern engine, About Me confirmations & Arabic-Indic digits (Part 8)', () => {
  it('detects breakfast-gap, big-lunch, load-vs-sleep, weight-trend-honesty & time-of-day consistency with 2-card cap and dismiss filtering', () => {
    const today = '2026-11-15';
    const profile = { ...createDefaultProfile(), calorieGoal: 2200, targetSleepHours: 8 };

    // 4 days skipping breakfast (<150 kcal) with heavy lunches (~1100 kcal, >40% of ~1500 total)
    const mealScans: MealScanEntry[] = [0, -1, -2, -3].flatMap((offset, idx) => {
      const date = addDays(today, offset);
      return [
        {
          id: idx * 2 + 1,
          date,
          timestamp: Date.parse(`${date}T14:00:00Z`),
          mealTitle: 'Koshari plate',
          mealType: 'lunch' as const,
          items: [],
          totalCalories: 1100,
          totalProteinG: 30,
          totalCarbsG: 165,
          totalFatsG: 26,
          totalSodiumMg: 900,
          totalAddedSugarG: 4,
          debloatStatus: 'moderate' as const,
          debloatHeadline: 'Moderate sodium',
          summaryNote: '',
          confidence: 'Medium' as const,
          isManual: true,
        },
        {
          id: idx * 2 + 2,
          date,
          timestamp: Date.parse(`${date}T20:00:00Z`),
          mealTitle: 'Zabady yogurt',
          mealType: 'dinner' as const,
          items: [],
          totalCalories: 400,
          totalProteinG: 25,
          totalCarbsG: 40,
          totalFatsG: 10,
          totalSodiumMg: 120,
          totalAddedSugarG: 6,
          debloatStatus: 'optimal' as const,
          debloatHeadline: 'Low sodium',
          summaryNote: '',
          confidence: 'High' as const,
          isManual: true,
        },
      ];
    });

    const workouts: WorkoutSession[] = [0, -2, -4].map((offset, idx) => ({
      id: idx + 1,
      date: addDays(today, offset),
      name: 'MMA Conditioning',
      durationMin: 60,
      exercises: [],
      notes: '',
      createdAt: Date.now(),
    }));

    const dailyLogs: DailyLog[] = [0, -1, -2, -3].map((offset) => ({
      date: addDays(today, offset),
      sleepHours: 6.2,
      sleepQuality: 3,
      bedtime: '00:30',
      wakeTime: '06:45',
      waterMl: 2000,
      steps: 8000,
      proteinG: 110,
      calories: 1500,
      mood: 3,
      energy: 3,
      restingHr: null,
      notes: '',
      updatedAt: Date.now(),
    }));

    const bodyMetrics = [
      { id: 1, date: addDays(today, -12), weightKg: 75.2, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 1 },
      { id: 2, date: addDays(today, -9), weightKg: 75.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 2 },
      { id: 3, date: addDays(today, -3), weightKg: 74.6, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 3 },
      { id: 4, date: addDays(today, -1), weightKg: 74.4, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 4 },
    ];

    const tasks: ActiveProtocolTask[] = [
      {
        id: 't-am',
        protocolId: 'p1',
        title: 'AM Water',
        actionLine: 'Drink water',
        why: 'Hydration',
        steps: ['Drink 500 ml'],
        evidence: 'Proven',
        category: 'hydration',
        block: 'morning',
        minutes: 2,
        xp: 10,
        isCustom: false,
        enabled: true,
        sortOrder: 1,
      },
      {
        id: 't-pm',
        protocolId: 'p2',
        title: 'Evening Walk',
        actionLine: 'Walk 10m',
        why: 'Recovery',
        steps: ['Walk outside'],
        evidence: 'Proven',
        category: 'training',
        block: 'evening',
        minutes: 10,
        xp: 15,
        isCustom: false,
        enabled: true,
        sortOrder: 2,
      },
    ];

    const completions: TaskCompletion[] = [0, -1, -2, -3].map((offset) => ({
      id: `${addDays(today, offset)}::t-am`,
      date: addDays(today, offset),
      taskId: 't-am',
      minutes: 2,
      xpEarned: 10,
      completedAt: Date.now(),
    }));

    // Capped at 2 cards by default even though all 5 patterns fire
    const capped = detectUserPatterns({
      todayKey: today,
      profile,
      dailyLogs,
      mealScans,
      workouts,
      bodyMetrics,
      tasks,
      completions,
    });
    expect(capped.cards).toHaveLength(2);
    expect(capped.totalDetectedBeforeCap).toBe(5);
    expect(capped.cards.map((c) => c.id)).toEqual(['breakfast-gap', 'big-lunch']);

    // Dismissing top patterns surfaces remaining ones
    const dismissed = detectUserPatterns({
      todayKey: today,
      profile,
      dailyLogs,
      mealScans,
      workouts,
      bodyMetrics,
      tasks,
      completions,
      dismissedIds: ['breakfast-gap', 'big-lunch'],
      maxCards: 3,
    });
    expect(dismissed.cards.map((c) => c.id)).toEqual([
      'load-vs-sleep',
      'weight-trend-honesty',
      'time-of-day-consistency',
    ]);
    expect(dismissed.cards[1].suggestion).toContain('0.5–1.5 kg');

    // Sparse logs return honest insufficient data message
    const emptyRes = detectUserPatterns({
      todayKey: today,
      profile,
      dailyLogs: [],
      mealScans: [],
      workouts: [],
      bodyMetrics: [],
      tasks: [],
      completions: [],
    });
    expect(emptyRes.cards).toHaveLength(0);
    expect(emptyRes.insufficientSummary).toContain('Not enough data yet');
  });

  it('computes honest daily lines including rough-day mode', () => {
    expect(
      computeHonestDailyLine({
        todayKey: '2026-11-15',
        workouts: [],
        dailyLogs: [],
        completions: [],
        targetSleepHours: 8,
        isRoughDay: true,
      })
    ).toContain('Rough day mode on');
  });

  it('enforces confirm/edit/delete status on AboutMe items and never auto-confirms suggestions', () => {
    const about = createDefaultAboutMe(74);
    expect(isAboutMeItemConfirmed(about, 'location_foods')).toBe(false);
    expect(isAboutMeItemConfirmed(about, 'training_camp')).toBe(false);

    const confirmed = {
      ...about,
      statuses: { ...about.statuses, location_foods: 'confirmed' as const, training_camp: 'edited' as const },
    };
    expect(isAboutMeItemConfirmed(confirmed, 'location_foods')).toBe(true);
    expect(isAboutMeItemConfirmed(confirmed, 'training_camp')).toBe(true);

    const deleted = {
      ...confirmed,
      deletedKeys: ['location_foods' as const],
    };
    expect(isAboutMeItemConfirmed(deleted, 'location_foods')).toBe(false);
  });

  it('formats numbers with Arabic-Indic digits only when toggled on', () => {
    expect(formatDisplayNumber('2150 kcal', false)).toBe('2150 kcal');
    expect(formatDisplayNumber('2150 kcal', true)).toBe('٢١٥٠ kcal');
    expect(formatDisplayNumber(74.5, true)).toBe('٧٤.٥');
  });
});

describe('Understand Me: Coach guardrails & reminder quiet/training windows (Part 8)', () => {
  const baseCtx = {
    profile: { ...createDefaultProfile(), age: 21, ageExplicitlySet: true, stillGrowing: 'no' as const },
    settings: createDefaultSettings(),
    tasks: [],
    completions: [],
    dailyLogs: [],
    skinEntries: [],
    scans: [],
    workouts: [],
    mealScans: [],
    bodyMetrics: [],
  };

  it('blocks dangerous fight-camp dehydration/sauna cuts and dosing advice', () => {
    const res = answerCoachQuery('How do I do a sauna water cut to drop 3 kg fast?', baseCtx);
    expect(res.title).toContain('Safe Fight-Camp Rule');
    expect(res.bullets.join(' ')).toMatch(/cannot advise dehydration|sauna cuts/i);
  });

  it('triggers crisis/distress referral without playing therapist or doctor', () => {
    const res = answerCoachQuery('I feel hopeless and want to hurt myself', baseCtx);
    expect(res.title).toContain('do not have to carry this alone');
    expect(res.bullets.join(' ')).toMatch(/licensed doctor|counselor|trusted/i);
  });

  it('respects under-18/unknown age calorie lock in food advice and supports rough-day resets', () => {
    const teenCtx = {
      ...baseCtx,
      profile: { ...createDefaultProfile(), age: 16, ageExplicitlySet: true, stillGrowing: 'yes' as const },
    };
    const foodRes = answerCoachQuery('What should I eat for breakfast or lunch in Egypt?', teenCtx);
    expect(foodRes.bullets.join(' ')).toContain('no calorie cutting');

    const roughRes = answerCoachQuery('I am having a rough day and feel overwhelmed', baseCtx);
    expect(roughRes.title).toContain('Rough-Day Reset');
  });

  it('suppresses in-app reminders inside quiet hours & training window and trims Friday load when relaxedFridayMode is enabled', () => {
    expect(isWithinQuietHours(19 * 60, '18:00', '20:00')).toBe(true);
    expect(isWithinQuietHours(17 * 60, '18:00', '20:00')).toBe(false);

    vi.useFakeTimers();
    try {
      // Friday 2026-11-13 at 19:00 local time inside default 18:00-20:00 training window -> suppressed
      vi.setSystemTime(new Date(2026, 10, 13, 19, 0, 0));
      const settings = {
        ...createDefaultSettings(),
        trainingWindowStart: '18:00',
        trainingWindowEnd: '20:00',
        relaxedFridayMode: true,
        reminders: {
          ...createDefaultSettings().reminders,
          enabled: true,
          waterReminder: true,
          postureBreakEnabled: true,
          studyReminderEnabled: true,
          studyReminderTime: '12:00',
        },
      };
      expect(getInAppDueReminders(settings, null, '2026-11-13')).toEqual([]);

      // Friday 2026-11-13 at 13:00 (outside training window): relaxedFridayMode filters water/posture-break/study
      vi.setSystemTime(new Date(2026, 10, 13, 13, 0, 0));
      const fridayDue = getInAppDueReminders(settings, null, '2026-11-13');
      expect(fridayDue.some((r) => ['water', 'posture-break', 'study'].includes(r.id))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('wires confirmed About Me & active dayMode into Daily 6 buildPlanForProfile while ignoring unconfirmed suggestions', () => {
    const todayKey = toLocalDateKey();
    const baseProfile = {
      ...createDefaultProfile(),
      age: 21,
      ageExplicitlySet: true,
      stillGrowing: 'no' as const,
      focusAreas: ['face' as const, 'body' as const],
      dailyTimeBudgetMin: 30 as const,
      workoutDaysPerWeek: 4,
    };
    const settings = { ...createDefaultSettings(), easyMode: true };

    // Unconfirmed About Me suggestions must NOT alter baseline Daily 6 selection
    const unconfirmedPlan = buildPlanForProfile(baseProfile, null, settings);
    expect(unconfirmedPlan).toHaveLength(6);
    const unconfirmedIds = unconfirmedPlan.map((t) => t.protocolId);
    expect(unconfirmedIds).not.toContain('body-mobility-flow');

    // Confirming training_camp + eating_pattern injects Fight Camp & nutrition tasks within 6-task budget
    const confirmedProfile = {
      ...baseProfile,
      aboutMe: {
        ...baseProfile.aboutMe!,
        statuses: {
          ...baseProfile.aboutMe!.statuses,
          training_camp: 'confirmed' as const,
          eating_pattern: 'edited' as const,
        },
      },
    };
    const confirmedPlan = buildPlanForProfile(confirmedProfile, null, settings);
    expect(confirmedPlan).toHaveLength(6);
    const confirmedIds = confirmedPlan.map((t) => t.protocolId);
    expect(confirmedIds).toContain('body-workout-day');
    expect(confirmedIds).toContain('body-protein-check');

    // Rest day mode demotes heavy workout & elevates recovery walk/wind-down
    const restPlan = buildPlanForProfile(confirmedProfile, null, {
      ...settings,
      dayModeByDate: { [todayKey]: 'rest' },
    });
    const restIds = restPlan.map((t) => t.protocolId);
    expect(restIds).toContain('body-10min-walk');
    expect(restIds).toContain('body-sleep-winddown');
  });

  it('includes tongue posture check-ins in exported ICS and never writes private quit topics', () => {
    const settings = {
      ...createDefaultSettings(),
      tongueReminderTimes: ['10:00', '14:30', '19:00'],
      prayerTrackingEnabled: true,
    };
    const ics = generateRemindersIcs(settings);
    expect(ics).toContain('ASCEND: Gentle Posture Check-In');
    expect(ics).toContain('ascend-posture-check-1@ascend.local');
    expect(ics).toContain('ascend-prayer-fajr@ascend.local');
    expect(ics.toLowerCase()).not.toContain('quit');
  });
});

describe('Run 3 Fight Camp, Connections & Street-Food helpers', () => {
  it('computes safe weekly pace (0.5–0.75 kg/wk) and earliest realistic target date', () => {
    expect(computeSafeWeeklyPaceKg(55)).toBe(0.5);
    expect(computeSafeWeeklyPaceKg(75)).toBe(0.6);
    expect(computeSafeWeeklyPaceKg(105)).toBe(0.75);

    const earliest = computeEarliestSafeDate({
      startWeightKg: 75,
      targetWeightKg: 72,
      fromDateKey: '2026-11-01',
    });
    expect(earliest.safeWeeklyPaceKg).toBe(0.6);
    expect(earliest.weeksNeeded).toBe(5);
    expect(earliest.earliestDate).toBe('2026-12-06');
  });

  it('enforces strict under-18 & unknown-age lock on Fight Camp weight cuts', () => {
    const unknownProfile = createDefaultProfile();
    const lockedUnknown = computeFightCampPlan({
      profile: unknownProfile,
      bodyMetrics: [],
      todayKey: '2026-11-01',
    });
    expect(lockedUnknown.allowed).toBe(false);
    expect(lockedUnknown.blockedReason).toBe(UNDER_18_FIGHT_WEIGHT_MSG);

    const minorProfile = {
      ...createDefaultProfile(),
      age: 16,
      ageExplicitlySet: true,
      stillGrowing: 'yes' as const,
      mainGoalMode: 'fight_camp' as const,
      weightKg: 70,
    };
    const lockedMinor = computeFightCampPlan({
      profile: minorProfile,
      bodyMetrics: [],
      todayKey: '2026-11-01',
    });
    expect(lockedMinor.allowed).toBe(false);
    expect(lockedMinor.blockedReason).toBe(UNDER_18_FIGHT_WEIGHT_MSG);
  });

  it('enforces safe calorie floor, >5% cut coach flag, performance easing & Sunday auto-adjust', () => {
    const adultLightProfile = {
      ...createDefaultProfile(),
      sex: 'male' as const,
      age: 22,
      ageExplicitlySet: true,
      stillGrowing: 'no' as const,
      heightCm: 160,
      weightKg: 54,
      activityLevel: 'light' as const,
      mainGoalMode: 'fight_camp' as const,
      aboutMe: {
        ...createDefaultProfile().aboutMe!,
        tournamentUpcoming: true,
        tournamentDate: '2026-11-15',
        targetWeightKg: 50,
      },
    };

    const floorPlan = computeFightCampPlan({
      profile: adultLightProfile,
      bodyMetrics: [],
      todayKey: '2026-11-01',
    });
    expect(floorPlan.allowed).toBe(true);
    expect(floorPlan.dailyCalorieTarget).toBeGreaterThanOrEqual(1500);
    expect(floorPlan.overFivePercentCut).toBe(true);
    expect(floorPlan.tournamentTooSoon).toBe(true);

    // Performance easing when sleep < 6.5h and Sunday plateau auto-adjust
    const adultHeavy = {
      ...adultLightProfile,
      heightCm: 180,
      weightKg: 82,
      activityLevel: 'moderate' as const,
      aboutMe: {
        ...adultLightProfile.aboutMe!,
        tournamentDate: '2027-01-10',
        targetWeightKg: 78,
      },
    };
    const metrics = [
      { date: '2026-10-20', weightKg: 82.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 1 },
      { date: '2026-10-28', weightKg: 82.0, waistCm: null, neckCm: null, bodyFatPct: null, createdAt: 2 },
    ];
    const normalDay = computeFightCampPlan({
      profile: adultHeavy,
      bodyMetrics: metrics,
      todayKey: '2026-11-01',
    });
    const tiredDay = computeFightCampPlan({
      profile: adultHeavy,
      bodyMetrics: metrics,
      todayLog: {
        date: '2026-11-01',
        waterMl: 2000,
        proteinG: 140,
        calories: 2000,
        sleepHours: 5.5,
        sleepQuality: 2,
        bedtime: '',
        wakeTime: '',
        mood: 3,
        energy: 2,
        steps: 8000,
        restingHr: null,
        mewingHours: 0,
        chewingMinutes: 0,
        postureScore: 0,
        morningPuffiness: null,
        jawDiscomfort: false,
        prayersCompleted: {},
        minimumsDone: false,
        gratitudeLine: '',
        notes: '',
        updatedAt: 1,
      },
      todayKey: '2026-11-01',
    });
    expect(tiredDay.performanceEaseApplied).toBe(true);
    expect(tiredDay.dailyCalorieTarget).toBeGreaterThan(normalDay.dailyCalorieTarget);
    expect(normalDay.sundayAdjustedCalories).not.toBeNull();
    expect(normalDay.sundayAdjustedCalories!).toBeLessThan(normalDay.dailyCalorieTarget);
  });

  it('parses health CSV exports, maps columns accurately, and evaluates street-food fit', () => {
    const csv = 'Date,Weight_kg,Sleep_hours,Steps,Activity,Minutes\n2026-11-01,75.4,7.5,9200,MMA Sparring,60\n';
    const parsed = parseHealthFileText('export.csv', csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.suggestedMapping.date).toBe('Date');
    expect(parsed.suggestedMapping.weightKg).toBe('Weight_kg');

    const normalized = buildNormalizedImportPreview(parsed.rows, parsed.suggestedMapping);
    expect(normalized[0]).toEqual({
      date: '2026-11-01',
      weightKg: 75.4,
      sleepHours: 7.5,
      steps: 9200,
      workoutName: 'MMA Sparring',
      workoutMin: 60,
    });

    expect(evaluateMealFitForToday(500, 650)).toBe('Fits today');
    expect(evaluateMealFitForToday(650, 500)).toBe('Split or swap lighter');
    expect(evaluateMealFitForToday(800, 400)).toBe('Better on a training day');
  });
});

describe('Add-on Part B & C (Mewing/Neck reminders + CCW info card)', () => {
  it('rotates 8+ friendly non-shaming lines per tone and includes saved user name only when provided', () => {
    for (const tone of ['normal', 'chill', 'serious'] as const) {
      expect(MEWING_LINES[tone].length).toBeGreaterThanOrEqual(8);
      expect(NECK_SET_LINES[tone].length).toBeGreaterThanOrEqual(8);
      for (const line of [...MEWING_LINES[tone], ...NECK_SET_LINES[tone]]) {
        expect(line.toLowerCase()).not.toContain('failed');
        expect(line.toLowerCase()).not.toContain('shame');
      }
    }
    const unnamed = getFriendlyReminderLine('mewing', 'normal', '', '2026-11-01', 0);
    const named = getFriendlyReminderLine('mewing', 'normal', 'Omar', '2026-11-01', 0);
    expect(unnamed.startsWith('Omar,')).toBe(false);
    expect(named.startsWith('Omar, ')).toBe(true);
  });

  it('computes neck-set streak and weekly mewing check count from real exerciseLogs', () => {
    const logs: ExerciseSessionLog[] = [
      { date: '2026-11-01', programId: 'reminder_neck_set', programTitle: 'Neck', domain: 'face', level: 1, minutes: 2, xpEarned: 10, completedAt: 1 },
      { date: '2026-10-31', programId: 'reminder_neck_set', programTitle: 'Neck', domain: 'face', level: 1, minutes: 2, xpEarned: 10, completedAt: 2 },
      { date: '2026-10-30', programId: 'reminder_neck_set', programTitle: 'Neck', domain: 'face', level: 1, minutes: 2, xpEarned: 10, completedAt: 3 },
      { date: '2026-11-01', programId: 'reminder_mewing', programTitle: 'Mewing', domain: 'face', level: 1, minutes: 1, xpEarned: 10, completedAt: 4 },
      { date: '2026-10-28', programId: 'reminder_mewing', programTitle: 'Mewing', domain: 'face', level: 1, minutes: 1, xpEarned: 10, completedAt: 5 },
      { date: '2026-10-20', programId: 'reminder_mewing', programTitle: 'Mewing', domain: 'face', level: 1, minutes: 1, xpEarned: 10, completedAt: 6 },
    ];
    expect(computeNeckSetStreak(logs, '2026-11-01')).toBe(3);
    expect(computeMewingWeeklyCount(logs, '2026-11-01')).toBe(2);
  });

  it('enforces max 6 reminders/day cap, honest unconfigured push message, and private-safe ICS defaults', () => {
    const info = getReminderDeliveryInfo(false);
    expect(info.detail).toContain('Push is not set up. Use the Android app or the calendar file.');

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 10, 2, 20, 30, 0));
      const settings = {
        ...createDefaultSettings(),
        trainingWindowStart: '05:00',
        trainingWindowEnd: '05:30',
        prayerTrackingEnabled: true,
        reminders: {
          ...createDefaultSettings().reminders,
          enabled: true,
          mewingCheckEnabled: true,
          neckSetEnabled: true,
          maxPerDay: 8,
          showDetailsInNotifications: false,
        },
      };
      const due = getInAppDueReminders(settings, null, '2026-11-02');
      expect(due.length).toBeLessThanOrEqual(6);

      const icsHidden = generateRemindersIcs(settings);
      expect(icsHidden).toContain('ASCEND: Quick check-in');
      expect(icsHidden).toContain('ascend-neck-set@ascend.local');
    } finally {
      vi.useRealTimers();
    }
  });

  it('provides CCW rotation / temporalis training as a Not proven info card and glossary entries', () => {
    expect(CCW_TEMPORALIS_INFO_CARD.tag).toBe('Not proven');
    expect(CCW_TEMPORALIS_INFO_CARD.alternatives.some((a) => a.evidence === 'Proven')).toBe(true);
    const terms = GLOSSARY_TERMS.map((g) => g.term);
    expect(terms).toContain('CCW rotation');
    expect(terms).toContain('Temporalis training');
  });
});



