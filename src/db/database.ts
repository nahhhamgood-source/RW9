import Dexie, { type Table } from 'dexie';
import { CURATED_PROTOCOLS, PROTOCOL_MAP } from '../data/protocols';
import { BADGE_DEFINITIONS, xpRequiredForLevel } from '../data/badges';
import { addDays, getIsoWeekKey, setDayStartHour4am, toLocalDateKey } from '../lib/date';
import { calculateMifflinStJeor } from '../lib/fitness';
import {
  buildEventOutcomeDraftMeal,
  buildOneQuestionDayEstimate,
  classifyDayTrackingStatus,
  createDefaultRealLifeSettings,
} from '../lib/realLifeFood';
import { getEventTypeMeta } from '../data/eventPresets';
import { createDefaultLookAndFeelSettings } from '../lib/themes';
import {
  createDefaultMindsetPathsSettings,
  getActivePathIds,
  getMindsetPathsSettings,
  getPathDefinitionForUser,
} from '../lib/mindsetEngine';
import type {
  AboutMeItemKey,
  AboutMeProfile,
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  EventOutcomeLevel,
  EventType,
  ExerciseSessionLog,
  FaceScanResult,
  FocusAreaId,
  GoalHorizon,
  GrowthCheckoffEntry,
  GrowthProgramProgress,
  HairPreference,
  HeightLogEntry,
  LifeGoal,
  LifeListItem,
  MealScanEntry,
  OutfitRecord,
  OwnedProduct,
  PuffinessLogEntry,
  QuitHabitItem,
  QuitSlipEntry,
  SavedMealTemplate,
  SkinEntry,
  TaskCompletion,
  UnlockedBadge,
  UserProfile,
  WardrobeItem,
  WorkoutSession,
  XpState,
} from '../types';

const BOOT_MIRROR_KEY = 'ascend_boot_mirror_v1';
const PRE_UPGRADE_SNAPSHOT_KEY = 'ascend_pre_upgrade_backup_v6';

export interface BootMirrorPayload {
  onboardingComplete: boolean;
  profile: UserProfile;
  updatedAt: number;
}

export function isAgeUnknown(
  profile: Pick<UserProfile, 'age' | 'ageExplicitlySet' | 'onboardingSkipped'>
): boolean {
  if (!Number.isFinite(profile.age) || profile.age <= 0) return true;
  if (profile.ageExplicitlySet === false) return true;
  if (profile.onboardingSkipped && profile.ageExplicitlySet !== true) return true;
  return false;
}

export function isUnder18OrGrowing(
  profile: Pick<UserProfile, 'age' | 'stillGrowing' | 'ageExplicitlySet' | 'onboardingSkipped'>
): boolean {
  if (isAgeUnknown(profile)) return true;
  return profile.age < 18 || profile.stillGrowing === 'yes';
}

export function readBootMirror(): BootMirrorPayload | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(BOOT_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootMirrorPayload;
    if (!parsed || typeof parsed !== 'object' || !parsed.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBootMirror(profile: UserProfile): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const payload: BootMirrorPayload = {
      onboardingComplete: Boolean(
        profile.onboardingComplete || profile.onboardingDone || profile.onboardingSkipped
      ),
      profile,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(BOOT_MIRROR_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearBootMirror(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(BOOT_MIRROR_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function requestPersistentStorageAndCheck(): Promise<{
  persisted: boolean;
  storageAvailable: boolean;
  warning: string | null;
}> {
  let localStorageOk = false;
  try {
    const testKey = '__ascend_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    localStorageOk = window.localStorage.getItem(testKey) === '1';
    window.localStorage.removeItem(testKey);
  } catch {
    localStorageOk = false;
  }

  let persisted = false;
  try {
    if (navigator.storage?.persisted) {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted && navigator.storage?.persist) {
      persisted = await navigator.storage.persist();
    }
  } catch {
    persisted = false;
  }

  const idbAvailable = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  if (!localStorageOk || !idbAvailable) {
    return {
      persisted,
      storageAvailable: false,
      warning:
        'Browser storage looks limited here (private mode or in-app browser). Back up with Export in Settings so you do not lose data.',
    };
  }

  return {
    persisted,
    storageAvailable: true,
    warning: null,
  };
}

export class AscendDB extends Dexie {
  profile!: Table<UserProfile, string>;
  settings!: Table<AppSettings, string>;
  protocolTasks!: Table<ActiveProtocolTask, string>;
  taskCompletions!: Table<TaskCompletion, string>;
  dailyLogs!: Table<DailyLog, string>;
  bodyMetrics!: Table<BodyMetricEntry, number>;
  skinEntries!: Table<SkinEntry, number>;
  products!: Table<OwnedProduct, number>;
  hairPreferences!: Table<HairPreference, number>;
  wardrobeItems!: Table<WardrobeItem, number>;
  outfits!: Table<OutfitRecord, number>;
  workouts!: Table<WorkoutSession, number>;
  scans!: Table<FaceScanResult, number>;
  xpState!: Table<XpState, string>;
  mealScans!: Table<MealScanEntry, number>;
  puffinessLogs!: Table<PuffinessLogEntry, number>;
  goals!: Table<LifeGoal, number>;
  lifeList!: Table<LifeListItem, number>;
  heightLogs!: Table<HeightLogEntry, number>;
  quitItems!: Table<QuitHabitItem, number>;
  quitSlips!: Table<QuitSlipEntry, number>;
  exerciseLogs!: Table<ExerciseSessionLog, number>;
  growthCheckoffs!: Table<GrowthCheckoffEntry, string>;
  growthPrograms!: Table<GrowthProgramProgress, string>;

  constructor() {
    super('ascend_offline_db');
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
    });
    this.version(2).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date, createdAt',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
    });
    this.version(3).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date, createdAt',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
      mealScans: '++id, date, timestamp',
    });
    this.version(4).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date, createdAt',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
      mealScans: '++id, date, timestamp',
      puffinessLogs: '++id, date, createdAt',
    });
    this.version(5).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder, scheduledDate',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date, createdAt',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
      mealScans: '++id, date, timestamp',
      puffinessLogs: '++id, date, createdAt',
      goals: '++id, horizon, focusArea, createdAt',
      lifeList: '++id, timeframe, done, dueDate, createdAt',
      heightLogs: '++id, date, createdAt',
    });
    this.version(6).stores({
      profile: 'id',
      settings: 'id',
      protocolTasks: 'id, protocolId, block, category, enabled, sortOrder, scheduledDate',
      taskCompletions: 'id, date, taskId',
      dailyLogs: 'date',
      bodyMetrics: '++id, date',
      skinEntries: '++id, date, createdAt',
      products: '++id, domain, routineSlot, inUse',
      hairPreferences: '++id, faceShape, isFavorite',
      wardrobeItems: '++id, category',
      outfits: '++id, date, isSavedCombo',
      workouts: '++id, date',
      scans: '++id, date, timestamp',
      xpState: 'id',
      mealScans: '++id, date, timestamp, mealType',
      puffinessLogs: '++id, date, createdAt',
      goals: '++id, horizon, focusArea, createdAt',
      lifeList: '++id, timeframe, done, dueDate, createdAt',
      heightLogs: '++id, date, createdAt',
      quitItems: '++id, createdAt',
      growthCheckoffs: 'id, date, habitId',
      growthPrograms: 'id',
    });
    this.version(7)
      .stores({
        profile: 'id',
        settings: 'id',
        protocolTasks: 'id, protocolId, block, category, enabled, sortOrder, scheduledDate',
        taskCompletions: 'id, date, taskId',
        dailyLogs: 'date',
        bodyMetrics: '++id, date',
        skinEntries: '++id, date, createdAt',
        products: '++id, domain, routineSlot, inUse',
        hairPreferences: '++id, faceShape, isFavorite',
        wardrobeItems: '++id, category',
        outfits: '++id, date, isSavedCombo',
        workouts: '++id, date',
        scans: '++id, date, timestamp',
        xpState: 'id',
        mealScans: '++id, date, timestamp, mealType',
        puffinessLogs: '++id, date, createdAt',
        goals: '++id, horizon, focusArea, createdAt',
        lifeList: '++id, timeframe, done, dueDate, createdAt',
        heightLogs: '++id, date, createdAt',
        quitItems: '++id, category, createdAt',
        quitSlips: '++id, habitId, date, createdAt',
        exerciseLogs: '++id, date, programId, domain',
        growthCheckoffs: 'id, date, habitId',
        growthPrograms: 'id',
      })
      .upgrade(async (tx) => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const existingProfile = await tx.table('profile').get('me');
            const existingSettings = await tx.table('settings').get('app');
            window.localStorage.setItem(
              PRE_UPGRADE_SNAPSHOT_KEY,
              JSON.stringify({
                upgradedFromVersion: 6,
                upgradedAt: new Date().toISOString(),
                profile: existingProfile ?? null,
                settings: existingSettings ?? null,
              })
            );
          }
        } catch {
          // Non-fatal pre-upgrade backup guard
        }
      });
  }
}

