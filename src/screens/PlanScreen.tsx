import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Droplets,
  Dumbbell,
  Flame,
  HelpCircle,
  ListChecks,
  Lock,
  MessageSquareText,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Trash2,
  Trophy,
  Utensils,
} from 'lucide-react';
import {
  addLifeGoal,
  addProtocolToPlan,
  addStarterLifeList,
  db,
  deferTaskToTomorrow,
  getOrCreateDailyLog,
  isAboutMeItemConfirmed,
  isDayCompleteForStreak,
  isUnder18OrGrowing,
  logSameAsUsualMeal,
  prepareSuggestedTomorrowPlan,
  regenerateProtocolFromProfile,
  saveAndVerifyProfile,
  toggleTaskCompletion,
} from '../db/database';
import { xpRequiredForLevel } from '../data/badges';
import { CORE_TWELVE_PROTOCOL_IDS, PROTOCOL_MAP } from '../data/protocols';
import { en, getMealTypeByHour, getPlanGreetingLine, getToneText } from '../i18n/en';
import { ARABIC_HINTS, formatDisplayNumber } from '../i18n/arabicHints';
import { addDays, daysBetween, getGreeting, toLocalDateKey } from '../lib/date';
import { getPslTierMeta } from '../lib/faceMetricsConstants';
import { evaluateWeeklyWeightAdjustment } from '../lib/nutrition';
import { computeHonestDailyLine, detectUserPatterns } from '../lib/patterns';
import { CircularRing } from '../components/ui/ProgressRings';
import { ExerciseDemoLinks } from '../components/ui/ExerciseDemoLinks';
import { EmptyState } from '../components/ui/Skeletons';
import { useToast } from '../components/ui/ToastProvider';
import { WinMomentBanner, type WinMilestoneKind } from '../components/ui/WinMomentBanner';
import { PatternInsightsCards } from '../components/plan/PatternInsightsCards';
import { FightCampCard } from '../components/plan/FightCampCard';
import { WeeklyLeaderReviewModal } from '../components/plan/WeeklyLeaderReviewModal';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  GoalHorizon,
  LifeGoal,
  LifeListItem,
  MealScanEntry,
  PrayerKey,
  TaskCompletion,
  TimeBlock,
  TrainingDayType,
  UserProfile,
  WorkoutSession,
  XpState,
} from '../types';

export type PlanSubTab = 'now' | 'today' | 'tomorrow' | 'goals';

interface PlanScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  xpState: XpState;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  workouts: WorkoutSession[];
  bodyMetrics: BodyMetricEntry[];
  goals: LifeGoal[];
  lifeList: LifeListItem[];
  latestScan?: FaceScanResult | null;
  scans?: FaceScanResult[];
  selectedDate: string;
  initialTab?: string;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'body' | 'sleep' | 'mood' | 'photo' | 'height') => void;
  onOpenFoodBreakfast?: () => void;
  onNavigate: (screen: string, subTab?: string) => void;
  onOpenCoach: (prompt?: string) => void;
}

const HORIZON_ORDER: Record<GoalHorizon, number> = {
  this_week: 0,
  this_month: 1,
  three_months: 2,
  one_year: 3,
};

const PRAYER_ITEMS: Array<{ key: PrayerKey; label: string }> = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Dhuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
];

function playSoftDoneChime(enabled?: boolean): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
    if (!enabled || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  } catch {
    // Ignore audio context autoplay errors
  }
}

function getCurrentTimeBlock(): TimeBlock {
  const hr = new Date().getHours();
  if (hr < 12) return 'morning';
  if (hr < 17) return 'afternoon';
  return 'evening';
}

function parseMinutes(hhmm?: string): number | null {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function isTaskReminderDue(task: ActiveProtocolTask, settings: AppSettings): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const taskRem = parseMinutes(task.reminderTime);
  if (taskRem !== null && Math.abs(nowMin - taskRem) <= 90 && nowMin >= taskRem - 15) {
    return true;
  }

  if (!settings.reminders.enabled) return false;
  if (task.protocolId === 'face-cleanse-am') {
    const m = parseMinutes(settings.reminders.morning);
    return m !== null && nowMin >= m && nowMin <= m + 180;
  }
  if (task.protocolId === 'face-spf-daily') {
    const m = parseMinutes(settings.reminders.spf);
    return m !== null && nowMin >= m && nowMin <= m + 180;
  }
  if (task.protocolId === 'body-workout-day') {
    const m = parseMinutes(settings.reminders.workout);
    return m !== null && nowMin >= m && nowMin <= m + 180;
  }
  if (task.protocolId === 'body-sleep-winddown' || task.protocolId === 'body-sleep-fixed') {
    const m = parseMinutes(settings.reminders.sleep);
    return m !== null && nowMin >= m - 30 && nowMin <= m + 180;
  }
  return false;
}

function cleanTaskTitle(title: string): string {
  return title.replace(/\s*\(optional\)\s*/gi, '').trim();
}

