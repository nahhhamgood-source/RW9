import Dexie, { type Table } from 'dexie';
import { CURATED_PROTOCOLS, PROTOCOL_MAP } from '../data/protocols';
import { BADGE_DEFINITIONS, xpRequiredForLevel } from '../data/badges';
import { addDays, getIsoWeekKey, toLocalDateKey } from '../lib/date';
import { calculateMifflinStJeor } from '../lib/fitness';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  HairPreference,
  MealScanEntry,
  OutfitRecord,
  OwnedProduct,
  SkinEntry,
  TaskCompletion,
  UnlockedBadge,
  UserProfile,
  WardrobeItem,
  WorkoutSession,
  XpState,
} from '../types';

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
  }
}

export const db = new AscendDB();

export function createDefaultProfile(): UserProfile {
  const calc = calculateMifflinStJeor({
    sex: 'male',
    weightKg: 74,
    heightCm: 178,
    age: 24,
    activityLevel: 'moderate',
    goalMode: 'maintain',
  });
  return {
    id: 'me',
    name: 'Alex',
    age: 24,
    sex: 'male',
    heightCm: 178,
    weightKg: 74,
    waistCm: null,
    neckCm: null,
    skinType: 'combination',
    skinConcerns: ['oiliness'],
    hairType: 'wavy',
    hairConcerns: [],
    gymLevel: 'beginner',
    workoutDaysPerWeek: 3,
    equipment: 'full_gym',
    targetSleepHours: 8,
    sunExposure: 'moderate',
    goals: ['skin', 'consistency', 'body_fat'],
    dailyTimeBudgetMin: 30,
    activityLevel: 'moderate',
    calorieGoal: calc.recommendedCalories,
    proteinTargetG: calc.proteinGrams,
    waterTargetMl: calc.waterMl,
    stepTarget: 10000,
    detectedFaceShape: null,
    onboardingDone: false,
    onboardingSkipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    id: 'app',
    theme: 'dark',
    accent: 'mint',
    units: 'metric',
    saveThumbnails: true,
    pinHash: null,
    reminders: {
      enabled: true,
      morning: '08:00',
      spf: '12:30',
      workout: '17:30',
      sleep: '22:15',
      rescanDays: 14,
    },
    lastWeeklyReviewDate: null,
    autoPedometer: false,
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

export function buildPlanForProfile(
  profile: UserProfile,
  latestScan?: FaceScanResult | null
): ActiveProtocolTask[] {
  const budget = profile.dailyTimeBudgetMin;
  const targetCount = budget === 15 ? 6 : budget === 30 ? 8 : budget === 60 ? 10 : 12;

  const focusTags = new Set<string>(profile.goals);
  if (profile.skinConcerns.length > 0) focusTags.add('skin');
  if (profile.hairConcerns.length > 0) focusTags.add('hair');
  if (latestScan) {
    latestScan.focusAreas.forEach((f) => {
      f.actions.forEach((a) => {
        if (a.protocolId) {
          const def = PROTOCOL_MAP[a.protocolId];
          def?.tags.forEach((t) => focusTags.add(t));
        }
      });
    });
  }

  // Always include foundational daily tasks (gentle skin basics + sleep + water + posture + hygiene)
  const coreIds = [
    'skin-gentle-cleanse',
    'skin-moisturizer-lock',
    'skin-spf-daily',
    'hydration-water-target',
    'sleep-fixed-anchor',
    'hair-hygiene-standard',
  ];

  const scored = CURATED_PROTOCOLS.filter((p) => !p.isAdvancedOptional).map((p) => {
    let priority = coreIds.includes(p.id) ? 100 : 10;
    for (const tag of p.tags) {
      if (focusTags.has(tag)) priority += 18;
    }
    if (p.category === 'training' && profile.workoutDaysPerWeek >= 2) priority += 15;
    if (p.category === 'posture') priority += 12;
    if (p.id === 'hydration-protein-anchor' && profile.goals.includes('body_fat')) priority += 20;
    return { protocol: p, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);

  const selected = scored.slice(0, targetCount).map((item, idx) => ({
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
    isCustom: false,
    enabled: true,
    sortOrder: idx,
  }));

  return selected;
}

export async function ensureDatabaseReady(): Promise<void> {
  let profile = await db.profile.get('me');
  if (!profile) {
    profile = createDefaultProfile();
    await db.profile.put(profile);
  }
  const settings = await db.settings.get('app');
  if (!settings) {
    await db.settings.put(createDefaultSettings());
  }
  const xp = await db.xpState.get('xp');
  if (!xp) {
    await db.xpState.put(createDefaultXpState());
  }
  const existingTasks = await db.protocolTasks.count();
  if (existingTasks === 0) {
    const initialTasks = buildPlanForProfile(profile, null);
    await db.protocolTasks.bulkPut(initialTasks);
  }
}

export async function regenerateProtocolFromProfile(profile: UserProfile): Promise<void> {
  const scans = await db.scans.orderBy('timestamp').reverse().limit(1).toArray();
  const latestScan = scans[0] ?? null;
  const generated = buildPlanForProfile(profile, latestScan);
  const customTasks = await db.protocolTasks.filter((t) => t.isCustom).toArray();
  await db.transaction('rw', db.protocolTasks, async () => {
    await db.protocolTasks.clear();
    await db.protocolTasks.bulkPut([...generated, ...customTasks]);
  });
}

export async function addProtocolToPlan(protocolId: string, sourceFocusArea?: string): Promise<boolean> {
  const def = PROTOCOL_MAP[protocolId];
  if (!def) return false;
  const existing = await db.protocolTasks.filter((t) => t.protocolId === protocolId).first();
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
  const [completions, tasks, scans, workouts, skinEntries, prevXp] = await Promise.all([
    db.taskCompletions.toArray(),
    db.protocolTasks.filter((t) => t.enabled).toArray(),
    db.scans.toArray(),
    db.workouts.toArray(),
    db.skinEntries.toArray(),
    db.xpState.get('xp'),
  ]);

  const byDate = new Map<string, TaskCompletion[]>();
  let totalTaskXp = 0;
  let spfCount = 0;

  for (const c of completions) {
    totalTaskXp += c.xpEarned;
    if (c.taskId.includes('skin-spf-daily')) spfCount++;
    const arr = byDate.get(c.date) ?? [];
    arr.push(c);
    byDate.set(c.date, arr);
  }

  // Full-day completion bonuses (+30 XP per day with >= 80% tasks done)
  const enabledCount = Math.max(1, tasks.length);
  let fullDayBonus = 0;
  const activeDates = new Set<string>();
  byDate.forEach((list, dt) => {
    if (list.length > 0) activeDates.add(dt);
    if (list.length >= Math.max(3, Math.ceil(enabledCount * 0.8))) {
      fullDayBonus += 30;
    }
  });

  // Compute current streak (allowing 1 freeze per week automatically if 1-day gap occurred)
  const today = toLocalDateKey();
  const currentWeek = getIsoWeekKey(today);
  let freezesRemaining = prevXp?.lastFreezeWeek === currentWeek ? prevXp.streakFreezesRemaining : 1;

  let streak = 0;
  let cursor = activeDates.has(today) ? today : addDays(today, -1);
  let usedFreeze = false;

  for (let i = 0; i < 365; i++) {
    if (activeDates.has(cursor)) {
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
  const totalXp = totalTaskXp + fullDayBonus + workouts.length * 40 + scans.length * 35;

  // Level calculation: xp needed for level L -> L+1 = 100 * L^1.3
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }

  // Unlock real milestone badges
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
    notes: '',
    updatedAt: Date.now(),
  };
  await db.dailyLogs.put(fresh);
  return fresh;
}

export async function saveMealScanEntry(entry: Omit<MealScanEntry, 'id'>): Promise<number> {
  const id = await db.mealScans.add(entry);
  const log = await getOrCreateDailyLog(entry.date);
  await db.dailyLogs.update(entry.date, {
    calories: Math.max(0, Math.round((log.calories || 0) + entry.totalCalories)),
    proteinG: Math.max(0, Math.round((log.proteinG || 0) + entry.totalProteinG)),
    updatedAt: Date.now(),
  });
  return id;
}

export async function updateMealScanEntry(updated: MealScanEntry): Promise<void> {
  if (!updated.id) return;
  const prev = await db.mealScans.get(updated.id);
  await db.mealScans.put(updated);
  if (prev) {
    const log = await getOrCreateDailyLog(updated.date);
    const calDelta = updated.totalCalories - prev.totalCalories;
    const proDelta = updated.totalProteinG - prev.totalProteinG;
    await db.dailyLogs.update(updated.date, {
      calories: Math.max(0, Math.round((log.calories || 0) + calDelta)),
      proteinG: Math.max(0, Math.round((log.proteinG || 0) + proDelta)),
      updatedAt: Date.now(),
    });
  }
}

export async function deleteMealScanEntry(entry: MealScanEntry): Promise<void> {
  if (!entry.id) return;
  await db.mealScans.delete(entry.id);
  const log = await db.dailyLogs.get(entry.date);
  if (log) {
    await db.dailyLogs.update(entry.date, {
      calories: Math.max(0, Math.round((log.calories || 0) - entry.totalCalories)),
      proteinG: Math.max(0, Math.round((log.proteinG || 0) - entry.totalProteinG)),
      updatedAt: Date.now(),
    });
  }
}

export async function exportAllDataJson(): Promise<string> {
  const payload = {
    ascendBackup: true,
    version: 1,
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
    },
  };
  return JSON.stringify(payload, null, 2);
}

export async function importAllDataJson(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString);
  if (!parsed?.ascendBackup || !parsed?.data) {
    throw new Error('File is not a valid ASCEND backup.');
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
    }
  );
  await ensureDatabaseReady();
  await recalculateXpAndBadges();
}

export async function wipeAllData(): Promise<void> {
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
  ]);
  await ensureDatabaseReady();
}