export const db = new AscendDB();

export const DEFAULT_LOCAL_FOODS = [
  'Shawarma',
  'Hawawshi',
  'Kofta',
  'Sausage (Sogoq)',
  'Liver (Kibda)',
  'Chicken Pane',
  'Macaroni Tagine',
  'Ful',
  "Ta'miya",
  'Koshari',
  'Fiteer',
];

export function createDefaultAboutMe(weightKg = 74): AboutMeProfile {
  return {
    countryRegion: 'Egypt',
    localFoods: [...DEFAULT_LOCAL_FOODS],
    trainingDisciplines: ['Gym (a few months)', 'MMA (a couple months)'],
    tournamentUpcoming: true,
    tournamentDate: null,
    weightClassKg: null,
    currentWeightKg: weightKg,
    targetWeightKg: null,
    eatingPattern: 'Often skips breakfast (coffee with milk only) and overeats at lunch',
    identityFocus:
      'Looksmaxxing / glow-up, tiny daily bites across face, body, mind, cybersecurity, programming & building apps, optional light prayer check-ins',
    supportStyle:
      'Kind, honest coaching, shame-free quit support, picture-first nutrition, app handles the organizing',
    statuses: {
      location_foods: 'suggested',
      training_camp: 'suggested',
      eating_pattern: 'suggested',
      identity_focus: 'suggested',
      support_style: 'suggested',
    },
    deletedKeys: [],
    updatedAt: Date.now(),
  };
}

export function isAboutMeItemConfirmed(
  about: AboutMeProfile | undefined,
  key: AboutMeItemKey
): boolean {
  if (!about) return false;
  if (about.deletedKeys?.includes(key)) return false;
  const st = about.statuses?.[key];
  return st === 'confirmed' || st === 'edited';
}

export function createDefaultProfile(): UserProfile {
  const calc = calculateMifflinStJeor({
    sex: 'male',
    weightKg: 74,
    heightCm: 178,
    age: 20,
    activityLevel: 'moderate',
    goalMode: 'maintain',
  });
  return {
    id: 'me',
    name: '',
    age: 20,
    ageExplicitlySet: false,
    sex: 'male',
    heightCm: 178,
    weightKg: 74,
    waistCm: null,
    neckCm: null,
    stillGrowing: 'unsure',
    motherHeightCm: null,
    fatherHeightCm: null,
    dreamHeightCm: null,
    usualBedtime: '23:00',
    usualWakeTime: '07:00',
    skinType: 'combination',
    skinConcerns: ['oiliness'],
    hairType: 'wavy',
    hairConcerns: [],
    gymLevel: 'beginner',
    workoutDaysPerWeek: 3,
    equipment: 'full_gym',
    targetSleepHours: 8,
    sunExposure: 'moderate',
    goals: ['skin', 'consistency'],
    dietGoal: 'maintain',
    focusAreas: ['face', 'body'],
    mindSubGoals: [],
    dailyTimeBudgetMin: 30,
    activityLevel: 'moderate',
    calorieGoal: calc.recommendedCalories,
    proteinTargetG: calc.proteinGrams,
    waterTargetMl: calc.waterMl,
    stepTarget: 10000,
    detectedFaceShape: null,
    aboutMe: createDefaultAboutMe(74),
    onboardingDone: false,
    onboardingComplete: false,
    onboardingSkipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    id: 'app',
    theme: 'dark',
    accent: 'sky',
    units: 'metric',
    easyMode: true,
    tone: 'normal',
    soundEnabled: false,
    saveThumbnails: true,
    includeSkinScoreInScans: true,
    slangTierNames: true,
    dayStartsAt4am: false,
    onlineConsentSeen: false,
    onlineFoodEnabled: false,
    onlineCoachEnabled: false,
    prayerTrackingEnabled: false,
    dhikrTaskEnabled: false,
    prayerTimes: {
      fajr: '05:15',
      dhuhr: '12:30',
      asr: '15:45',
      maghrib: '18:15',
      isha: '19:45',
    },
    tongueReminderTimes: ['11:00', '15:30', '20:00'],
    arabicHintsEnabled: false,
    arabicIndicDigits: false,
    dismissedPatternIds: [],
    trainingWindowStart: '18:00',
    trainingWindowEnd: '20:00',
    relaxedFridayMode: false,
    roughDayDates: [],
    dayModeByDate: {},
    healthyFrameLastShownDate: null,
    pinHash: null,
    reminders: {
      enabled: true,
      morning: '08:00',
      spf: '12:30',
      workout: '17:30',
      sleep: '22:15',
      rescanDays: 14,
      waterReminder: false,
      waterIntervalMin: 120,
      breakfastTime: '08:30',
      lunchTime: '13:30',
      dinnerTime: '19:30',
      mealLogReminder: false,
      exerciseReminder: false,
      exerciseTime: '18:00',
      postureBreakEnabled: false,
      weeklyPhotoEnabled: true,
      monthlyHeightEnabled: true,
      studyReminderEnabled: false,
      studyReminderTime: '16:00',
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
      maxPerDay: 6,
      mewingCheckEnabled: true,
      neckSetEnabled: true,
      neckSetTime: '19:30',
      showDetailsInNotifications: false,
    },
    celebratedMilestones: [],
    lastAutoPlanDate: null,
    quickMealLastInputs: { calories: '520', protein: '35', sodium: '550' },
    realLifeFood: createDefaultRealLifeSettings(),
    mealTemplates: [],
    skippedGapCheckinDates: [],
    dailyCheckinAskedDates: {},
    lastWeeklyReviewDate: null,
    lastBackupDate: null,
    autoPedometer: false,
    lookAndFeel: createDefaultLookAndFeelSettings(),
    mindsetPaths: createDefaultMindsetPathsSettings(),
  };
}

export function createDefaultXpState(): XpState {
  return {
    id: 'xp',
    totalXp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    streakFreezesRemaining: 1,
    lastFreezeWeek: getIsoWeekKey(toLocalDateKey()),
    unlockedBadges: [],
  };
}

export function isDayCompleteForStreak(completedCount: number, enabledCount: number): boolean {
  const safeTotal = Math.max(1, enabledCount);
  const threshold = Math.max(1, Math.ceil(safeTotal * 0.7));
  return completedCount >= threshold;
}

