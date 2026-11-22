import { describe, expect, it } from 'vitest';
import { PROTOCOL_MAP } from '../../data/protocols';
import { MINDSET_PATHS } from '../../data/pathsCatalog';
import {
  ACCENT_SWATCHES,
  THEME_PRESETS,
  evaluateAccentContrast,
  getShareCardPalette,
  pickSurprisePreset,
  resolveEffectiveLookAndFeel,
} from '../themes';
import {
  ALL_DAILY_CUT_LESSONS,
  LESSONS_BY_PATH,
  buildRealBootLine,
  buildWeeklyCutRecap,
  buildYouTubeSearchUrl,
  computeIdentityVotes,
  computeUnlockedChapters,
  createDefaultMindsetPathsSettings,
  getDailyCutForDate,
  getDailyVideoSuggestion,
  getOnePerDayWeekStrip,
  validateYouTubeVideoUrl,
} from '../mindsetEngine';
import type { AppSettings, TaskCompletion, UserProfile, WorkoutSession } from '../../types';
import { createDefaultAboutMe, createDefaultSettings } from '../../db/database';

function makeBaseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'me',
    name: 'Karim',
    age: 20,
    ageUnknown: false,
    heightCm: 175,
    weightKg: 70,
    sex: 'male',
    goalWeightKg: 70,
    dietGoalMode: 'maintain',
    activityLevel: 'moderate',
    sleepTargetHours: 8,
    waterTargetMl: 2500,
    caloriesTarget: 2300,
    proteinTargetG: 140,
    carbsTargetG: 260,
    fatTargetG: 70,
    sodiumMaxMg: 2300,
    focusAreas: ['body', 'mind'],
    mindSubGoals: ['programming', 'study'],
    prayerEnabled: true,
    mainGoalMode: 'fight_camp',
    gymDaysPerWeek: 4,
    mmaDaysPerWeek: 3,
    targetMonths: 3,
    trainingDays: ['Mon', 'Wed', 'Fri'],
    aboutMe: createDefaultAboutMe(),
    onboardingDone: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeBaseSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...createDefaultSettings(),
    ...overrides,
  };
}