export const PlanScreen: React.FC<PlanScreenProps> = ({
  profile,
  settings,
  xpState,
  tasks,
  completions,
  dailyLogs,
  mealScans,
  workouts,
  bodyMetrics,
  goals,
  lifeList,
  latestScan,
  scans = [],
  selectedDate,
  initialTab,
  onOpenQuickLog,
  onOpenFoodBreakfast,
  onNavigate,
  onOpenCoach,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const tomorrowKey = useMemo(() => addDays(todayKey, 1), [todayKey]);
  const easyMode = settings.easyMode !== false;
  const tone = settings.tone ?? 'normal';
  const hideCut = useMemo(() => isUnder18OrGrowing(profile), [profile]);
  const tierBadge = useMemo(
    () =>
      latestScan
        ? getPslTierMeta(latestScan.pslEstimate, settings.slangTierNames ?? true)
        : null,
    [latestScan, settings.slangTierNames]
  );

  const normalizedInitial: PlanSubTab =
    initialTab === 'today' || initialTab === 'tomorrow' || initialTab === 'goals'
      ? initialTab
      : 'now';
  const [tab, setTab] = useState<PlanSubTab>(normalizedInitial);

  React.useEffect(() => {
    if (
      initialTab === 'now' ||
      initialTab === 'today' ||
      initialTab === 'tomorrow' ||
      initialTab === 'goals'
    ) {
      setTab(initialTab);
    }
  }, [initialTab]);

  // Now tab state
  const [deferredForNow, setDeferredForNow] = useState<string[]>([]);
  const [showStreakHelp, setShowStreakHelp] = useState(false);
  const [showNowHowTo, setShowNowHowTo] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [showExploreMore, setShowExploreMore] = useState(false);

  // Today tab UI state
  const [showAllToday, setShowAllToday] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [addingToday, setAddingToday] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskBlock, setNewTaskBlock] = useState<TimeBlock>('morning');
  const [newTaskMinutes, setNewTaskMinutes] = useState('5');

  // Tomorrow tab UI state
  const [addingTomorrow, setAddingTomorrow] = useState(false);
  const [tmrwTitle, setTmrwTitle] = useState('');
  const [tmrwBlock, setTmrwBlock] = useState<TimeBlock>('morning');

  // Goals & Life list UI state
  const [addingGoal, setAddingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalFocus, setGoalFocus] = useState<LifeGoal['focusArea']>('face');
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);

  const [addingLifeItem, setAddingLifeItem] = useState(false);
  const [lifeTitle, setLifeTitle] = useState('');
  const [lifeHorizon, setLifeHorizon] = useState<GoalHorizon>('this_month');
  const [lifeDueDate, setLifeDueDate] = useState('');

  const todayDow = new Date(`${selectedDate}T12:00:00`).getDay();
  const createdDateKey = useMemo(() => {
    const d = new Date(profile.createdAt || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [profile.createdAt]);
  const dayNumber = Math.max(1, daysBetween(createdDateKey, todayKey) + 1);
  const currentJourneyLevel = Math.min(13, Math.ceil(dayNumber / 7));
  const [journeyLevel, setJourneyLevel] = useState(currentJourneyLevel);

  const completedTodayIds = useMemo(
    () => new Set(completions.filter((c) => c.date === todayKey).map((c) => c.taskId)),
    [completions, todayKey]
  );

  const isRoughDay = Boolean(settings.roughDayDates?.includes(todayKey));
  const isRelaxedFriday = Boolean(settings.relaxedFridayMode && todayDow === 5);
  const arabicHints = Boolean(settings.arabicHintsEnabled);
  const arabicDigits = Boolean(settings.arabicIndicDigits);
  const dayMode: TrainingDayType = settings.dayModeByDate?.[todayKey] ?? 'gym';
  const [windDownChecks, setWindDownChecks] = useState<Record<string, boolean>>({});
  const [showWindDown, setShowWindDown] = useState(() => new Date().getHours() >= 19);

  const rawTodayTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.enabled) return false;
      if (t.scheduledDate && t.scheduledDate !== todayKey) return false;
      if (!t.scheduledDate && t.daysOfWeek && !t.daysOfWeek.includes(todayDow)) return false;
      return true;
    });
  }, [tasks, todayKey, todayDow]);

  const todayTasks = useMemo(() => {
    if (isRoughDay) {
      // Rough day mode shrinks Today cleanly to 2 gentle tasks (hydration/sleep/first essentials)
      const nonExtra = rawTodayTasks.filter((t) => !t.isAdvancedOptional);
      const source = nonExtra.length >= 2 ? nonExtra : rawTodayTasks;
      return source.slice(0, 2);
    }
    if (isRelaxedFriday) {
      const nonExtra = rawTodayTasks.filter((t) => !t.isAdvancedOptional);
      return nonExtra.slice(0, 4);
    }
    return rawTodayTasks;
  }, [rawTodayTasks, isRoughDay, isRelaxedFriday]);

  const tomorrowTasks = useMemo(
    () => tasks.filter((t) => t.enabled && t.scheduledDate === tomorrowKey),
    [tasks, tomorrowKey]
  );

  // Simple mode caps Today list to 6 habits unless "Show more" toggled
  const visibleTodayTasks = useMemo(() => {
    if (!easyMode || showAllToday) return todayTasks;
    return todayTasks.slice(0, 6);
  }, [todayTasks, easyMode, showAllToday]);

  const activeProgressTasks = easyMode && !showAllToday ? visibleTodayTasks : todayTasks;

  const todayDoneCount = useMemo(
    () => activeProgressTasks.filter((t) => completedTodayIds.has(t.id)).length,
    [activeProgressTasks, completedTodayIds]
  );
  const todayPct =
    activeProgressTasks.length > 0
      ? Math.round((todayDoneCount / activeProgressTasks.length) * 100)
      : 0;

  const patternResult = useMemo(
    () =>
      detectUserPatterns({
        todayKey,
        profile,
        dailyLogs,
        mealScans,
        workouts,
        bodyMetrics,
        tasks: rawTodayTasks,
        completions,
        dismissedIds: settings.dismissedPatternIds ?? [],
        maxCards: 2,
      }),
    [
      todayKey,
      profile,
      dailyLogs,
      mealScans,
      workouts,
      bodyMetrics,
      rawTodayTasks,
      completions,
      settings.dismissedPatternIds,
    ]
  );

  const honestDailyLine = useMemo(
    () =>
      computeHonestDailyLine({
        todayKey,
        workouts,
        dailyLogs,
        completions,
        targetSleepHours: profile.targetSleepHours,
        isRoughDay,
      }),
    [todayKey, workouts, dailyLogs, completions, profile.targetSleepHours, isRoughDay]
  );

  const unconfirmedAboutCount = useMemo(() => {
    const about = profile.aboutMe;
    if (!about) return 0;
    const deleted = new Set(about.deletedKeys ?? []);
    return (['location_foods', 'training_camp', 'eating_pattern', 'identity_focus', 'support_style'] as const).filter(
      (k) => !deleted.has(k) && (about.statuses?.[k] ?? 'suggested') === 'suggested'
    ).length;
  }, [profile.aboutMe]);

  const trainingCampConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'training_camp');
  const localFoodsConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'location_foods');
  const eatingPatternConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'eating_pattern');

  const fightCampCountdownDays = useMemo(() => {
    if (!trainingCampConfirmed) return null;
    const dt = profile.aboutMe?.tournamentDate;
    if (!dt || dt < todayKey) return null;
    return daysBetween(todayKey, dt);
  }, [trainingCampConfirmed, profile.aboutMe?.tournamentDate, todayKey]);

  const weeklyAdjust = useMemo(
    () => evaluateWeeklyWeightAdjustment(profile, bodyMetrics, todayKey),
    [profile, bodyMetrics, todayKey]
  );

  const autopilotWeeklyStats = useMemo(() => {
    const cutoff = addDays(todayKey, -6);
    const recentWorkouts = workouts.filter((w) => w.date >= cutoff && w.date <= todayKey);
    const recentSleep = dailyLogs.filter(
      (l) => l.date >= cutoff && l.date <= todayKey && l.sleepHours > 0
    );
    const avgSleep =
      recentSleep.length > 0
        ? Number(
            (recentSleep.reduce((s, l) => s + l.sleepHours, 0) / recentSleep.length).toFixed(1)
          )
        : null;
    const recentCompletions = completions.filter((c) => c.date >= cutoff && c.date <= todayKey);
    const hasEnoughData =
      recentCompletions.length >= 3 || recentWorkouts.length >= 1 || bodyMetrics.length >= 2;
    const lastRev = settings.lastWeeklyReviewDate;
    const daysSinceLast = lastRev ? daysBetween(lastRev, todayKey) : null;
    const isDue =
      hasEnoughData &&
      lastRev !== todayKey &&
      (daysSinceLast === null ? todayDow === 0 || dayNumber >= 7 : daysSinceLast >= 7 || todayDow === 0);

    return {
      isDue,
      workoutCount: recentWorkouts.length,
      avgSleep,
      completionCount: recentCompletions.length,
    };
  }, [
    todayKey,
    workouts,
    dailyLogs,
    completions,
    bodyMetrics.length,
    settings.lastWeeklyReviewDate,
    todayDow,
    dayNumber,
  ]);

  const showHealthyFrameCard = useMemo(() => {
    const last = settings.healthyFrameLastShownDate;
    if (!last) return dayNumber >= 2;
    return daysBetween(last, todayKey) >= 7;
  }, [settings.healthyFrameLastShownDate, dayNumber, todayKey]);

  /**
   * "Do this now" strict priority order:
   * 1. Due reminders (non-extra)
   * 2. Essential habits (!isAdvancedOptional), adapted by today's Gym/MMA/Sparring/Rest dayMode
   * 3. My focus tasks (matching profile.focusAreas)
   * 4. Extras (isAdvancedOptional) — never first unless no higher-priority task remains
   */
  const nowRemainingTasks = useMemo(() => {
    const currentBlock = getCurrentTimeBlock();
    const blockWeight: Record<TimeBlock, number> =
      currentBlock === 'morning'
        ? { morning: 0, afternoon: 1, evening: 2 }
        : currentBlock === 'afternoon'
        ? { afternoon: 0, evening: 1, morning: 2 }
        : { evening: 0, afternoon: 1, morning: 2 };

    const focusSet = new Set(profile.focusAreas ?? ['face', 'body']);

    const scoreTier = (t: ActiveProtocolTask): number => {
      if (t.isAdvancedOptional) return 3;
      if (dayMode === 'rest' && t.protocolId === 'body-workout-day') return 2;
      if (isTaskReminderDue(t, settings)) return 0;
      const src = (t.sourceFocusArea || '').toLowerCase();
      const matchesFocus =
        (focusSet.has('face') && (src.includes('face') || t.category === 'skin')) ||
        (focusSet.has('body') && (src.includes('body') || t.category === 'training' || t.category === 'sleep')) ||
        (focusSet.has('mind') && (src.includes('mind') || t.category === 'mind'));
      return matchesFocus ? 1 : 2;
    };

    const dayModePriorityBoost = (t: ActiveProtocolTask): number => {
      if (dayMode === 'sparring') {
        if (
          t.protocolId === 'body-sleep-fixed' ||
          t.protocolId === 'body-sleep-winddown' ||
          t.protocolId === 'face-debloat-water' ||
          t.protocolId === 'body-mobility-flow'
        ) {
          return -1;
        }
      } else if (dayMode === 'rest') {
        if (
          t.protocolId === 'body-10min-walk' ||
          t.protocolId === 'body-mobility-flow' ||
          t.protocolId === 'face-debloat-water'
        ) {
          return -1;
        }
        if (t.protocolId === 'body-workout-day') return 2;
      } else if (dayMode === 'gym' || dayMode === 'mma') {
        if (t.protocolId === 'body-workout-day' || t.protocolId === 'body-protein-check') {
          return -1;
        }
      }
      return 0;
    };

    const remaining = activeProgressTasks.filter((t) => !completedTodayIds.has(t.id));
    remaining.sort((a, b) => {
      const aLater = deferredForNow.includes(a.id) ? 1 : 0;
      const bLater = deferredForNow.includes(b.id) ? 1 : 0;
      if (aLater !== bLater) return aLater - bLater;

      const aTier = scoreTier(a);
      const bTier = scoreTier(b);
      if (aTier !== bTier) return aTier - bTier;

      const aBoost = dayModePriorityBoost(a);
      const bBoost = dayModePriorityBoost(b);
      if (aBoost !== bBoost) return aBoost - bBoost;

      if (blockWeight[a.block] !== blockWeight[b.block]) {
        return blockWeight[a.block] - blockWeight[b.block];
      }
      return a.sortOrder - b.sortOrder;
    });
    return remaining;
  }, [activeProgressTasks, completedTodayIds, deferredForNow, profile.focusAreas, settings, dayMode]);

  const primaryNowTask = nowRemainingTasks[0] ?? null;
  const nextTwoTasks = nowRemainingTasks.slice(1, 3);

  const todayLog = useMemo(
    () => dailyLogs.find((l) => l.date === todayKey),
    [dailyLogs, todayKey]
  );

  const todayMealsCal = useMemo(
    () => mealScans.filter((m) => m.date === todayKey).reduce((s, m) => s + m.totalCalories, 0),
    [mealScans, todayKey]
  );
  const todayCaloriesEaten = Math.max(todayMealsCal, todayLog?.calories ?? 0);
  const caloriesLeft = Math.max(0, (profile.calorieGoal || 2200) - todayCaloriesEaten);
  const todayWorkout = useMemo(
    () => workouts.find((w) => w.date === todayKey) ?? null,
    [workouts, todayKey]
  );

  // Real 7-day completion bar chart
  const sevenDayBars = useMemo(() => {
    const enabledCount = Math.max(1, activeProgressTasks.length);
    return Array.from({ length: 7 }, (_, idx) => {
      const dateKey = addDays(todayKey, -(6 - idx));
      const d = new Date(`${dateKey}T12:00:00`);
      const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
      const done = completions.filter((c) => c.date === dateKey).length;
      const pct = Math.min(100, Math.round((done / enabledCount) * 100));
      return { dateKey, label, pct };
    });
  }, [completions, todayKey, activeProgressTasks.length]);

  // Real XP bar calculation
  const xpProgress = useMemo(() => {
    let lvl = 1;
    let rem = xpState.totalXp;
    while (rem >= xpRequiredForLevel(lvl)) {
      rem -= xpRequiredForLevel(lvl);
      lvl++;
    }
    const needed = xpRequiredForLevel(lvl);
    const pct = Math.min(100, Math.round((rem / Math.max(1, needed)) * 100));
    return { rem, needed, pct };
  }, [xpState.totalXp]);

  // Real 90-day journey path grouped in 13 levels (7 days per level, Level 13 = Days 85-90)
  const journeyData = useMemo(() => {
    const enabledCount = Math.max(1, activeProgressTasks.length);
    const countsByDate = new Map<string, number>();
    for (const c of completions) {
      countsByDate.set(c.date, (countsByDate.get(c.date) ?? 0) + 1);
    }

    const startDay = (journeyLevel - 1) * 7 + 1;
    const endDay = Math.min(90, journeyLevel * 7);
    const nodes = Array.from({ length: endDay - startDay + 1 }, (_, i) => {
      const day = startDay + i;
      const dateKey = addDays(createdDateKey, day - 1);
      const doneCount = countsByDate.get(dateKey) ?? 0;
      const isDone = isDayCompleteForStreak(doneCount, enabledCount);
      const isToday = dateKey === todayKey;
      const isFuture = day > dayNumber;
      const isMilestoneTrophy = day === endDay;
      return { day, dateKey, isDone, isToday, isFuture, isMilestoneTrophy };
    });

    let totalCompletedDays = 0;
    for (let d = 1; d <= Math.min(90, dayNumber); d++) {
      const dk = addDays(createdDateKey, d - 1);
      if (isDayCompleteForStreak(countsByDate.get(dk) ?? 0, enabledCount)) {
        totalCompletedDays++;
      }
    }

    const levelDoneCount = nodes.filter((n) => n.isDone).length;
    const levelFinished = nodes.length > 0 && levelDoneCount === nodes.length;
    return { nodes, totalCompletedDays, levelFinished };
  }, [completions, createdDateKey, dayNumber, journeyLevel, todayKey, todayTasks.length]);

  const handleToggleDone = async (task: ActiveProtocolTask) => {
    const isNowDone = await toggleTaskCompletion(todayKey, task);
    if (isNowDone) {
      playSoftDoneChime(settings.soundEnabled);
      setShowNowHowTo(false);
      showToast(
        getToneText(tone, {
          normal: `${cleanTaskTitle(task.title)} done (+${task.xp} XP)`,
          chill: `Nice — ${cleanTaskTitle(task.title)} done (+${task.xp} XP)`,
          serious: `Completed: ${cleanTaskTitle(task.title)} (+${task.xp} XP)`,
        })
      );
    }
  };

  const handleNowLater = (task: ActiveProtocolTask) => {
    setDeferredForNow((prev) => [...prev.filter((id) => id !== task.id), task.id]);
    setShowNowHowTo(false);
    showToast(
      getToneText(tone, {
        normal: 'Moved down for later today.',
        chill: 'Moved lower for later today',
        serious: 'Deferred to later in today’s queue',
      }),
      'info'
    );
  };

  const handleMoveToTomorrow = async (task: ActiveProtocolTask) => {
    await deferTaskToTomorrow(task.id, todayKey);
    showToast(`Moved "${cleanTaskTitle(task.title)}" to Tomorrow`);
  };

  const handleSetDayMode = async (mode: TrainingDayType) => {
    const nextMap = { ...(settings.dayModeByDate ?? {}), [todayKey]: mode };
    await db.settings.update('app', { dayModeByDate: nextMap });
    const labels: Record<TrainingDayType, string> = {
      gym: 'Gym day mode set',
      mma: 'MMA day mode set',
      sparring: 'Hard sparring mode — sleep & recovery bumped',
      rest: 'Rest day mode set',
    };
    showToast(labels[mode]);
  };

  const handleOneTapTrained = async (kind: 'gym' | 'mma' | 'rest') => {
    await handleSetDayMode(kind);
    if (kind === 'rest') return;
    await db.workouts.add({
      date: todayKey,
      name: kind === 'mma' ? 'MMA Training Session' : 'Gym Strength Session',
      durationMin: kind === 'mma' ? 60 : 45,
      exercises: [],
      notes: '1-tap workout check-in',
      createdAt: Date.now(),
    });
    const workoutTask = tasks.find((t) => t.protocolId === 'body-workout-day');
    if (workoutTask && !completedTodayIds.has(workoutTask.id)) {
      await toggleTaskCompletion(todayKey, workoutTask);
    }
    showToast(`Logged ${kind.toUpperCase()} session`);
  };

  const handleSameAsUsualMeal = async () => {
    const slot = getMealTypeByHour();
    const added = await logSameAsUsualMeal(todayKey, slot);
    if (!added) {
      showToast('Log one meal first so "Same as usual" knows your favorite', 'info');
      onNavigate('food');
      return;
    }
    showToast(`Logged "${added.mealTitle}" (+${added.totalCalories} kcal)`);
  };

  const handleWaterPlusOne = async () => {
    const cur = await getOrCreateDailyLog(todayKey);
    await db.dailyLogs.update(todayKey, {
      waterMl: (cur.waterMl || 0) + 250,
      updatedAt: Date.now(),
    });
    showToast('+250 ml water logged');
  };

  const activeWinMilestone: WinMilestoneKind | null = useMemo(() => {
    const celebrated = new Set(settings.celebratedMilestones ?? []);
    if (latestScan && !celebrated.has('first_scan')) return 'first_scan';
    if (xpState.currentStreak >= 7 && !celebrated.has('streak_7')) return 'streak_7';
    if (xpState.level >= 2 && !celebrated.has(`level_up_${xpState.level}`)) return 'level_up';
    if (journeyData.levelFinished && !celebrated.has(`journey_level_${journeyLevel}`)) return 'journey_level';
    if (bodyMetrics.length >= 4 && !celebrated.has('weight_milestone')) return 'weight_milestone';
    return null;
  }, [
    settings.celebratedMilestones,
    latestScan,
    xpState.currentStreak,
    xpState.level,
    journeyData.levelFinished,
    journeyLevel,
    bodyMetrics.length,
  ]);

  const handleDismissWin = async (kind: WinMilestoneKind) => {
    const key =
      kind === 'level_up'
        ? `level_up_${xpState.level}`
        : kind === 'journey_level'
        ? `journey_level_${journeyLevel}`
        : kind;
    const next = Array.from(new Set([...(settings.celebratedMilestones ?? []), key]));
    await db.settings.update('app', { celebratedMilestones: next });
  };

  const exploreMoreProtocols = useMemo(() => {
    const activeIds = new Set(
      tasks.filter((t) => t.enabled && !t.scheduledDate).map((t) => t.protocolId)
    );
    return CORE_TWELVE_PROTOCOL_IDS.filter((id) => !activeIds.has(id))
      .map((id) => PROTOCOL_MAP[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [tasks]);

  const handleToggleRoughDay = async () => {
    const cur = settings.roughDayDates ?? [];
    const next = cur.includes(todayKey)
      ? cur.filter((d) => d !== todayKey)
      : [...cur, todayKey];
    await db.settings.update('app', { roughDayDates: next });
    showToast(
      cur.includes(todayKey)
        ? 'Back to regular Today plan'
        : 'Rough day mode on — shrunk to 2 gentle steps'
    );
  };

  const handleToggleDayDone = async () => {
    const log = await getOrCreateDailyLog(todayKey);
    const next = !log.minimumsDone;
    await db.dailyLogs.update(todayKey, {
      minimumsDone: next,
      updatedAt: Date.now(),
    });
    showToast(next ? 'Day closed cleanly — rest well' : 'Reopened today checklist');
  };

  const handleDismissPattern = async (patternId: string) => {
    const next = Array.from(new Set([...(settings.dismissedPatternIds ?? []), patternId]));
    await db.settings.update('app', { dismissedPatternIds: next });
    showToast('Hidden pattern card', 'info');
  };

  const handleMoveBlockTasks = async (fromBlock: TimeBlock, toBlock: TimeBlock) => {
    const toMove = tasks.filter(
      (t) => t.enabled && !t.scheduledDate && t.block === fromBlock
    );
    if (toMove.length === 0) {
      showToast('No habits to move in that block', 'info');
      return;
    }
    await Promise.all(
      toMove.map((t) => db.protocolTasks.update(t.id, { block: toBlock }))
    );
    showToast(`Moved ${toMove.length} ${fromBlock} habits to ${toBlock}`);
  };

  const handleAcknowledgeHealthyFrame = async () => {
    await db.settings.update('app', { healthyFrameLastShownDate: todayKey });
  };

  const handleCompleteAutopilotReview = async (applyCalorieNudge = false) => {
    if (
      applyCalorieNudge &&
      !hideCut &&
      weeklyAdjust.suggestedCalorieGoal !== null &&
      weeklyAdjust.deltaCalories !== 0
    ) {
      await saveAndVerifyProfile({
        ...profile,
        calorieGoal: weeklyAdjust.suggestedCalorieGoal,
      });
    }
    await db.settings.update('app', { lastWeeklyReviewDate: todayKey });
    await prepareSuggestedTomorrowPlan(profile, settings);
    showToast(
      applyCalorieNudge && weeklyAdjust.suggestedCalorieGoal
        ? `Week reviewed (${weeklyAdjust.suggestedCalorieGoal} kcal) & tomorrow queued`
        : 'Weekly review complete & tomorrow queued'
    );
  };

  const handleAddTodayTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const id = `custom-${Date.now()}`;
    await db.protocolTasks.put({
      id,
      protocolId: id,
      title: cleanTaskTitle(newTaskTitle),
      actionLine: 'Added by you',
      block: newTaskBlock,
      category: 'presence',
      minutes: Math.max(1, Math.min(120, Number(newTaskMinutes) || 5)),
      xp: 15,
      steps: ['Complete this habit calmly at your chosen time.'],
      evidence: 'Proven',
      why: 'Personal daily priority.',
      isCustom: true,
      enabled: true,
      sortOrder: tasks.length + 1,
    });
    setNewTaskTitle('');
    setAddingToday(false);
    showToast('Added to Today');
  };

  const handleUseSuggestedTomorrow = async () => {
    const count = await prepareSuggestedTomorrowPlan(profile, settings);
    showToast(
      count > 0
        ? `Added ${count} suggested habits for Tomorrow`
        : 'Tomorrow already has your suggested plan'
    );
  };

  const handleAddTomorrowTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmrwTitle.trim()) return;
    const id = `tmrw-custom-${Date.now()}`;
    await db.protocolTasks.put({
      id,
      protocolId: id,
      title: cleanTaskTitle(tmrwTitle),
      actionLine: 'Planned for tomorrow',
      block: tmrwBlock,
      category: 'presence',
      minutes: 5,
      xp: 15,
      steps: ['Ready for tomorrow.'],
      evidence: 'Proven',
      why: 'Planned the night before for zero friction.',
      isCustom: true,
      enabled: true,
      sortOrder: tasks.length + 1,
      scheduledDate: tomorrowKey,
    });
    setTmrwTitle('');
    setAddingTomorrow(false);
    showToast('Added to Tomorrow');
  };

  const handleTogglePrayer = async (key: PrayerKey) => {
    const existing = await getOrCreateDailyLog(todayKey);
    const map = { ...(existing.prayersCompleted ?? {}) };
    map[key] = !map[key];
    await db.dailyLogs.update(todayKey, {
      prayersCompleted: map,
      updatedAt: Date.now(),
    });
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (goals.length >= 3) {
      showToast(en.goals.limitNote, 'info');
      return;
    }
    if (!goalTitle.trim()) return;
    await addLifeGoal({
      title: goalTitle.trim(),
      focusArea: goalFocus,
      targetLabel: goalTarget.trim() || 'Steady daily progress',
      horizon: 'three_months',
    });
    setGoalTitle('');
    setGoalTarget('');
    setAddingGoal(false);
    showToast('Main goal saved');
  };

  const handleToggleMilestone = async (goal: LifeGoal, milestoneId: string) => {
    if (!goal.id) return;
    const nextMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, done: !m.done } : m
    );
    const doneCount = nextMilestones.filter((m) => m.done).length;
    const pct = nextMilestones.length > 0 ? Math.round((doneCount / nextMilestones.length) * 100) : 0;
    await db.goals.update(goal.id, {
      milestones: nextMilestones,
      progressPct: pct,
      updatedAt: Date.now(),
    });
  };

  const handleAddLifeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lifeTitle.trim()) return;
    await db.lifeList.add({
      title: lifeTitle.trim(),
      timeframe: lifeHorizon,
      dueDate: lifeDueDate || undefined,
      done: false,
      createdAt: Date.now(),
    });
    setLifeTitle('');
    setLifeDueDate('');
    setAddingLifeItem(false);
    showToast('Added to Life list');
  };

  const sortedLifeList = useMemo(() => {
    return [...lifeList].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const diff = HORIZON_ORDER[a.timeframe] - HORIZON_ORDER[b.timeframe];
      if (diff !== 0) return diff;
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  }, [lifeList]);

  const greetingLine = getPlanGreetingLine(
    getGreeting(),
    profile.name,
    dayNumber,
    primaryNowTask ? cleanTaskTitle(primaryNowTask.title) : null,
    tone
  );

  const hiddenTodayCount = Math.max(0, todayTasks.length - visibleTodayTasks.length);

  const nowTaskIsExercise = Boolean(
    primaryNowTask &&
      (primaryNowTask.exerciseSlug ||
        primaryNowTask.watchQuery ||
        primaryNowTask.category === 'posture' ||
        primaryNowTask.category === 'training')
  );

  return (
    <div className="space-y-4">
      {/* Top 4-chip Bar: Now · Today · Tomorrow · Goals */}
      <div
        role="tablist"
        aria-label="Plan views"
        className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10"
      >
        {([
          { id: 'now', label: en.planChips.now },
          { id: 'today', label: en.planChips.today },
          { id: 'tomorrow', label: en.planChips.tomorrow },
          { id: 'goals', label: en.planChips.goals },
        ] as const).map((chip) => {
          const active = tab === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(chip.id)}
              className={`py-2.5 px-2 rounded-xl text-sm font-semibold min-h-[44px] transition ${
                active
                  ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* 1. NOW VIEW */}
      {tab === 'now' && (
        <div className="space-y-4">
          {activeWinMilestone && (
            <WinMomentBanner
              kind={activeWinMilestone}
              tone={tone}
              onDismiss={() => void handleDismissWin(activeWinMilestone)}
            />
          )}

          {/* 5-second Today Entrance */}
          <div className="ascend-card p-5 space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                  <span>
                    Day {formatDisplayNumber(dayNumber, arabicDigits)} ·{' '}
                    {formatDisplayNumber(todayDoneCount, arabicDigits)}/
                    {formatDisplayNumber(activeProgressTasks.length, arabicDigits)} done
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-bold">
                    <Flame className="w-3 h-3" /> {formatDisplayNumber(xpState.currentStreak, arabicDigits)}d ·{' '}
                    {xpState.streakFreezesRemaining} shield
                  </span>
                  {fightCampCountdownDays !== null && !hideCut && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold">
                      {formatDisplayNumber(fightCampCountdownDays, arabicDigits)}d to fight
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your one thing today
                </p>
                <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight leading-snug">
                  {greetingLine}
                </h1>
              </div>
              <div className="shrink-0">
                <CircularRing value={todayPct} size={62} strokeWidth={6} color="var(--accent)">
                  <span className="font-mono-num text-xs font-bold">
                    {formatDisplayNumber(todayPct, arabicDigits)}%
                  </span>
                </CircularRing>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/70 dark:border-white/10">
              {honestDailyLine}
              {arabicHints && (
                <span dir="rtl" lang="ar" className="block text-[11px] text-[var(--accent)] mt-0.5">
                  {ARABIC_HINTS.dailyLineNote}
                </span>
              )}
            </p>

            {/* 1-tap everything row */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={handleSameAsUsualMeal}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Same as usual meal
              </button>
              <button
                type="button"
                onClick={handleWaterPlusOne}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Water +1
              </button>
              <button
                type="button"
                onClick={() => handleOneTapTrained('gym')}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Trained: Gym
              </button>
              <button
                type="button"
                onClick={() => handleOneTapTrained('mma')}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Trained: MMA
              </button>
              <button
                type="button"
                onClick={() => setShowWeeklyModal(true)}
                className="px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[44px]"
              >
                Weekly Leader Review
              </button>
            </div>

            {/* Diet quick card */}
            <button
              type="button"
              onClick={() => onNavigate('diet')}
              className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 hover:border-[var(--accent)]/40 flex items-center justify-between gap-3 text-left min-h-[48px] transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Utensils className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="text-xs font-bold truncate">
                  Diet:{' '}
                  {hideCut
                    ? `${profile.dietGoal === 'lean_gain' ? en.diet.buildMuscle : en.diet.staySame} · ${formatDisplayNumber(profile.calorieGoal, arabicDigits)} kcal target`
                    : `${
                        profile.dietGoal === 'cut'
                          ? en.diet.loseFat
                          : profile.dietGoal === 'lean_gain'
                          ? en.diet.buildMuscle
                          : en.diet.staySame
                      } · ${formatDisplayNumber(caloriesLeft, arabicDigits)} kcal left`}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] shrink-0">
                Open Diet <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>

          {/* Fight Camp Card (strictly age-gated) */}
          {(profile.mainGoalMode === 'fight_camp' ||
            profile.mainGoalMode === 'both' ||
            trainingCampConfirmed ||
            hideCut) && (
            <FightCampCard
              profile={profile}
              bodyMetrics={bodyMetrics}
              todayLog={todayLog}
              todayMode={dayMode}
              todayKey={todayKey}
              arabicDigits={arabicDigits}
              onOpenQuickLog={onOpenQuickLog}
              onNavigate={onNavigate}
              onLoggedTraining={() => void handleOneTapTrained(dayMode === 'mma' ? 'mma' : 'gym')}
            />
          )}

          {/* Unconfirmed "About me" one-tap review prompt */}
          {unconfirmedAboutCount > 0 && (
            <section className="ascend-card p-3.5 bg-[var(--accent-soft)] border border-[var(--accent)]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-slate-100">
                  Is this right? ({formatDisplayNumber(unconfirmedAboutCount, arabicDigits)} suggested notes about you)
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Confirm or edit your Egypt food &amp; gym/MMA details so plans fit you properly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[38px] shrink-0"
              >
                Review in Settings
                {arabicHints && (
                  <span dir="rtl" lang="ar" className="block text-[10px] font-normal">
                    {ARABIC_HINTS.confirmRight}
                  </span>
                )}
              </button>
            </section>
          )}

          {/* Morning 1-Glance Rhythm Card + Rough Day Button */}
          <section className="ascend-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Today&apos;s rhythm
                </p>
                <p className="text-xs font-mono-num text-slate-700 dark:text-slate-200 mt-0.5">
                  Target: {formatDisplayNumber(profile.calorieGoal, arabicDigits)} kcal ·{' '}
                  {formatDisplayNumber(profile.proteinTargetG, arabicDigits)}g protein ·{' '}
                  {formatDisplayNumber(((profile.waterTargetMl || 3000) / 1000).toFixed(1), arabicDigits)}L water
                  {trainingCampConfirmed && (
                    <span className="text-[var(--accent)] font-bold">
                      {fightCampCountdownDays !== null
                        ? ` · ${formatDisplayNumber(fightCampCountdownDays, arabicDigits)}d to tournament`
                        : ' · Fight camp active'}
                      {profile.aboutMe?.weightClassKg
                        ? ` (${formatDisplayNumber(profile.aboutMe.weightClassKg, arabicDigits)} kg class)`
                        : ''}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleRoughDay}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold min-h-[38px] border transition ${
                  isRoughDay
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                }`}
              >
                {isRoughDay ? 'Rough day ON (2 tasks)' : 'Rough day'}
                {arabicHints && (
                  <span dir="rtl" lang="ar" className="block text-[10px] font-normal">
                    {ARABIC_HINTS.roughDay}
                  </span>
                )}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'gym', label: 'Gym day', ar: ARABIC_HINTS.gymDay },
                  { id: 'mma', label: 'MMA day', ar: ARABIC_HINTS.mmaDay },
                  { id: 'sparring', label: 'Sparring', ar: ARABIC_HINTS.sparringDay },
                  { id: 'rest', label: 'Rest day', ar: ARABIC_HINTS.restDay },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSetDayMode(m.id)}
                  className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold min-h-[40px] border transition ${
                    dayMode === m.id
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span>{m.label}</span>
                  {arabicHints && (
                    <span dir="rtl" lang="ar" className="block text-[9px] opacity-80">
                      {m.ar}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {dayMode === 'gym' || dayMode === 'mma'
                ? localFoodsConfirmed
                  ? 'Training fuel: easy carbs (baladi bread/oats/dates) + water 60–90m before, protein (eggs/chicken/kofta) after.'
                  : 'Training fuel: have easy carbs + water 60–90m before training, and protein within 1–2h after.'
                : dayMode === 'sparring'
                ? 'Hard sparring recovery: prioritize fluids, gentle dinner, and 8h+ sleep tonight.'
                : 'Rest day: light 10m walk, steady hydration, and relaxed mobility.'}
              {eatingPatternConfirmed && ' Eat steady protein early so lunch cravings stay calm.'}
              {trainingCampConfirmed && ' No dehydration cuts — coach & doctor guide weight class.'}
              {isRoughDay && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenCoach("I'm having a rough day — help me do just one small easy step.")
                  }
                  className="ml-2 text-[var(--accent)] font-semibold underline"
                >
                  Talk to coach
                </button>
              )}
            </p>
          </section>

          {/* Autopilot Weekly Review (due on Sundays or 7+ days since last review when real logs exist) */}
          {autopilotWeeklyStats.isDue && (
            <section className="ascend-card p-4 border border-[var(--accent)]/35 bg-[var(--accent-soft)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[var(--accent)]" />
                  Weekly Autopilot Check-In
                </p>
                <span className="font-mono-num text-[11px] text-[var(--accent)] font-semibold">
                  {formatDisplayNumber(autopilotWeeklyStats.completionCount, arabicDigits)} habits ·{' '}
                  {formatDisplayNumber(autopilotWeeklyStats.workoutCount, arabicDigits)} workouts
                  {autopilotWeeklyStats.avgSleep !== null
                    ? ` · ${formatDisplayNumber(autopilotWeeklyStats.avgSleep, arabicDigits)}h avg sleep`
                    : ''}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {weeklyAdjust.headline} {weeklyAdjust.detail}
              </p>
              <div className="flex flex-wrap gap-2">
                {(weeklyAdjust.status === 'nudge_down' || weeklyAdjust.status === 'nudge_up') &&
                  !hideCut &&
                  weeklyAdjust.suggestedCalorieGoal !== null && (
                    <button
                      type="button"
                      onClick={() => handleCompleteAutopilotReview(true)}
                      className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[38px]"
                    >
                      Apply {weeklyAdjust.deltaCalories > 0 ? `+${weeklyAdjust.deltaCalories}` : weeklyAdjust.deltaCalories} kcal &amp; prepare tomorrow
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => handleCompleteAutopilotReview(false)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 font-bold min-h-[38px]"
                >
                  Mark week reviewed &amp; prepare tomorrow
                </button>
              </div>
            </section>
          )}

          {/* Max 2 real-log "I noticed" pattern cards */}
          <PatternInsightsCards
            cards={patternResult.cards}
            insufficientSummary={patternResult.insufficientSummary}
            onDismiss={handleDismissPattern}
            onMoveBlockTasks={handleMoveBlockTasks}
            onOpenFoodBreakfast={() =>
              onOpenFoodBreakfast ? onOpenFoodBreakfast() : onNavigate('food')
            }
            onSwitchRestDay={() => handleSetDayMode('rest')}
          />

          {/* ONE big "Do this now" card */}
          {primaryNowTask ? (
            <section className="ascend-card ascend-hero-glow p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                    {en.now.doThisNow}
                  </span>
                  {primaryNowTask.isAdvancedOptional && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[10px] font-bold">
                      {en.now.extraBadge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                  {primaryNowTask.minutes} min · {en.blocks[primaryNowTask.block]}
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="font-display text-xl sm:text-2xl font-bold">
                  {cleanTaskTitle(primaryNowTask.title)}
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  {primaryNowTask.actionLine}
                </p>
                {primaryNowTask.isAdvancedOptional && (
                  <p className="text-xs text-amber-500">{en.now.extraNote}</p>
                )}
              </div>

              {nowTaskIsExercise && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowNowHowTo((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] min-h-[36px]"
                  >
                    {showNowHowTo ? 'Hide form & video links' : 'How-to & video demo'}
                    {showNowHowTo ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showNowHowTo && (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5 text-xs">
                      {primaryNowTask.steps.length > 0 && (
                        <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                          {primaryNowTask.steps.slice(0, 4).map((s, idx) => (
                            <li key={idx}>• {s}</li>
                          ))}
                        </ul>
                      )}
                      <ExerciseDemoLinks
                        title={cleanTaskTitle(primaryNowTask.title)}
                        slug={primaryNowTask.exerciseSlug}
                        searchQuery={primaryNowTask.watchQuery}
                        doseLabel={`${primaryNowTask.minutes} min`}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleToggleDone(primaryNowTask)}
                  className="flex-1 min-w-[140px] py-3 px-5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-base font-bold inline-flex flex-col items-center justify-center min-h-[48px] active:scale-[0.98] transition"
                >
                  <span className="inline-flex items-center gap-2">
                    <Check className="w-5 h-5" strokeWidth={2.5} />
                    {en.now.doneBtn}
                  </span>
                  {arabicHints && (
                    <span dir="rtl" lang="ar" className="text-[10px] font-normal opacity-90">
                      {ARABIC_HINTS.done}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleNowLater(primaryNowTask)}
                  className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-sm font-semibold min-h-[48px] hover:border-[var(--accent)]/40 transition"
                >
                  <span>{en.now.laterBtn}</span>
                  {arabicHints && (
                    <span dir="rtl" lang="ar" className="block text-[10px] font-normal opacity-75">
                      {ARABIC_HINTS.later}
                    </span>
                  )}
                </button>
              </div>
            </section>
          ) : (
            <EmptyState
              icon={<Sparkles className="w-6 h-6" />}
              title={en.now.allCaughtUpTitle}
              message={en.now.allCaughtUpBody}
              actionLabel={en.now.allCaughtUpAction}
              onAction={() => setTab('today')}
            />
          )}

          {/* Today at a glance strip directly under the Now card */}
          <section className="ascend-card p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Today at a glance
              </h3>
              {!easyMode && (
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="text-xs font-semibold text-[var(--accent)]"
                >
                  Pro telemetry →
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('food')}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-left hover:border-[var(--accent)]/40 min-h-[64px]"
              >
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Utensils className="w-3.5 h-3.5 text-amber-400" />
                  {hideCut ? 'Calories today' : 'Calories left'}
                </span>
                <p className="font-mono-num text-sm font-bold mt-1">
                  {hideCut ? `${todayCaloriesEaten} kcal` : `${caloriesLeft} kcal`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onOpenQuickLog('water')}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-left hover:border-[var(--accent)]/40 min-h-[64px]"
              >
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" /> Water
                </span>
                <p className="font-mono-num text-sm font-bold mt-1">
                  {((todayLog?.waterMl ?? 0) / 1000).toFixed(2)}L
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('health', 'workouts')}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-left hover:border-[var(--accent)]/40 min-h-[64px]"
              >
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Dumbbell className="w-3.5 h-3.5 text-emerald-400" /> Workout
                </span>
                <p className="font-mono-num text-sm font-bold mt-1 truncate">
                  {todayWorkout ? `${todayWorkout.durationMin}m logged` : 'Not logged'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onOpenQuickLog('sleep')}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-left hover:border-[var(--accent)]/40 min-h-[64px]"
              >
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" /> Sleep
                </span>
                <p className="font-mono-num text-sm font-bold mt-1">
                  {todayLog?.sleepHours ? `${todayLog.sleepHours}h` : 'Log sleep'}
                </p>
              </button>
            </div>
          </section>

          {/* Next 2 tasks */}
          {nextTwoTasks.length > 0 && (
            <section className="ascend-card p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {en.now.nextUp}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('today')}
                  className="text-xs font-semibold text-[var(--accent)] inline-flex items-center gap-1 min-h-[36px]"
                >
                  Full list <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {nextTwoTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{cleanTaskTitle(task.title)}</p>
                        {task.isAdvancedOptional && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-bold shrink-0">
                            {en.now.extraBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {task.minutes} min · {en.blocks[task.block]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDone(task)}
                      aria-label={`Mark ${cleanTaskTitle(task.title)} done`}
                      className="w-11 h-11 rounded-xl bg-slate-200/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] flex items-center justify-center shrink-0 transition"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Streak + XP Bar + 7-Day Real Progress Bar Chart */}
          <section className="ascend-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold">{xpState.currentStreak} day streak</p>
                    {tierBadge && latestScan && (
                      <button
                        type="button"
                        onClick={() => onNavigate('face', 'scanner')}
                        className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold"
                      >
                        {tierBadge.displayLabel} · {latestScan.pslEstimate}/8
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Level {xpState.level} · {xpState.streakFreezesRemaining} rest shield ready
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStreakHelp((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[var(--accent)] min-h-[44px]"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="hidden sm:inline">{en.now.whatsThis}</span>
              </button>
            </div>

            {showStreakHelp && (
              <p className="text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/80 dark:border-white/10 leading-relaxed">
                Finish at least 70% of your habits on a day to keep your streak going. Missing a day uses 1 rest shield if you have one.
              </p>
            )}

            {/* XP Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                <span>Level {xpState.level} XP</span>
                <span>
                  {xpProgress.rem} / {xpProgress.needed} XP
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${xpProgress.pct}%` }}
                />
              </div>
            </div>

            {/* 7-day real completion bars */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Last 7 days
              </p>
              <div className="grid grid-cols-7 gap-2 items-end h-28 pt-4">
                {sevenDayBars.map((bar) => {
                  const colorCls =
                    bar.pct >= 70
                      ? 'bg-emerald-500'
                      : bar.pct >= 35
                      ? 'bg-amber-400'
                      : 'bg-rose-500/80';
                  return (
                    <div key={bar.dateKey} className="flex flex-col items-center justify-end h-full gap-1">
                      <span className="font-mono-num text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {bar.pct}%
                      </span>
                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          className={`w-full max-w-[26px] rounded-t-lg transition-all duration-300 ${colorCls}`}
                          style={{ height: `${Math.max(8, bar.pct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 90-Day Journey Path (Levels 1..13, 7 days per level, Trophy milestones) */}
          <section className="ascend-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" /> 90-Day Journey · Level {journeyLevel}/13
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {journeyData.totalCompletedDays}/90 completed days from your real check-offs
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={journeyLevel <= 1}
                  onClick={() => setJourneyLevel((l) => Math.max(1, l - 1))}
                  aria-label="Previous level"
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={journeyLevel >= 13}
                  onClick={() => setJourneyLevel((l) => Math.min(13, l + 1))}
                  aria-label="Next level"
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {journeyData.nodes.map((n) => (
                <div key={n.day} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-mono-num text-xs font-bold border transition ${
                      n.isDone
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                        : n.isToday
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] ring-2 ring-[var(--accent)]/40'
                        : n.isFuture
                        ? 'bg-slate-100 dark:bg-white/[0.03] text-slate-400 border-slate-200 dark:border-white/10'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-300 dark:border-white/20'
                    }`}
                  >
                    {n.isMilestoneTrophy ? (
                      <Trophy className="w-4 h-4" />
                    ) : n.isDone ? (
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    ) : n.isFuture ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      n.day
                    )}
                  </div>
                  <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
                    D{n.day}
                  </span>
                </div>
              ))}
            </div>

            {journeyData.levelFinished && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-500 flex items-center gap-2">
                <Trophy className="w-4 h-4 shrink-0" />
                <span>Level {journeyLevel} complete! Every day in this week was logged.</span>
              </div>
            )}
          </section>

          {/* Quiet prayer row if enabled in Settings */}
          {settings.prayerTrackingEnabled && (
            <section className="ascend-card p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Daily prayers
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {PRAYER_ITEMS.map((p) => {
                  const done = Boolean(todayLog?.prayersCompleted?.[p.key]);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleTogglePrayer(p.key)}
                      className={`py-2.5 rounded-xl text-xs font-semibold min-h-[44px] border transition ${
                        done
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {done ? `✓ ${p.label}` : p.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Evening 2-minute wind-down & 1-tap "Day done" */}
          <section className="ascend-card p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowWindDown((v) => !v)}
                className="text-left min-w-0 flex-1"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Evening 2-min wind-down
                  {arabicHints && (
                    <span dir="rtl" lang="ar" className="ml-2 font-normal text-[var(--accent)]">
                      · {ARABIC_HINTS.windDown}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {todayLog?.minimumsDone
                    ? 'Day marked done — rest up for tomorrow.'
                    : 'Quick evening wrap-up before sleep.'}
                </p>
              </button>
              <button
                type="button"
                onClick={handleToggleDayDone}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold min-h-[40px] shrink-0 transition ${
                  todayLog?.minimumsDone
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40'
                    : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                }`}
              >
                {todayLog?.minimumsDone ? '✓ Day done' : 'Day done'}
                {arabicHints && (
                  <span dir="rtl" lang="ar" className="block text-[10px] font-normal">
                    {ARABIC_HINTS.dayDone}
                  </span>
                )}
              </button>
            </div>

            {showWindDown && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/10">
                {[
                  { id: 'tmrw', label: 'Preview Tomorrow in Plan (10 sec)' },
                  { id: 'screen', label: 'Dim screen & charge phone out of reach' },
                  { id: 'skin_pm', label: 'PM wash + moisturizer' },
                  { id: 'neck', label: '30 sec gentle neck & shoulder release' },
                ].map((step) => {
                  const checked = Boolean(windDownChecks[step.id]);
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() =>
                        setWindDownChecks((prev) => ({ ...prev, [step.id]: !prev[step.id] }))
                      }
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-left text-xs min-h-[38px]"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border border-slate-300 dark:border-white/25'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span className={checked ? 'line-through text-slate-400' : ''}>
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Rarely shown Healthy-Frame card (Part 6) */}
          {showHealthyFrameCard && (
            <section className="ascend-card p-3.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Looks are one part of you. Sleep, fitness, skills and people matter more for how life goes.
              </p>
              <button
                type="button"
                onClick={handleAcknowledgeHealthyFrame}
                className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold shrink-0 min-h-[34px]"
              >
                Got it
              </button>
            </section>
          )}
        </div>
      )}

      {/* 2. TODAY VIEW */}
      {tab === 'today' && (
        <div className="space-y-4">
          <div className="ascend-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <CircularRing value={todayPct} size={64} strokeWidth={6} color="var(--accent)">
                <span className="font-mono-num text-xs font-bold">{todayPct}%</span>
              </CircularRing>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold">{en.today.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDisplayNumber(todayDoneCount, arabicDigits)} of{' '}
                  {formatDisplayNumber(activeProgressTasks.length, arabicDigits)}{' '}
                  {easyMode && !showAllToday && todayTasks.length > 6 ? 'core daily habits' : 'habits'} done
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await regenerateProtocolFromProfile(profile);
                  showToast('Synced Daily 6 with your current goals');
                }}
                className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Sync 6
              </button>
              <button
                type="button"
                onClick={() => setAddingToday((v) => !v)}
                className="px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                {en.today.addTask}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('routine', 'library')}
                aria-label="Open habit library"
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ListChecks className="w-4 h-4" />
              </button>
            </div>
          </div>

          {addingToday && (
            <form onSubmit={handleAddTodayTask} className="ascend-card p-4 space-y-3">
              <p className="text-sm font-bold">Add a quick habit for today</p>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Drink 1 glass of water or 10 min walk"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTaskBlock}
                  onChange={(e) => setNewTaskBlock(e.target.value as TimeBlock)}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={newTaskMinutes}
                  onChange={(e) => setNewTaskMinutes(e.target.value)}
                  placeholder="Minutes"
                  className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
                >
                  Save habit
                </button>
                <button
                  type="button"
                  onClick={() => setAddingToday(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {todayTasks.length === 0 ? (
            <EmptyState
              title={en.today.empty}
              message="Add one small daily habit to build momentum."
              actionLabel={en.today.emptyAction}
              onAction={() => setAddingToday(true)}
            />
          ) : (
            <div className="space-y-4">
              {(['morning', 'afternoon', 'evening'] as const).map((block) => {
                const blockTasks = visibleTodayTasks.filter((t) => t.block === block);
                if (blockTasks.length === 0) return null;
                return (
                  <section key={block} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {block === 'morning' ? (
                        <Sunrise className="w-4 h-4 text-amber-400" />
                      ) : block === 'afternoon' ? (
                        <Sun className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Moon className="w-4 h-4 text-indigo-400" />
                      )}
                      <span>{en.blocks[block]}</span>
                    </div>

                    <div className="space-y-2">
                      {blockTasks.map((task) => {
                        const done = completedTodayIds.has(task.id);
                        const isExpanded = expandedTaskId === task.id;
                        const cleanTitle = cleanTaskTitle(task.title);
                        const hasDemo = Boolean(
                          task.exerciseSlug ||
                            task.watchQuery ||
                            task.category === 'posture' ||
                            task.category === 'training'
                        );
                        return (
                          <div key={task.id} className="ascend-card p-4 space-y-2.5">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => handleToggleDone(task)}
                                aria-label={done ? `Undo ${cleanTitle}` : `Complete ${cleanTitle}`}
                                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition ${
                                  done
                                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                                    : 'bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10'
                                }`}
                              >
                                <Check className="w-5 h-5" />
                              </button>

                              <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p
                                    className={`text-base font-semibold leading-snug ${
                                      done ? 'line-through text-slate-400' : ''
                                    }`}
                                  >
                                    {cleanTitle}
                                  </p>
                                  {task.isAdvancedOptional && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-bold">
                                      {en.now.extraBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {task.actionLine} · {task.minutes} min
                                </p>
                                {task.isAdvancedOptional && (
                                  <p className="text-[11px] text-amber-500 mt-0.5">
                                    {en.now.extraNote}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTaskId((cur) => (cur === task.id ? null : task.id))
                                }
                                aria-label="Details and why"
                                className="px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[var(--accent)] min-h-[44px] inline-flex items-center gap-1"
                              >
                                Why?
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="pt-2.5 border-t border-slate-200/80 dark:border-white/10 space-y-2.5 text-xs">
                                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                  {task.why}
                                </p>
                                {task.steps.length > 0 && (
                                  <ul className="space-y-1 text-slate-500 dark:text-slate-400">
                                    {task.steps.map((s, idx) => (
                                      <li key={idx}>• {s}</li>
                                    ))}
                                  </ul>
                                )}
                                {hasDemo && (
                                  <ExerciseDemoLinks
                                    title={cleanTitle}
                                    slug={task.exerciseSlug}
                                    searchQuery={task.watchQuery}
                                    doseLabel={`${task.minutes} min`}
                                    compact
                                  />
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveToTomorrow(task)}
                                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
                                  >
                                    {en.today.moveTomorrow}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenCoach(`Tips for "${cleanTitle}"`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold min-h-[40px]"
                                  >
                                    <MessageSquareText className="w-3.5 h-3.5" /> Ask coach
                                  </button>
                                  {task.isCustom && (
                                    <button
                                      type="button"
                                      onClick={() => db.protocolTasks.delete(task.id)}
                                      className="p-2 text-rose-500 min-h-[40px]"
                                      aria-label="Delete habit"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {easyMode && (hiddenTodayCount > 0 || showAllToday) && todayTasks.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllToday((v) => !v)}
                  className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-sm font-semibold text-slate-600 dark:text-slate-300 min-h-[44px]"
                >
                  {showAllToday ? en.today.showLess : `${en.today.showMore} (${hiddenTodayCount} more)`}
                </button>
              )}

              {/* Part 3: Collapsed Explore More Shelf for Core 12 familiar habits (never auto-added) */}
              {exploreMoreProtocols.length > 0 && (
                <section className="ascend-card p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowExploreMore((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 text-left min-h-[44px]"
                  >
                    <div>
                      <p className="text-sm font-bold">Explore more ({exploreMoreProtocols.length})</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Optional Core habits — never auto-added to Today
                      </p>
                    </div>
                    {showExploreMore ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {showExploreMore && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      {exploreMoreProtocols.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold">
                                New
                              </span>
                              <p className="text-sm font-semibold truncate">{cleanTaskTitle(item.title)}</p>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {item.why}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await addProtocolToPlan(item.id, 'Explore');
                              showToast(`Added "${cleanTaskTitle(item.title)}" to Today`);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. TOMORROW VIEW */}
      {tab === 'tomorrow' && (
        <div className="space-y-4">
          <div className="ascend-card p-5 space-y-3">
            <div>
              <h2 className="font-display text-lg font-bold">{en.tomorrow.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{en.tomorrow.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseSuggestedTomorrow}
                className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {en.tomorrow.useSuggested}
              </button>
              <button
                type="button"
                onClick={() => setAddingTomorrow((v) => !v)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                {en.tomorrow.addTask}
              </button>
            </div>
          </div>

          {addingTomorrow && (
            <form onSubmit={handleAddTomorrowTask} className="ascend-card p-4 space-y-3">
              <input
                type="text"
                value={tmrwTitle}
                onChange={(e) => setTmrwTitle(e.target.value)}
                placeholder="What will you do tomorrow?"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                required
              />
              <div className="flex gap-2">
                <select
                  value={tmrwBlock}
                  onChange={(e) => setTmrwBlock(e.target.value as TimeBlock)}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          {tomorrowTasks.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-6 h-6" />}
              title={en.tomorrow.empty}
              message="Tap one button to fill tomorrow with a calm, realistic plan."
              actionLabel={en.tomorrow.useSuggested}
              onAction={handleUseSuggestedTomorrow}
            />
          ) : (
            <div className="space-y-2.5">
              {tomorrowTasks.map((task) => (
                <div key={task.id} className="ascend-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{cleanTaskTitle(task.title)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {en.blocks[task.block]} · {task.minutes} min
                        {task.deferredFromDate ? ' · Moved from today' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => db.protocolTasks.delete(task.id)}
                      aria-label={`Remove ${cleanTaskTitle(task.title)}`}
                      className="p-2 text-slate-400 hover:text-rose-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-white/10">
                    <select
                      value={task.block}
                      onChange={(e) =>
                        db.protocolTasks.update(task.id, { block: e.target.value as TimeBlock })
                      }
                      aria-label="Time of day"
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-base sm:text-xs min-h-[44px]"
                    >
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="evening">Evening</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <input
                        type="time"
                        value={task.reminderTime ?? ''}
                        onChange={(e) =>
                          db.protocolTasks.update(task.id, { reminderTime: e.target.value || undefined })
                        }
                        aria-label="Reminder time"
                        className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base sm:text-xs min-h-[44px]"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. GOALS & LIFE LIST VIEW */}
      {tab === 'goals' && (
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold">{en.goals.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{en.goals.subtitle}</p>
              </div>
              {goals.length < 3 && (
                <button
                  type="button"
                  onClick={() => setAddingGoal((v) => !v)}
                  className="px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                >
                  {en.goals.addGoal}
                </button>
              )}
            </div>

            {addingGoal && (
              <form onSubmit={handleCreateGoal} className="ascend-card p-4 space-y-3">
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Main goal (e.g., Clearer skin & steady routine)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                  required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Simple target (e.g., 30 clean days)"
                    className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                  />
                  <select
                    value={goalFocus}
                    onChange={(e) => setGoalFocus(e.target.value as LifeGoal['focusArea'])}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                  >
                    <option value="face">Face</option>
                    <option value="body">Body</option>
                    <option value="mind">Mind</option>
                    <option value="growth">Growth &amp; Posture</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
                  >
                    Save goal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingGoal(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {goals.length === 0 ? (
              <EmptyState
                icon={<Target className="w-6 h-6" />}
                title={en.goals.emptyGoals}
                message={en.goals.limitNote}
                actionLabel={en.goals.addGoal}
                onAction={() => setAddingGoal(true)}
              />
            ) : (
              <div className="space-y-3">
                {goals.slice(0, 3).map((goal) => {
                  const openMilestones = expandedGoalId === goal.id;
                  return (
                    <div key={goal.id} className="ascend-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                            {goal.focusArea}
                          </span>
                          <h3 className="font-display text-base font-bold mt-0.5">{goal.title}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{goal.targetLabel}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => goal.id && db.goals.delete(goal.id)}
                          aria-label="Delete goal"
                          className="p-2 text-slate-400 hover:text-rose-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-mono-num">
                          <span className="text-slate-500 dark:text-slate-400">Progress</span>
                          <strong>{goal.progressPct}%</strong>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${goal.progressPct}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGoalId((cur) => (cur === goal.id ? null : (goal.id ?? null)))
                        }
                        className="text-xs font-semibold text-[var(--accent)] inline-flex items-center gap-1 min-h-[36px]"
                      >
                        {openMilestones ? 'Hide milestones' : 'See milestones (Week → 1 year)'}
                        {openMilestones ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {openMilestones && (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-white/10">
                          {goal.milestones.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleToggleMilestone(goal, m.id)}
                              className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-left min-h-[44px]"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                    m.done
                                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                                      : 'border border-slate-300 dark:border-white/25'
                                  }`}
                                >
                                  {m.done && <Check className="w-3.5 h-3.5" />}
                                </span>
                                <span
                                  className={`text-xs font-medium ${
                                    m.done ? 'line-through text-slate-400' : ''
                                  }`}
                                >
                                  {m.label}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                                {en.horizons[m.horizon]}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold">{en.goals.lifeListTitle}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {en.goals.lifeListSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddingLifeItem((v) => !v)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
              >
                {en.goals.addLifeItem}
              </button>
            </div>

            {addingLifeItem && (
              <form onSubmit={handleAddLifeItem} className="ascend-card p-4 space-y-3">
                <input
                  type="text"
                  value={lifeTitle}
                  onChange={(e) => setLifeTitle(e.target.value)}
                  placeholder="One-time or checkup item (e.g., Book dentist check)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={lifeHorizon}
                    onChange={(e) => setLifeHorizon(e.target.value as GoalHorizon)}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-base min-h-[44px]"
                  >
                    <option value="this_week">{en.horizons.this_week}</option>
                    <option value="this_month">{en.horizons.this_month}</option>
                    <option value="three_months">{en.horizons.three_months}</option>
                    <option value="one_year">{en.horizons.one_year}</option>
                  </select>
                  <input
                    type="date"
                    value={lifeDueDate}
                    onChange={(e) => setLifeDueDate(e.target.value)}
                    aria-label="Due date"
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
                  >
                    Save item
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingLifeItem(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {sortedLifeList.length === 0 ? (
              <EmptyState
                title={en.goals.emptyLifeList}
                message="Load simple checkups like height measurement, haircut trim, or skin check — nothing is pre-ticked."
                actionLabel={en.goals.addStarterList}
                onAction={async () => {
                  await addStarterLifeList();
                  showToast('Added helpful starter checkups');
                }}
              />
            ) : (
              <div className="space-y-2">
                {sortedLifeList.map((item) => (
                  <div
                    key={item.id}
                    className="ascend-card p-3.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        item.id &&
                        db.lifeList.update(item.id, {
                          done: !item.done,
                          doneAt: !item.done ? Date.now() : undefined,
                        })
                      }
                      className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px]"
                    >
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          item.done
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border border-slate-300 dark:border-white/25'
                        }`}
                      >
                        {item.done && <Check className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            item.done ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {en.horizons[item.timeframe]}
                          {item.dueDate ? ` · Due ${item.dueDate}` : ''}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => item.id && db.lifeList.delete(item.id)}
                      aria-label={`Remove ${item.title}`}
                      className="p-2 text-slate-400 hover:text-rose-500 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={() => onOpenQuickLog('water')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" /> Quick log water or check-in
            </button>
          </div>
        </div>
      )}

      {showWeeklyModal && (
        <WeeklyLeaderReviewModal
          profile={profile}
          settings={settings}
          tasks={tasks}
          completions={completions}
          dailyLogs={dailyLogs}
          mealScans={mealScans}
          workouts={workouts}
          bodyMetrics={bodyMetrics}
          scans={scans}
          onClose={() => setShowWeeklyModal(false)}
          onOpenQuickLog={onOpenQuickLog}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