export function buildPlanForProfile(
  profile: UserProfile,
  latestScan?: FaceScanResult | null,
  settings?: Partial<AppSettings> | null
): ActiveProtocolTask[] {
  const budget = profile.dailyTimeBudgetMin;
  const isEasy = settings?.easyMode ?? true;
  // Simple mode keeps daily stack light (5-6 core habits); Plus/Pro allows up to 10
  const targetCount = isEasy
    ? budget === 15
      ? 5
      : 6
    : budget === 15
    ? 6
    : budget === 30
    ? 8
    : 10;

  const activeFocus: FocusAreaId[] =
    profile.focusAreas && profile.focusAreas.length > 0
      ? profile.focusAreas
      : ['face', 'body'];
  const mindSub = new Set(profile.mindSubGoals ?? []);
  const focusSet = new Set<string>(activeFocus);
  const goalTags = new Set<string>(profile.goals);
  if (profile.skinConcerns.length > 0) goalTags.add('skin');
  if (profile.hairConcerns.length > 0) goalTags.add('hair');
  if (latestScan) {
    latestScan.focusAreas.forEach((f) => {
      f.actions.forEach((a) => {
        if (a.protocolId) {
          const def = PROTOCOL_MAP[a.protocolId];
          def?.tags.forEach((t) => goalTags.add(t));
        }
      });
    });
  }

  const candidateIds = new Set<string>();
  const scoreMap = new Map<string, { score: number; focusLabel: string }>();

  const boost = (id: string, delta: number, focusLabel: string) => {
    candidateIds.add(id);
    const prev = scoreMap.get(id);
    scoreMap.set(id, {
      score: (prev?.score ?? 0) + delta,
      focusLabel: prev?.focusLabel ?? focusLabel,
    });
  };

  if (focusSet.has('face')) {
    boost('face-cleanse-am', 110, 'Face');
    boost('face-moisturize', 108, 'Face');
    boost('face-spf-daily', 106, 'Face');
    boost('face-cleanse-pm', 92, 'Face');
    boost('face-debloat-water', 88, 'Face');
    boost('face-tongue-posture', 72, 'Face');
    boost('face-brow-tidy', 64, 'Face');
    boost('face-weekly-photo', 60, 'Face');
  }

  if (focusSet.has('body')) {
    boost('body-10min-walk', 104, 'Body');
    boost('body-posture-reset', 98, 'Body');
    boost('body-sleep-fixed', 96, 'Body');
    boost('body-protein-check', 90, 'Body');
    boost('body-workout-day', profile.workoutDaysPerWeek >= 2 ? 95 : 75, 'Body');
    boost('body-sleep-winddown', 82, 'Body');
    boost('body-wall-angels', 74, 'Body');
    boost('body-mobility-flow', 68, 'Body');
    boost('body-neck-set', 58, 'Body');
  }

  if (focusSet.has('mind')) {
    if (mindSub.size === 0 || mindSub.has('study')) {
      boost('mind-study-block', 115, 'Mind · Study');
      boost('mind-review-notes', 94, 'Mind · Study');
      boost('mind-read-10pages', 78, 'Mind');
    }
    if (mindSub.has('programming')) {
      boost('mind-coding-lesson', 118, 'Mind · Code');
      boost('mind-code-tiny', 102, 'Mind · Code');
    }
    if (mindSub.size === 0 || mindSub.has('calm')) {
      boost('mind-breathing-3min', 98, 'Mind · Calm');
      boost('mind-phone-free', 86, 'Mind · Calm');
      boost('mind-gratitude-line', 76, 'Mind · Calm');
    }
    boost('mind-plan-tomorrow', 88, 'Mind');
  }

  if (settings?.prayerTrackingEnabled && settings?.dhikrTaskEnabled) {
    boost('mind-dhikr-quran', 109, 'Prayer');
  }

  // Confirmed "About me" personalization (strictly gated behind explicit user confirm/edit)
  const about = profile.aboutMe;
  if (isAboutMeItemConfirmed(about, 'training_camp')) {
    boost('body-workout-day', 28, 'Fight Camp');
    boost('body-sleep-fixed', 20, 'Fight Camp');
    boost('body-mobility-flow', 24, 'Fight Camp');
    boost('face-debloat-water', 16, 'Fight Camp');
  }
  if (isAboutMeItemConfirmed(about, 'eating_pattern')) {
    boost('body-protein-check', 34, 'Body');
    boost('face-debloat-water', 20, 'Face');
    boost('body-10min-walk', 14, 'Body');
  }
  if (isAboutMeItemConfirmed(about, 'location_foods')) {
    boost('body-protein-check', 10, 'Body');
    boost('face-debloat-water', 10, 'Face');
  }
  if (isAboutMeItemConfirmed(about, 'identity_focus') && about?.identityFocus) {
    const focusText = about.identityFocus.toLowerCase();
    if (focusText.includes('program') || focusText.includes('cod')) {
      boost('mind-coding-lesson', 18, 'Mind · Code');
    }
    if (focusText.includes('study')) {
      boost('mind-study-block', 18, 'Mind · Study');
    }
    if (focusText.includes('prayer') && settings?.prayerTrackingEnabled) {
      boost('mind-dhikr-quran', 12, 'Prayer');
    }
  }

  // Adapt slightly to today's active training day mode (Gym / MMA / Sparring / Rest)
  const todayMode = settings?.dayModeByDate?.[toLocalDateKey()];
  if (todayMode === 'sparring') {
    boost('body-sleep-winddown', 36, 'Recovery');
    boost('body-sleep-fixed', 20, 'Recovery');
    boost('body-mobility-flow', 28, 'Recovery');
    boost('face-debloat-water', 18, 'Hydration');
  } else if (todayMode === 'rest') {
    boost('body-10min-walk', 24, 'Recovery');
    boost('body-mobility-flow', 28, 'Recovery');
    boost('body-sleep-winddown', 38, 'Recovery');
    if (scoreMap.has('body-workout-day')) {
      const prev = scoreMap.get('body-workout-day')!;
      scoreMap.set('body-workout-day', { ...prev, score: prev.score - 45 });
    }
  }

  // Subtle Mindset Path habit ordering boost (ONLY existing CURATED_PROTOCOLS, never alters safety rules)
  if (settings?.mindsetPaths && settings.mindsetPaths.pathsEnabled !== false) {
    const mp = getMindsetPathsSettings(settings);
    const activePathIds = getActivePathIds(mp);
    if (activePathIds.length > 0) {
      const mainPath = getPathDefinitionForUser(activePathIds[0], mp);
      for (const pid of mainPath.habitProtocolIds) {
        if (PROTOCOL_MAP[pid]) {
          boost(pid, 18, mainPath.shortName);
        }
      }
    }
  }

  if (candidateIds.size === 0) {
    boost('face-cleanse-am', 100, 'Face');
    boost('face-spf-daily', 98, 'Face');
    boost('body-10min-walk', 96, 'Body');
    boost('body-posture-reset', 94, 'Body');
    boost('body-sleep-fixed', 92, 'Body');
    boost('mind-plan-tomorrow', 90, 'Mind');
  }

  const scored = Array.from(candidateIds)
    .map((id) => PROTOCOL_MAP[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const meta = scoreMap.get(p.id)!;
      let priority = meta.score;
      for (const tag of p.tags) {
        if (goalTags.has(tag)) priority += 12;
      }
      return { protocol: p, priority, focusLabel: meta.focusLabel };
    });

  scored.sort((a, b) => b.priority - a.priority);

  const seen = new Set<string>();
  const finalList: typeof scored = [];
  for (const item of scored) {
    if (seen.has(item.protocol.id)) continue;
    seen.add(item.protocol.id);
    finalList.push(item);
    if (finalList.length >= Math.min(10, targetCount)) break;
  }

  return finalList.map((item, idx) => ({
    id: `task-${item.protocol.id}`,
    protocolId: item.protocol.id,
    title: item.protocol.title,
    actionLine: item.protocol.actionLine,
    block: item.protocol.defaultBlock,
    category: item.protocol.category,
    minutes: item.protocol.minutes,
    xp: item.protocol.xp,
    steps: [...item.protocol.steps],
    evidence: item.protocol.evidence,
    why: item.protocol.why,
    safetyNote: item.protocol.safetyNote,
    isAdvancedOptional: item.protocol.isAdvancedOptional,
    exerciseSlug: item.protocol.exerciseSlug,
    watchQuery: item.protocol.watchQuery,
    isCustom: false,
    enabled: true,
    sortOrder: idx,
    sourceFocusArea: item.focusLabel,
  }));
}