describe('Look & Feel Themes & WCAG AA Contrast', () => {
  it('defines 10 distinct theme presets with AA contrast (>= 4.5:1) on their surface', () => {
    expect(THEME_PRESETS).toHaveLength(10);
    const ids = new Set(THEME_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(10);

    for (const preset of THEME_PRESETS) {
      const check = evaluateAccentContrast(preset.accent, preset.bgSurfaceSolid);
      expect(check.ratioOnSurface).toBeGreaterThanOrEqual(4.5);
      expect(check.ratioOnButton).toBeGreaterThanOrEqual(4.5);
      expect(check.passesAA).toBe(true);
    }
  });

  it('defines 12 accent swatches with AA contrast on both dark OLED and light clean surfaces', () => {
    expect(ACCENT_SWATCHES).toHaveLength(12);
    for (const sw of ACCENT_SWATCHES) {
      const darkCheck = evaluateAccentContrast(sw.hex, '#0D131F');
      expect(darkCheck.ratioOnSurface).toBeGreaterThanOrEqual(4.5);
      expect(darkCheck.ratioOnButton).toBeGreaterThanOrEqual(4.5);

      const lightCheck = evaluateAccentContrast(sw.lightHex, '#FFFFFF');
      expect(lightCheck.ratioOnSurface).toBeGreaterThanOrEqual(4.5);
      expect(lightCheck.ratioOnButton).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('switches automatically between Light Clean by day and dark at night when Schedule is enabled', () => {
    const settings = makeBaseSettings();
    settings.lookAndFeel!.scheduleEnabled = true;
    settings.lookAndFeel!.preset = 'noir_gold';

    const noon = resolveEffectiveLookAndFeel({
      settings,
      systemDark: true,
      now: new Date(2026, 4, 10, 12, 0),
    });
    expect(noon.resolvedIsDark).toBe(false);
    expect(noon.resolvedPreset.id).toBe('light_clean');

    const night = resolveEffectiveLookAndFeel({
      settings,
      systemDark: false,
      now: new Date(2026, 4, 10, 22, 0),
    });
    expect(night.resolvedIsDark).toBe(true);
    expect(night.resolvedPreset.id).toBe('noir_gold');
  });

  it('picks a deterministic Surprise Me preset different from the current preset', () => {
    const picked = pickSurprisePreset('2026-05-10', 'obsidian');
    expect(picked).not.toBe('obsidian');
    expect(THEME_PRESETS.some((p) => p.id === picked)).toBe(true);
  });

  it('produces theme-matched Share Card palettes for dark presets vs Light Clean', () => {
    const noirSettings = makeBaseSettings();
    noirSettings.lookAndFeel!.preset = 'noir_gold';
    const noirPalette = getShareCardPalette(noirSettings);
    expect(noirPalette.bg).toBe('#050506');
    expect(noirPalette.accent).toBe('#EAB308');

    const lightSettings = makeBaseSettings();
    lightSettings.lookAndFeel!.preset = 'light_clean';
    const lightPalette = getShareCardPalette(lightSettings);
    expect(lightPalette.bg).toBe('#F4F7FA');
    expect(lightPalette.accent).toBe('#0369A1');
  });
});

describe('Mindset Paths Catalog & Safety Guardrails', () => {
  it('places the 3 Real People paths FIRST (M1, M2, M3) with paraphrase disclaimers & Goggins injury warning', () => {
    expect(MINDSET_PATHS.slice(0, 3).map((p) => p.id)).toEqual([
      'eagle',
      'callous_mind',
      'finisher',
    ]);

    for (const realPath of MINDSET_PATHS.slice(0, 3)) {
      expect(realPath.isRealPerson).toBe(true);
      expect(realPath.paraphraseLabel?.toLowerCase()).toContain('paraphrase');
      expect(realPath.realPersonDisclaimer?.toLowerCase()).toContain('not affiliated');
    }

    const goggins = MINDSET_PATHS.find((p) => p.id === 'callous_mind')!;
    expect(goggins.guardrailNote?.toLowerCase()).toContain('injury');
    expect(goggins.leaveThis.toLowerCase()).toContain('sleep');
  });

  it('ensures every path references valid CURATED_PROTOCOLS IDs, 30 lessons, and >= 20 YouTube topics', () => {
    expect(MINDSET_PATHS).toHaveLength(12);
    expect(ALL_DAILY_CUT_LESSONS.length).toBeGreaterThanOrEqual(360);

    for (const path of MINDSET_PATHS) {
      expect(path.habitProtocolIds.length).toBeGreaterThanOrEqual(3);
      for (const pid of path.habitProtocolIds) {
        expect(PROTOCOL_MAP[pid]).toBeDefined();
      }
      expect(path.badgeNames).toHaveLength(6);
      expect(path.youtubeTopics.length).toBeGreaterThanOrEqual(20);
      expect(LESSONS_BY_PATH[path.id]).toHaveLength(30);
    }
  });
});

describe('Daily Cut, 14-Day No-Repeat, Age Filter & One-Per-Day Calendar', () => {
  it('avoids repeating any lesson from the last 14 days when selecting today’s Daily Cut', () => {
    const mp = createDefaultMindsetPathsSettings();
    mp.mode = 'single';
    mp.mainPathId = 'operator';

    const operatorLessons = LESSONS_BY_PATH.operator;
    const history: Record<string, string> = {};
    for (let i = 1; i <= 14; i++) {
      const dateStr = `2026-05-${String(i).padStart(2, '0')}`;
      history[dateStr] = operatorLessons[i - 1].id;
    }
    mp.dailyCutHistory = history;

    const settings = makeBaseSettings({ mindsetPaths: mp });
    const cut = getDailyCutForDate({
      profile: makeBaseProfile({ age: 21 }),
      settings,
      todayKey: '2026-05-15',
    });

    expect(cut).not.toBeNull();
    expect(cut!.sourceLabel).toContain('The Operator');
    expect(Object.values(history)).not.toContain(cut!.lesson.id);
  });

  it('excludes hidden paths and filters mature story paths cleanly for under-18 or unknown age', () => {
    const mp = createDefaultMindsetPathsSettings();
    mp.mode = 'single';
    mp.mainPathId = 'rebel_mind';

    const settings = makeBaseSettings({ mindsetPaths: mp });
    const teenCut = getDailyCutForDate({
      profile: makeBaseProfile({ age: 16, ageUnknown: false }),
      settings,
      todayKey: '2026-05-10',
    });
    expect(teenCut).not.toBeNull();
    expect(teenCut!.isUnder18Filtered).toBe(true);
    expect(teenCut!.displayIdea).toBe(teenCut!.lesson.matureSafeSummary);

    // Unknown age defaults to teen safety too
    const unknownAgeCut = getDailyCutForDate({
      profile: makeBaseProfile({ age: 25, ageUnknown: true }),
      settings,
      todayKey: '2026-05-10',
    });
    expect(unknownAgeCut!.isUnder18Filtered).toBe(true);

    // Hidden path returns null if no other path active
    mp.hiddenPathIds = ['rebel_mind'];
    const hiddenCut = getDailyCutForDate({
      profile: makeBaseProfile({ age: 21 }),
      settings: makeBaseSettings({ mindsetPaths: mp }),
      todayKey: '2026-05-10',
    });
    expect(hiddenCut).toBeNull();
  });

  it('builds a 7-day One-Per-Day strip and supports "Choose today’s person" override', () => {
    const mp = createDefaultMindsetPathsSettings();
    mp.mode = 'one_per_day';
    mp.mainPathId = 'eagle';
    mp.inspirationIds = ['operator', 'grinder'];
    mp.todayPersonOverrideDate = '2026-05-10';
    mp.todayPersonOverrideId = 'operator';

    const strip = getOnePerDayWeekStrip({ mp, todayKey: '2026-05-10' });
    expect(strip).toHaveLength(7);
    const todayEntry = strip.find((d) => d.dateKey === '2026-05-10');
    expect(todayEntry?.pathId).toBe('operator');
  });

  it('builds weekly 3-item recap strictly from real acted cuts', () => {
    const mp = createDefaultMindsetPathsSettings();
    mp.actedCutIdsByDate = {
      '2026-05-08': [LESSONS_BY_PATH.eagle[0].id],
      '2026-05-09': [LESSONS_BY_PATH.operator[2].id, LESSONS_BY_PATH.grinder[1].id],
      '2026-05-10': [LESSONS_BY_PATH.finisher[0].id],
    };
    const recap = buildWeeklyCutRecap(mp, '2026-05-10');
    expect(recap).toHaveLength(3);
  });
});

describe('Identity Votes, 90-Day Real Chapters, Boot Line & Long-Form Video Rules', () => {
  it('computes real identity votes across tasks + workouts and gates 90-day Chapters strictly on real logged days', () => {
    const mp = createDefaultMindsetPathsSettings();
    mp.mainPathId = 'eagle';
    const settings = makeBaseSettings({ mindsetPaths: mp });

    const completions: TaskCompletion[] = [
      { id: 'c1', taskId: 't1', date: '2026-05-10', completedAt: 1, xpEarned: 15 },
      { id: 'c2', taskId: 't2', date: '2026-05-10', completedAt: 2, xpEarned: 15 },
      { id: 'c3', taskId: 't1', date: '2026-05-09', completedAt: 3, xpEarned: 15 },
    ];
    const workouts: WorkoutSession[] = [
      {
        id: 1,
        date: '2026-05-10',
        type: 'MMA',
        minutes: 60,
        intensity: 'hard',
        completedAt: 4,
      },
    ];

    const votes = computeIdentityVotes({
      settings,
      completions,
      workouts,
      todayKey: '2026-05-10',
    });
    expect(votes.todayVotes).toBe(3);
    expect(votes.weeklyTotalVotes).toBe(4);
    expect(votes.sevenDayBars).toHaveLength(7);

    const chapters = computeUnlockedChapters({ completions, workouts, settings });
    expect(chapters).toHaveLength(6);
    expect(chapters[0].unlocked).toBe(true); // >= 1 active day (2 active days)
    expect(chapters[1].unlocked).toBe(false); // requires 7 real logged days

    const bootLine = buildRealBootLine({
      dayNumber: 5,
      weeklySessions: 3,
      todayCompletedCount: 2,
      settings,
    });
    expect(bootLine).toContain('Day 5');
    expect(bootLine).toContain('3 sessions this week');
    expect(bootLine).toContain('2 done today');
  });

  it('blocks YouTube Shorts URLs, keeps long-form 4-20m search URLs clean, and adds external creator notice', () => {
    const shortsCheck = validateYouTubeVideoUrl('https://www.youtube.com/shorts/abc123');
    expect(shortsCheck.valid).toBe(false);
    expect(shortsCheck.reason?.toLowerCase()).toContain('shorts');

    const nonYtCheck = validateYouTubeVideoUrl('https://tiktok.com/@someone/video/1');
    expect(nonYtCheck.valid).toBe(false);

    const validLong = validateYouTubeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(validLong.valid).toBe(true);

    const primarySearch = buildYouTubeSearchUrl('Khabib Nurmagomedov discipline values interview', true);
    expect(primarySearch).toContain('sp=EgIYAw%3D%3D');
    const plainFallback = buildYouTubeSearchUrl('Khabib Nurmagomedov discipline values interview', false);
    expect(plainFallback).not.toContain('sp=EgIYAw');

    const mp = createDefaultMindsetPathsSettings();
    mp.mainPathId = 'eagle';
    const video = getDailyVideoSuggestion({ mp, todayKey: '2026-05-10' });
    expect(video.isRealPersonPath).toBe(true);
    expect(video.primaryUrl).toContain('sp=EgIYAw%3D%3D');
  });
});