export async function ensureDatabaseReady(): Promise<{
  profileExists: boolean;
  profile: UserProfile | null;
  settings: AppSettings;
}> {
  let profile = (await db.profile.get('me')) ?? null;

  if (!profile) {
    const mirror = readBootMirror();
    if (mirror?.profile && mirror.onboardingComplete) {
      const restored: UserProfile = {
        ...createDefaultProfile(),
        ...mirror.profile,
        id: 'me',
        onboardingDone: true,
        onboardingComplete: true,
      };
      await db.profile.put(restored);
      profile = (await db.profile.get('me')) ?? restored;
    }
  } else {
    if (profile.name === 'Alex' && (profile.onboardingSkipped || !profile.onboardingComplete)) {
      profile = { ...profile, name: '' };
      await db.profile.update('me', { name: '' });
    }
    if (!profile.aboutMe) {
      const seededAbout = createDefaultAboutMe(profile.weightKg);
      profile = { ...profile, aboutMe: seededAbout };
      await db.profile.update('me', { aboutMe: seededAbout });
    }
    if (profile.onboardingDone || profile.onboardingComplete || profile.onboardingSkipped) {
      writeBootMirror(profile);
    }
  }

  let settings = await db.settings.get('app');
  if (!settings) {
    settings = createDefaultSettings();
    await db.settings.put(settings);
  } else {
    const defaults = createDefaultSettings();
    const needsSync =
      settings.easyMode === undefined ||
      settings.tone === undefined ||
      settings.slangTierNames === undefined ||
      settings.includeSkinScoreInScans === undefined ||
      settings.arabicHintsEnabled === undefined ||
      settings.arabicIndicDigits === undefined ||
      settings.dismissedPatternIds === undefined ||
      settings.roughDayDates === undefined ||
      settings.dayModeByDate === undefined ||
      settings.reminders?.maxPerDay === undefined ||
      settings.lookAndFeel === undefined ||
      settings.mindsetPaths === undefined;
    if (needsSync) {
      settings = {
        ...defaults,
        ...settings,
        easyMode: settings.easyMode ?? true,
        tone: settings.tone ?? 'normal',
        slangTierNames: settings.slangTierNames ?? true,
        includeSkinScoreInScans: settings.includeSkinScoreInScans ?? true,
        arabicHintsEnabled: settings.arabicHintsEnabled ?? false,
        arabicIndicDigits: settings.arabicIndicDigits ?? false,
        dismissedPatternIds: settings.dismissedPatternIds ?? [],
        trainingWindowStart: settings.trainingWindowStart ?? '18:00',
        trainingWindowEnd: settings.trainingWindowEnd ?? '20:00',
        relaxedFridayMode: settings.relaxedFridayMode ?? false,
        roughDayDates: settings.roughDayDates ?? [],
        dayModeByDate: settings.dayModeByDate ?? {},
        tongueReminderTimes:
          settings.tongueReminderTimes && settings.tongueReminderTimes.length > 0
            ? settings.tongueReminderTimes
            : defaults.tongueReminderTimes,
        reminders: {
          ...defaults.reminders,
          ...settings.reminders,
          maxPerDay: Math.min(6, settings.reminders?.maxPerDay ?? 6),
        },
        lookAndFeel: {
          ...defaults.lookAndFeel!,
          ...(settings.lookAndFeel ?? {}),
        },
        mindsetPaths: {
          ...defaults.mindsetPaths!,
          ...(settings.mindsetPaths ?? {}),
        },
      };
      await db.settings.put(settings);
    }
  }
  setDayStartHour4am(Boolean(settings.dayStartsAt4am));

  const xp = await db.xpState.get('xp');
  if (!xp) {
    await db.xpState.put(createDefaultXpState());
  }
  const existingTasks = await db.protocolTasks.toArray();
  if (existingTasks.length === 0) {
    const initialTasks = buildPlanForProfile(profile ?? createDefaultProfile(), null, settings);
    await db.protocolTasks.bulkPut(initialTasks);
  } else {
    const patchUpdates: ActiveProtocolTask[] = [];
    for (const task of existingTasks) {
      const def = PROTOCOL_MAP[task.protocolId];
      if (!def) continue;
      if (
        task.title.includes('(optional)') ||
        task.isAdvancedOptional !== def.isAdvancedOptional ||
        task.exerciseSlug !== def.exerciseSlug ||
        task.watchQuery !== def.watchQuery
      ) {
        patchUpdates.push({
          ...task,
          title: def.title,
          isAdvancedOptional: def.isAdvancedOptional,
          exerciseSlug: def.exerciseSlug,
          watchQuery: def.watchQuery,
        });
      }
    }
    if (patchUpdates.length > 0) {
      await db.protocolTasks.bulkPut(patchUpdates);
    }
  }

  return {
    profileExists: Boolean(profile),
    profile,
    settings,
  };
}

export async function saveAndVerifyProfile(profile: UserProfile): Promise<UserProfile> {
  const payload: UserProfile = {
    ...profile,
    id: 'me',
    updatedAt: Date.now(),
  };
  await db.profile.put(payload);
  writeBootMirror(payload);
  const verified = await db.profile.get('me');
  if (!verified || (payload.onboardingComplete && !verified.onboardingComplete && !verified.onboardingDone)) {
    throw new Error('Profile verification read-back failed.');
  }
  return verified;
}

export async function regenerateProtocolFromProfile(profile: UserProfile): Promise<void> {
  const [scans, settings] = await Promise.all([
    db.scans.orderBy('timestamp').reverse().limit(1).toArray(),
    db.settings.get('app'),
  ]);
  const latestScan = scans[0] ?? null;
  const generated = buildPlanForProfile(profile, latestScan, settings ?? null);
  const preservedCustomOrTomorrow = await db.protocolTasks
    .filter((t) => Boolean(t.isCustom || t.scheduledDate))
    .toArray();
  const preservedIds = new Set(preservedCustomOrTomorrow.map((t) => t.id));
  await db.transaction('rw', db.protocolTasks, async () => {
    await db.protocolTasks.clear();
    await db.protocolTasks.bulkPut([
      ...generated.filter((g) => !preservedIds.has(g.id)),
      ...preservedCustomOrTomorrow,
    ]);
  });
}

export async function deferTaskToTomorrow(taskId: string, fromDateKey: string): Promise<string> {
  const tomorrowKey = addDays(toLocalDateKey(), 1);
  await db.protocolTasks.update(taskId, {
    deferredFromDate: fromDateKey,
    scheduledDate: tomorrowKey,
  });
  return tomorrowKey;
}

export async function prepareSuggestedTomorrowPlan(
  profile: UserProfile,
  settings?: Partial<AppSettings> | null
): Promise<number> {
  const tomorrowKey = addDays(toLocalDateKey(), 1);
  const [existingTomorrow, latestScans] = await Promise.all([
    db.protocolTasks.filter((t) => t.scheduledDate === tomorrowKey).toArray(),
    db.scans.orderBy('timestamp').reverse().limit(1).toArray(),
  ]);
  const existingProtocols = new Set(existingTomorrow.map((t) => t.protocolId));

  const suggestions = buildPlanForProfile(profile, latestScans[0] ?? null, settings).slice(0, 6);
  const newItems: ActiveProtocolTask[] = [];
  for (const s of suggestions) {
    if (existingProtocols.has(s.protocolId)) continue;
    newItems.push({
      ...s,
      id: `tmrw-${tomorrowKey}-${s.protocolId}`,
      scheduledDate: tomorrowKey,
      isCustom: false,
      enabled: true,
      sortOrder: existingTomorrow.length + newItems.length,
    });
  }
  if (newItems.length > 0) {
    await db.protocolTasks.bulkPut(newItems);
  }
  return newItems.length;
}

export async function saveHeightLog(params: {
  date: string;
  heightCm: number;
  timeOfDay: 'morning' | 'evening';
  note?: string;
}): Promise<number> {
  const safeHeight = Math.max(90, Math.min(250, Number(params.heightCm)));
  const id = await db.heightLogs.add({
    date: params.date,
    heightCm: Number(safeHeight.toFixed(1)),
    timeOfDay: params.timeOfDay,
    note: params.note?.trim() || '',
    createdAt: Date.now(),
  });
  await db.profile.update('me', {
    heightCm: Number(safeHeight.toFixed(1)),
    updatedAt: Date.now(),
  });
  return id;
}

export async function addStarterLifeList(): Promise<number> {
  const existing = await db.lifeList.count();
  if (existing > 0) return 0;
  const today = toLocalDateKey();
  const starters: Array<Omit<LifeListItem, 'id'>> = [
    {
      title: 'Measure height cleanly (wall, barefoot, morning)',
      timeframe: 'this_month',
      dueDate: addDays(today, 7),
      done: false,
      createdAt: Date.now(),
    },
    {
      title: 'Haircut trim / barber shape check',
      timeframe: 'this_month',
      dueDate: addDays(today, 21),
      done: false,
      createdAt: Date.now() + 1,
    },
    {
      title: 'Dentist hygiene checkup',
      timeframe: 'three_months',
      dueDate: addDays(today, 60),
      done: false,
      createdAt: Date.now() + 2,
    },
    {
      title: 'Skin check (or dermatologist if stubborn acne)',
      timeframe: 'three_months',
      dueDate: addDays(today, 45),
      done: false,
      createdAt: Date.now() + 3,
    },
    {
      title: 'Annual health check with a doctor (labs only if advised)',
      timeframe: 'one_year',
      dueDate: addDays(today, 180),
      done: false,
      createdAt: Date.now() + 4,
    },
  ];
  await db.lifeList.bulkAdd(starters);
  return starters.length;
}

export async function addLifeGoal(goal: {
  title: string;
  focusArea: LifeGoal['focusArea'];
  targetLabel: string;
  horizon?: GoalHorizon;
}): Promise<number> {
  return db.goals.add({
    title: goal.title.trim(),
    focusArea: goal.focusArea,
    targetLabel: goal.targetLabel.trim(),
    horizon: goal.horizon ?? 'three_months',
    progressPct: 0,
    milestones: [
      { id: `m1-${Date.now()}`, horizon: 'this_week', label: 'Start 3 consistent days', done: false },
      { id: `m2-${Date.now()}`, horizon: 'this_month', label: 'Finish first 3 weeks', done: false },
      { id: `m3-${Date.now()}`, horizon: 'three_months', label: 'Compare real photos & logs', done: false },
      { id: `m4-${Date.now()}`, horizon: 'one_year', label: 'Keep steady long-term habit', done: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function addProtocolToPlan(protocolId: string, sourceFocusArea?: string): Promise<boolean> {
  const def = PROTOCOL_MAP[protocolId];
  if (!def) return false;
  const existing = await db.protocolTasks
    .filter((t) => t.protocolId === protocolId && !t.scheduledDate)
    .first();
  if (existing) {
    await db.protocolTasks.update(existing.id, {
      enabled: true,
      sourceFocusArea: sourceFocusArea || existing.sourceFocusArea,
    });
    return true;
  }
  const count = await db.protocolTasks.count();
  await db.protocolTasks.put({
    id: `task-${def.id}`,
    protocolId: def.id,
    title: def.title,
    actionLine: def.actionLine,
    block: def.defaultBlock,
    category: def.category,
    minutes: def.minutes,
    xp: def.xp,
    steps: [...def.steps],
    evidence: def.evidence,
    why: def.why,
    safetyNote: def.safetyNote,
    isAdvancedOptional: def.isAdvancedOptional,
    exerciseSlug: def.exerciseSlug,
    watchQuery: def.watchQuery,
    isCustom: false,
    enabled: true,
    sortOrder: count,
    sourceFocusArea,
  });
  return true;
}

export async function toggleTaskCompletion(dateKey: string, task: ActiveProtocolTask): Promise<boolean> {
  const compId = `${dateKey}::${task.id}`;
  const existing = await db.taskCompletions.get(compId);
  if (existing) {
    await db.taskCompletions.delete(compId);
    await recalculateXpAndBadges();
    return false;
  } else {
    const currentXp = (await db.xpState.get('xp')) ?? createDefaultXpState();
    const mult = Math.min(1.5, 1 + currentXp.currentStreak * 0.05);
    const earned = Math.round(task.xp * mult);
    await db.taskCompletions.put({
      id: compId,
      date: dateKey,
      taskId: task.id,
      minutes: task.minutes,
      xpEarned: earned,
      completedAt: Date.now(),
    });
    await recalculateXpAndBadges();
    return true;
  }
}

export async function recalculateXpAndBadges(): Promise<XpState> {
  const [completions, tasks, scans, workouts, skinEntries, exerciseLogs, dailyLogs, mealScans, prevXp] =
    await Promise.all([
      db.taskCompletions.toArray(),
      db.protocolTasks.filter((t) => t.enabled && !t.scheduledDate).toArray(),
      db.scans.toArray(),
      db.workouts.toArray(),
      db.skinEntries.toArray(),
      db.exerciseLogs.toArray(),
      db.dailyLogs.toArray(),
      db.mealScans.toArray(),
      db.xpState.get('xp'),
    ]);

  const byDate = new Map<string, TaskCompletion[]>();
  const checkedInDates = new Set<string>();
  let totalTaskXp = 0;
  let spfCount = 0;

  for (const c of completions) {
    totalTaskXp += c.xpEarned;
    if (c.taskId.includes('spf')) spfCount++;
    const arr = byDate.get(c.date) ?? [];
    arr.push(c);
    byDate.set(c.date, arr);
    checkedInDates.add(c.date);
  }

  for (const w of workouts) checkedInDates.add(w.date);
  for (const s of skinEntries) checkedInDates.add(s.date);
  for (const ex of exerciseLogs) checkedInDates.add(ex.date);
  for (const m of mealScans) checkedInDates.add(m.date);
  for (const dl of dailyLogs) {
    if (
      dl.waterMl > 0 ||
      dl.calories > 0 ||
      dl.sleepHours > 0 ||
      dl.mood > 0 ||
      dl.energy > 0 ||
      dl.minimumsDone ||
      dl.eventMode?.active ||
      dl.eventMode?.outcome ||
      dl.dayStatus === 'complete' ||
      dl.dayStatus === 'partial' ||
      dl.dayStatus === 'estimated'
    ) {
      checkedInDates.add(dl.date);
    }
  }

  const totalExerciseXp = exerciseLogs.reduce((sum, e) => sum + (e.xpEarned || 0), 0);

  const enabledCount = Math.max(1, tasks.length);
  let consistencyDayBonus = 0;
  const completeDates = new Set<string>();
  byDate.forEach((list, dt) => {
    if (isDayCompleteForStreak(list.length, enabledCount)) {
      completeDates.add(dt);
      consistencyDayBonus += 25;
    }
  });

  const today = toLocalDateKey();
  const currentWeek = getIsoWeekKey(today);
  let freezesRemaining = prevXp?.lastFreezeWeek === currentWeek ? prevXp.streakFreezesRemaining : 1;

  // Streak counts "checked in" (any tap: a task, a log, an event chip, Day done),
  // so missing/skipping food logging NEVER breaks the user's app streak.
  let streak = 0;
  let cursor = checkedInDates.has(today) ? today : addDays(today, -1);
  let usedFreeze = false;

  for (let i = 0; i < 365; i++) {
    if (checkedInDates.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else if (!usedFreeze && freezesRemaining > 0 && streak > 0) {
      usedFreeze = true;
      freezesRemaining = Math.max(0, freezesRemaining - 1);
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  const longestStreak = Math.max(prevXp?.longestStreak ?? 0, streak);
  const totalXp = totalTaskXp + totalExerciseXp + consistencyDayBonus;

  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }

  const prevMap = new Map((prevXp?.unlockedBadges ?? []).map((b) => [b.id, b]));
  const checks: Record<string, boolean> = {
    'first-log': completions.length > 0 || workouts.length > 0 || skinEntries.length > 0,
    'streak-3': longestStreak >= 3,
    'streak-7': longestStreak >= 7,
    'streak-30': longestStreak >= 30,
    'first-scan': scans.length >= 1,
    'rescan-3': scans.length >= 3,
    'spf-14': spfCount >= 14,
    'spf-56': spfCount >= 56,
    'workout-10': workouts.length >= 10,
    'workout-30': workouts.length >= 30,
    'skin-diary-7': skinEntries.length >= 7,
    'level-5': level >= 5,
  };

  const now = Date.now();
  const unlockedBadges: UnlockedBadge[] = [];
  for (const def of BADGE_DEFINITIONS) {
    if (checks[def.id]) {
      unlockedBadges.push(prevMap.get(def.id) ?? { id: def.id, unlockedAt: now });
    } else if (prevMap.has(def.id)) {
      unlockedBadges.push(prevMap.get(def.id)!);
    }
  }

  const nextState: XpState = {
    id: 'xp',
    totalXp,
    level,
    currentStreak: streak,
    longestStreak,
    streakFreezesRemaining: freezesRemaining,
    lastFreezeWeek: currentWeek,
    unlockedBadges,
  };

  await db.xpState.put(nextState);
  return nextState;
}

export async function getOrCreateDailyLog(dateKey: string): Promise<DailyLog> {
  const existing = await db.dailyLogs.get(dateKey);
  if (existing) return existing;
  const fresh: DailyLog = {
    date: dateKey,
    waterMl: 0,
    proteinG: 0,
    calories: 0,
    sleepHours: 0,
    sleepQuality: 0,
    bedtime: '',
    wakeTime: '',
    mood: 0,
    energy: 0,
    steps: 0,
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
    updatedAt: Date.now(),
  };
  await db.dailyLogs.put(fresh);
  return fresh;
}

async function syncDailyNutritionAndStatus(dateKey: string): Promise<void> {
  const [dayMeals, log, settings] = await Promise.all([
    db.mealScans.where('date').equals(dateKey).toArray(),
    getOrCreateDailyLog(dateKey),
    db.settings.get('app'),
  ]);
  const totalCalories = Math.max(0, Math.round(dayMeals.reduce((s, m) => s + (m.totalCalories || 0), 0)));
  const totalProteinG = Math.max(0, Math.round(dayMeals.reduce((s, m) => s + (m.totalProteinG || 0), 0)));
  const nextStatus = classifyDayTrackingStatus({
    dateKey,
    dailyLog: { ...log, calories: totalCalories, proteinG: totalProteinG },
    meals: dayMeals,
    settings,
  }).status;
  await db.dailyLogs.update(dateKey, {
    calories: totalCalories,
    proteinG: totalProteinG,
    dayStatus: nextStatus,
    updatedAt: Date.now(),
  });
}

export async function saveMealScanEntry(entry: Omit<MealScanEntry, 'id'>): Promise<number> {
  const id = await db.mealScans.add(entry);
  await syncDailyNutritionAndStatus(entry.date);
  await recalculateXpAndBadges();
  return id;
}

export async function updateMealScanEntry(updated: MealScanEntry): Promise<void> {
  if (!updated.id) return;
  await db.mealScans.put(updated);
  await syncDailyNutritionAndStatus(updated.date);
}

export async function deleteMealScanEntry(entry: MealScanEntry): Promise<void> {
  if (!entry.id) return;
  await db.mealScans.delete(entry.id);
  await syncDailyNutritionAndStatus(entry.date);
  await recalculateXpAndBadges();
}

export async function repeatYesterdaysMeals(todayKey: string): Promise<number> {
  const yesterdayKey = addDays(todayKey, -1);
  const yesterdays = await db.mealScans.where('date').equals(yesterdayKey).toArray();
  if (yesterdays.length === 0) return 0;

  const now = Date.now();
  let addedCal = 0;
  let addedPro = 0;

  for (let i = 0; i < yesterdays.length; i++) {
    const src = yesterdays[i];
    const clonedItems = src.items.map((it, idx) => ({
      ...it,
      id: `repeat-${now}-${i}-${idx}`,
    }));
    await db.mealScans.add({
      ...src,
      id: undefined,
      date: todayKey,
      timestamp: now + i,
      items: clonedItems,
    });
    addedCal += src.totalCalories;
    addedPro += src.totalProteinG;
  }

  const log = await getOrCreateDailyLog(todayKey);
  await db.dailyLogs.update(todayKey, {
    calories: Math.max(0, Math.round((log.calories || 0) + addedCal)),
    proteinG: Math.max(0, Math.round((log.proteinG || 0) + addedPro)),
    updatedAt: Date.now(),
  });
  return yesterdays.length;
}

export async function getMostCommonMealForSlot(slot: MealScanEntry['mealType']): Promise<MealScanEntry | null> {
  const all = await db.mealScans.toArray();
  const candidates = all.filter((m) => (m.mealType ?? 'lunch') === (slot ?? 'lunch'));
  const pool = candidates.length > 0 ? candidates : all;
  if (pool.length === 0) return null;

  const counts = new Map<string, { count: number; latest: MealScanEntry }>();
  for (const entry of pool) {
    const key = entry.mealTitle.trim().toLowerCase();
    const prev = counts.get(key);
    if (!prev) {
      counts.set(key, { count: 1, latest: entry });
    } else {
      counts.set(key, {
        count: prev.count + 1,
        latest: entry.timestamp >= prev.latest.timestamp ? entry : prev.latest,
      });
    }
  }

  let best: { count: number; latest: MealScanEntry } | null = null;
  for (const val of counts.values()) {
    if (!best || val.count > best.count || (val.count === best.count && val.latest.timestamp > best.latest.timestamp)) {
      best = val;
    }
  }
  return best?.latest ?? null;
}

export async function logSameAsUsualMeal(
  todayKey: string,
  slot: MealScanEntry['mealType']
): Promise<MealScanEntry | null> {
  const template = await getMostCommonMealForSlot(slot);
  if (!template) return null;
  const now = Date.now();
  const clonedItems = template.items.map((it, idx) => ({
    ...it,
    id: `usual-${now}-${idx}`,
  }));
  const newEntry: Omit<MealScanEntry, 'id'> = {
    ...template,
    date: todayKey,
    timestamp: now,
    mealType: slot ?? template.mealType ?? 'lunch',
    items: clonedItems,
  };
  const id = await saveMealScanEntry(newEntry);
  return { ...newEntry, id };
}

export async function startEventModeForDay(dateKey: string, eventType: EventType): Promise<DailyLog> {
  const log = await getOrCreateDailyLog(dateKey);
  const nextEventMode = {
    active: true,
    type: eventType,
    startedAt: log.eventMode?.startedAt ?? Date.now(),
    reminderQuietUntilMidnight: true,
    outcome: log.eventMode?.outcome,
    platesCount: log.eventMode?.platesCount,
    hadDessert: log.eventMode?.hadDessert,
  };
  await db.dailyLogs.update(dateKey, {
    eventMode: nextEventMode,
    dayStatus: 'estimated',
    updatedAt: Date.now(),
  });
  await recalculateXpAndBadges();
  return { ...log, eventMode: nextEventMode, dayStatus: 'estimated' };
}

export async function endEventModeForDay(dateKey: string): Promise<void> {
  const log = await getOrCreateDailyLog(dateKey);
  if (!log.eventMode) return;
  await db.dailyLogs.update(dateKey, {
    eventMode: {
      ...log.eventMode,
      active: false,
      endedAt: Date.now(),
      reminderQuietUntilMidnight: false,
    },
    updatedAt: Date.now(),
  });
}

export async function saveEventOutcomeLog(params: {
  dateKey: string;
  eventType: EventType;
  outcome: EventOutcomeLevel;
  platesCount?: number;
  hadDessert?: boolean;
  mealType?: MealScanEntry['mealType'];
}): Promise<number> {
  const meta = getEventTypeMeta(params.eventType);
  const log = await getOrCreateDailyLog(params.dateKey);
  const draft = buildEventOutcomeDraftMeal({
    dateKey: params.dateKey,
    eventTypeLabel: meta.label,
    outcome: params.outcome,
    platesCount: params.platesCount,
    hadDessert: params.hadDessert,
    mealType: params.mealType ?? 'dinner',
  });
  const id = await saveMealScanEntry(draft);
  await db.dailyLogs.update(params.dateKey, {
    eventMode: {
      active: true,
      type: params.eventType,
      startedAt: log.eventMode?.startedAt ?? Date.now(),
      reminderQuietUntilMidnight: true,
      outcome: params.outcome,
      platesCount: params.platesCount,
      hadDessert: params.hadDessert,
    },
    dayStatus: 'estimated',
    updatedAt: Date.now(),
  });
  await recalculateXpAndBadges();
  return id;
}

export async function saveSkippedGapDay(dateKey: string): Promise<void> {
  const settings = (await db.settings.get('app')) ?? createDefaultSettings();
  const prevSkipped = settings.skippedGapCheckinDates ?? [];
  if (!prevSkipped.includes(dateKey)) {
    await db.settings.update('app', {
      skippedGapCheckinDates: [...prevSkipped.slice(-60), dateKey],
    });
  }
  const log = await getOrCreateDailyLog(dateKey);
  await db.dailyLogs.update(dateKey, {
    dayStatus: log.calories > 0 ? log.dayStatus ?? 'partial' : 'not_tracked',
    updatedAt: Date.now(),
  });
}

export async function saveOneQuestionDayOutcome(
  dateKey: string,
  outcome: EventOutcomeLevel
): Promise<number> {
  const settings = (await db.settings.get('app')) ?? createDefaultSettings();
  const asked = { ...(settings.dailyCheckinAskedDates ?? {}), [dateKey]: outcome };
  await db.settings.update('app', { dailyCheckinAskedDates: asked });
  const draft = buildOneQuestionDayEstimate({ dateKey, level: outcome });
  const id = await saveMealScanEntry(draft);
  await db.dailyLogs.update(dateKey, {
    dayStatus: 'estimated',
    updatedAt: Date.now(),
  });
  await recalculateXpAndBadges();
  return id;
}

export async function saveMealTemplate(template: SavedMealTemplate): Promise<SavedMealTemplate[]> {
  const settings = (await db.settings.get('app')) ?? createDefaultSettings();
  const prev = settings.mealTemplates ?? [];
  const filtered = prev.filter((t) => t.id !== template.id);
  const next = [template, ...filtered].slice(0, 30);
  await db.settings.update('app', { mealTemplates: next });
  return next;
}

export async function deleteMealTemplate(templateId: string): Promise<SavedMealTemplate[]> {
  const settings = (await db.settings.get('app')) ?? createDefaultSettings();
  const next = (settings.mealTemplates ?? []).filter((t) => t.id !== templateId);
  await db.settings.update('app', { mealTemplates: next });
  return next;
}

export async function ensureMorningAutoPlan(
  profile: UserProfile,
  settings: AppSettings
): Promise<boolean> {
  const todayKey = toLocalDateKey();
  if (settings.lastAutoPlanDate === todayKey) return false;

  const yesterdayKey = addDays(todayKey, -1);
  const [yesterdayLog, yesterdayCompletions, existingTasks, latestScans] = await Promise.all([
    db.dailyLogs.get(yesterdayKey),
    db.taskCompletions.where('date').equals(yesterdayKey).toArray(),
    db.protocolTasks.toArray(),
    db.scans.orderBy('timestamp').reverse().limit(1).toArray(),
  ]);

  const completedCount = yesterdayCompletions.length;
  const scheduledYesterday = existingTasks.filter((t) => t.scheduledDate === yesterdayKey);
  const tomorrowCarry = existingTasks.filter((t) => t.scheduledDate === todayKey);

  // Build updated Starter 6 suggestion when no custom-only overhaul blocks it
  const built = buildPlanForProfile(profile, latestScans[0] ?? null, settings);
  const carryIds = new Set(tomorrowCarry.map((t) => t.protocolId));
  const customTasks = existingTasks.filter((t) => t.isCustom && !t.scheduledDate);

  const lowSleep = Boolean(yesterdayLog && yesterdayLog.sleepHours > 0 && yesterdayLog.sleepHours < 6.5);
  const updates: ActiveProtocolTask[] = [];

  for (const t of tomorrowCarry) {
    updates.push({
      ...t,
      scheduledDate: undefined,
      enabled: true,
    });
  }

  for (const b of built) {
    if (carryIds.has(b.protocolId)) continue;
    const prevMatch = existingTasks.find((e) => e.protocolId === b.protocolId && !e.scheduledDate);
    if (prevMatch) {
      updates.push({
        ...prevMatch,
        enabled: completedCount === 0 && lowSleep ? prevMatch.sortOrder < 5 : prevMatch.enabled,
      });
    } else if (existingTasks.filter((e) => !e.scheduledDate && e.enabled).length === 0) {
      updates.push(b);
    }
  }

  // Keep already-enabled starter or user-added tasks intact
  for (const e of existingTasks) {
    if (!e.scheduledDate && !updates.some((u) => u.id === e.id) && !scheduledYesterday.some((s) => s.id === e.id)) {
      updates.push(e);
    }
  }

  await db.transaction('rw', [db.protocolTasks, db.settings], async () => {
    for (const c of customTasks) {
      if (!updates.some((u) => u.id === c.id)) updates.push(c);
    }
    if (updates.length > 0) {
      await db.protocolTasks.bulkPut(updates);
    }
    await db.settings.update('app', { lastAutoPlanDate: todayKey });
  });

  return true;
}

export async function toggleGrowthCheckoff(
  dateKey: string,
  habitId: string,
  xpReward = 15
): Promise<boolean> {
  const id = `${dateKey}::${habitId}`;
  const existing = await db.growthCheckoffs.get(id);
  if (existing) {
    await db.growthCheckoffs.delete(id);
    return false;
  }
  await db.growthCheckoffs.put({
    id,
    date: dateKey,
    habitId,
    xpEarned: xpReward,
    completedAt: Date.now(),
  });
  return true;
}

export async function toggleGrowthProgramDay(
  programId: GrowthProgramProgress['id'],
  dayNumber: number
): Promise<number[]> {
  const existing = await db.growthPrograms.get(programId);
  const current = existing?.completedDays ?? [];
  const next = current.includes(dayNumber)
    ? current.filter((d) => d !== dayNumber)
    : [...current, dayNumber].sort((a, b) => a - b);
  await db.growthPrograms.put({
    id: programId,
    completedDays: next,
    updatedAt: Date.now(),
  });
  return next;
}

export interface BackupPreview {
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  totalRecords: number;
  includesQuitHabits: boolean;
}

export function previewBackupJson(jsonString: string): BackupPreview {
  const parsed = JSON.parse(jsonString);
  if (!parsed?.ascendBackup || !parsed?.data || typeof parsed.data !== 'object') {
    throw new Error('This file does not look like an ASCEND backup.');
  }
  const d = parsed.data as Record<string, unknown>;
  const counts: Record<string, number> = {};
  let totalRecords = 0;
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) {
      counts[k] = v.length;
      totalRecords += v.length;
    }
  }
  return {
    version: Number(parsed.version) || 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : 'Unknown',
    counts,
    totalRecords,
    includesQuitHabits: (counts.quitItems ?? 0) > 0,
  };
}

export async function getStorageUsageEstimate(): Promise<{
  usageBytes: number | null;
  quotaBytes: number | null;
  usageMbLabel: string;
}> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usageBytes = est.usage ?? null;
      const quotaBytes = est.quota ?? null;
      const usageMbLabel =
        usageBytes !== null ? `${(usageBytes / (1024 * 1024)).toFixed(2)} MB` : 'Unknown';
      return { usageBytes, quotaBytes, usageMbLabel };
    }
  } catch {
    // ignore
  }
  return { usageBytes: null, quotaBytes: null, usageMbLabel: 'Unavailable' };
}

export async function exportAllDataJson(includeQuitHabits = true): Promise<string> {
  const today = toLocalDateKey();
  await db.settings.update('app', { lastBackupDate: today }).catch(() => {});

  const payload = {
    ascendBackup: true,
    version: 3,
    exportedAt: new Date().toISOString(),
    data: {
      profile: await db.profile.toArray(),
      settings: await db.settings.toArray(),
      protocolTasks: await db.protocolTasks.toArray(),
      taskCompletions: await db.taskCompletions.toArray(),
      dailyLogs: await db.dailyLogs.toArray(),
      bodyMetrics: await db.bodyMetrics.toArray(),
      skinEntries: await db.skinEntries.toArray(),
      products: await db.products.toArray(),
      hairPreferences: await db.hairPreferences.toArray(),
      wardrobeItems: await db.wardrobeItems.toArray(),
      outfits: await db.outfits.toArray(),
      workouts: await db.workouts.toArray(),
      scans: await db.scans.toArray(),
      xpState: await db.xpState.toArray(),
      mealScans: await db.mealScans.toArray(),
      puffinessLogs: await db.puffinessLogs.toArray(),
      goals: await db.goals.toArray(),
      lifeList: await db.lifeList.toArray(),
      heightLogs: await db.heightLogs.toArray(),
      quitItems: includeQuitHabits ? await db.quitItems.toArray() : [],
      quitSlips: includeQuitHabits ? await db.quitSlips.toArray() : [],
      exerciseLogs: await db.exerciseLogs.toArray(),
      growthCheckoffs: await db.growthCheckoffs.toArray(),
      growthPrograms: await db.growthPrograms.toArray(),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export async function importAllDataJson(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString);
  if (!parsed?.ascendBackup || !parsed?.data) {
    throw new Error('This file does not look like an ASCEND backup.');
  }
  const d = parsed.data;
  await db.transaction(
    'rw',
    [
      db.profile,
      db.settings,
      db.protocolTasks,
      db.taskCompletions,
      db.dailyLogs,
      db.bodyMetrics,
      db.skinEntries,
      db.products,
      db.hairPreferences,
      db.wardrobeItems,
      db.outfits,
      db.workouts,
      db.scans,
      db.xpState,
      db.mealScans,
      db.puffinessLogs,
      db.goals,
      db.lifeList,
      db.heightLogs,
      db.quitItems,
      db.quitSlips,
      db.exerciseLogs,
      db.growthCheckoffs,
      db.growthPrograms,
    ],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.settings.clear(),
        db.protocolTasks.clear(),
        db.taskCompletions.clear(),
        db.dailyLogs.clear(),
        db.bodyMetrics.clear(),
        db.skinEntries.clear(),
        db.products.clear(),
        db.hairPreferences.clear(),
        db.wardrobeItems.clear(),
        db.outfits.clear(),
        db.workouts.clear(),
        db.scans.clear(),
        db.xpState.clear(),
        db.mealScans.clear(),
        db.puffinessLogs.clear(),
        db.goals.clear(),
        db.lifeList.clear(),
        db.heightLogs.clear(),
        db.quitItems.clear(),
        db.quitSlips.clear(),
        db.exerciseLogs.clear(),
        db.growthCheckoffs.clear(),
        db.growthPrograms.clear(),
      ]);

      if (Array.isArray(d.profile) && d.profile.length) await db.profile.bulkPut(d.profile);
      if (Array.isArray(d.settings) && d.settings.length) await db.settings.bulkPut(d.settings);
      if (Array.isArray(d.protocolTasks) && d.protocolTasks.length) await db.protocolTasks.bulkPut(d.protocolTasks);
      if (Array.isArray(d.taskCompletions) && d.taskCompletions.length) await db.taskCompletions.bulkPut(d.taskCompletions);
      if (Array.isArray(d.dailyLogs) && d.dailyLogs.length) await db.dailyLogs.bulkPut(d.dailyLogs);
      if (Array.isArray(d.bodyMetrics) && d.bodyMetrics.length) await db.bodyMetrics.bulkPut(d.bodyMetrics);
      if (Array.isArray(d.skinEntries) && d.skinEntries.length) await db.skinEntries.bulkPut(d.skinEntries);
      if (Array.isArray(d.products) && d.products.length) await db.products.bulkPut(d.products);
      if (Array.isArray(d.hairPreferences) && d.hairPreferences.length) await db.hairPreferences.bulkPut(d.hairPreferences);
      if (Array.isArray(d.wardrobeItems) && d.wardrobeItems.length) await db.wardrobeItems.bulkPut(d.wardrobeItems);
      if (Array.isArray(d.outfits) && d.outfits.length) await db.outfits.bulkPut(d.outfits);
      if (Array.isArray(d.workouts) && d.workouts.length) await db.workouts.bulkPut(d.workouts);
      if (Array.isArray(d.scans) && d.scans.length) await db.scans.bulkPut(d.scans);
      if (Array.isArray(d.xpState) && d.xpState.length) await db.xpState.bulkPut(d.xpState);
      if (Array.isArray(d.mealScans) && d.mealScans.length) await db.mealScans.bulkPut(d.mealScans);
      if (Array.isArray(d.puffinessLogs) && d.puffinessLogs.length) await db.puffinessLogs.bulkPut(d.puffinessLogs);
      if (Array.isArray(d.goals) && d.goals.length) await db.goals.bulkPut(d.goals);
      if (Array.isArray(d.lifeList) && d.lifeList.length) await db.lifeList.bulkPut(d.lifeList);
      if (Array.isArray(d.heightLogs) && d.heightLogs.length) await db.heightLogs.bulkPut(d.heightLogs);
      if (Array.isArray(d.quitItems) && d.quitItems.length) await db.quitItems.bulkPut(d.quitItems);
      if (Array.isArray(d.quitSlips) && d.quitSlips.length) await db.quitSlips.bulkPut(d.quitSlips);
      if (Array.isArray(d.exerciseLogs) && d.exerciseLogs.length) await db.exerciseLogs.bulkPut(d.exerciseLogs);
      if (Array.isArray(d.growthCheckoffs) && d.growthCheckoffs.length) await db.growthCheckoffs.bulkPut(d.growthCheckoffs);
      if (Array.isArray(d.growthPrograms) && d.growthPrograms.length) await db.growthPrograms.bulkPut(d.growthPrograms);
    }
  );
  await ensureDatabaseReady();
  await recalculateXpAndBadges();
}

export async function wipeAllData(): Promise<void> {
  clearBootMirror();
  await Promise.all([
    db.profile.clear(),
    db.settings.clear(),
    db.protocolTasks.clear(),
    db.taskCompletions.clear(),
    db.dailyLogs.clear(),
    db.bodyMetrics.clear(),
    db.skinEntries.clear(),
    db.products.clear(),
    db.hairPreferences.clear(),
    db.wardrobeItems.clear(),
    db.outfits.clear(),
    db.workouts.clear(),
    db.scans.clear(),
    db.xpState.clear(),
    db.mealScans.clear(),
    db.puffinessLogs.clear(),
    db.goals.clear(),
    db.lifeList.clear(),
    db.heightLogs.clear(),
    db.quitItems.clear(),
    db.quitSlips.clear(),
    db.exerciseLogs.clear(),
    db.growthCheckoffs.clear(),
    db.growthPrograms.clear(),
  ]);
  await ensureDatabaseReady();
}

export type StorageCategoryKey =
  | 'about_me'
  | 'daily_logs'
  | 'meals'
  | 'body_height'
  | 'face_scans'
  | 'looks_care'
  | 'workouts'
  | 'quit_habits'
  | 'goals_life';

export interface StorageCategorySummary {
  key: StorageCategoryKey;
  label: string;
  detail: string;
  count: number;
  approxBytes: number;
}

function estimateJsonBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(value).length;
  }
}

export async function getStorageCategoryBreakdown(): Promise<StorageCategorySummary[]> {
  const [
    profile,
    dailyLogs,
    completions,
    mealScans,
    bodyMetrics,
    heightLogs,
    scans,
    skinEntries,
    products,
    hairPrefs,
    wardrobe,
    outfits,
    workouts,
    exerciseLogs,
    quitItems,
    quitSlips,
    goals,
    lifeList,
  ] = await Promise.all([
    db.profile.get('me'),
    db.dailyLogs.toArray(),
    db.taskCompletions.toArray(),
    db.mealScans.toArray(),
    db.bodyMetrics.toArray(),
    db.heightLogs.toArray(),
    db.scans.toArray(),
    db.skinEntries.toArray(),
    db.products.toArray(),
    db.hairPreferences.toArray(),
    db.wardrobeItems.toArray(),
    db.outfits.toArray(),
    db.workouts.toArray(),
    db.exerciseLogs.toArray(),
    db.quitItems.toArray(),
    db.quitSlips.toArray(),
    db.goals.toArray(),
    db.lifeList.toArray(),
  ]);

  const aboutConfirmed = profile?.aboutMe
    ? Object.values(profile.aboutMe.statuses ?? {}).filter((s) => s === 'confirmed' || s === 'edited')
        .length
    : 0;

  return [
    {
      key: 'about_me',
      label: 'Profile & About me',
      detail: `${aboutConfirmed} confirmed personal facts · Age, targets & focus`,
      count: profile?.aboutMe ? 5 - (profile.aboutMe.deletedKeys?.length ?? 0) : 0,
      approxBytes: estimateJsonBytes(profile ?? {}),
    },
    {
      key: 'daily_logs',
      label: 'Daily check-ins & task ticks',
      detail: `${dailyLogs.length} day logs · ${completions.length} completed tasks`,
      count: dailyLogs.length + completions.length,
      approxBytes: estimateJsonBytes({ dailyLogs, completions }),
    },
    {
      key: 'meals',
      label: 'Meals & food scans',
      detail: `${mealScans.length} saved meals & local thumbnails`,
      count: mealScans.length,
      approxBytes: estimateJsonBytes(mealScans),
    },
    {
      key: 'body_height',
      label: 'Weight, measurements & height',
      detail: `${bodyMetrics.length} weight checks · ${heightLogs.length} height logs`,
      count: bodyMetrics.length + heightLogs.length,
      approxBytes: estimateJsonBytes({ bodyMetrics, heightLogs }),
    },
    {
      key: 'face_scans',
      label: 'PSL LAB face scans',
      detail: `${scans.length} saved scans (stays 100% on-device)`,
      count: scans.length,
      approxBytes: estimateJsonBytes(scans),
    },
    {
      key: 'looks_care',
      label: 'Skin, hair & wardrobe',
      detail: `${skinEntries.length} skin logs · ${products.length} products · ${wardrobe.length} wardrobe items`,
      count: skinEntries.length + products.length + hairPrefs.length + wardrobe.length + outfits.length,
      approxBytes: estimateJsonBytes({ skinEntries, products, hairPrefs, wardrobe, outfits }),
    },
    {
      key: 'workouts',
      label: 'Workouts & face exercises',
      detail: `${workouts.length} training sessions · ${exerciseLogs.length} exercise runs`,
      count: workouts.length + exerciseLogs.length,
      approxBytes: estimateJsonBytes({ workouts, exerciseLogs }),
    },
    {
      key: 'quit_habits',
      label: 'Quit habits (private)',
      detail: `${quitItems.length} habits · ${quitSlips.length} private slip notes (never sent online)`,
      count: quitItems.length + quitSlips.length,
      approxBytes: estimateJsonBytes({ quitItems, quitSlips }),
    },
    {
      key: 'goals_life',
      label: 'Goals & life list',
      detail: `${goals.length} main goals · ${lifeList.length} checklist items`,
      count: goals.length + lifeList.length,
      approxBytes: estimateJsonBytes({ goals, lifeList }),
    },
  ];
}

export async function deleteStorageCategory(key: StorageCategoryKey): Promise<void> {
  switch (key) {
    case 'about_me': {
      const existing = await db.profile.get('me');
      if (existing) {
        await db.profile.update('me', {
          aboutMe: {
            countryRegion: '',
            localFoods: [],
            trainingDisciplines: [],
            tournamentUpcoming: false,
            tournamentDate: null,
            weightClassKg: null,
            currentWeightKg: null,
            targetWeightKg: null,
            eatingPattern: '',
            identityFocus: '',
            supportStyle: '',
            statuses: {},
            deletedKeys: [
              'location_foods',
              'training_camp',
              'eating_pattern',
              'identity_focus',
              'support_style',
            ],
            updatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        });
      }
      break;
    }
    case 'daily_logs':
      await Promise.all([db.dailyLogs.clear(), db.taskCompletions.clear()]);
      await recalculateXpAndBadges();
      break;
    case 'meals':
      await db.mealScans.clear();
      break;
    case 'body_height':
      await Promise.all([db.bodyMetrics.clear(), db.heightLogs.clear()]);
      break;
    case 'face_scans':
      await Promise.all([db.scans.clear(), db.puffinessLogs.clear()]);
      break;
    case 'looks_care':
      await Promise.all([
        db.skinEntries.clear(),
        db.products.clear(),
        db.hairPreferences.clear(),
        db.wardrobeItems.clear(),
        db.outfits.clear(),
      ]);
      break;
    case 'workouts':
      await Promise.all([db.workouts.clear(), db.exerciseLogs.clear(), db.growthCheckoffs.clear()]);
      break;
    case 'quit_habits':
      await Promise.all([db.quitItems.clear(), db.quitSlips.clear()]);
      break;
    case 'goals_life':
      await Promise.all([db.goals.clear(), db.lifeList.clear()]);
      break;
  }
}

