import { addDays, getWeekDates } from './date';
import { isUnder18OrGrowing } from '../db/database';
import { MINDSET_PATHS, MINDSET_PATH_MAP, type MindsetPathDefinition } from '../data/pathsCatalog';
import { REAL_AND_CUSTOM_LESSONS } from '../data/lessonsRealPaths';
import { STORY_PATH_LESSONS } from '../data/lessonsStoryPaths';
import type {
  AppSettings,
  CustomPathConfig,
  DailyCutLesson,
  DailyLog,
  ExerciseSessionLog,
  MindsetPathId,
  MindsetPathsSettings,
  MySavedVideo,
  TaskCompletion,
  ToneMode,
  UserProfile,
  WorkoutSession,
} from '../types';

export const ALL_DAILY_CUT_LESSONS: DailyCutLesson[] = [
  ...REAL_AND_CUSTOM_LESSONS,
  ...STORY_PATH_LESSONS,
];

export const LESSONS_BY_ID: Record<string, DailyCutLesson> = ALL_DAILY_CUT_LESSONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<string, DailyCutLesson>
);

export const LESSONS_BY_PATH: Record<MindsetPathId, DailyCutLesson[]> = MINDSET_PATHS.reduce(
  (acc, path) => {
    acc[path.id] = ALL_DAILY_CUT_LESSONS.filter((l) => l.pathId === path.id);
    return acc;
  },
  {} as Record<MindsetPathId, DailyCutLesson[]>
);

export function createDefaultCustomPath(): CustomPathConfig {
  return {
    name: 'My Code',
    identityStatement: 'I am the kind of person who keeps small daily promises and protects recovery.',
    habitProtocolIds: ['body-workout-day', 'mind-study-block', 'body-sleep-fixed'],
  };
}

export function createDefaultMindsetPathsSettings(): MindsetPathsSettings {
  return {
    pathsEnabled: true,
    pickerCompleted: false,
    pickerBannerDismissCount: 0,
    mode: 'mix_all',
    mainPathId: null,
    inspirationIds: [],
    todayPersonOverrideDate: null,
    todayPersonOverrideId: null,
    hiddenPathIds: [],
    spoilerFreeDefault: true,
    customPath: createDefaultCustomPath(),
    dailyCutHistory: {},
    dailyCutSwapCountByDate: {},
    actedCutIdsByDate: {},
    savedCuts: [],
    watchlist: [],
    videoMuted: false,
    videosPerDayCap: 1,
    myVideos: [],
    channelsFollowed: [],
    videoFeedbackByDate: {},
    videoOpenCountByDate: {},
    dailyCutNotifEnabled: false,
    dailyCutNotifTime: '09:00',
    dailyVideoNotifEnabled: false,
    dailyVideoNotifTime: '17:00',
  };
}

export function getMindsetPathsSettings(
  settings?: Partial<AppSettings> | null
): MindsetPathsSettings {
  const defaults = createDefaultMindsetPathsSettings();
  const raw = settings?.mindsetPaths;
  if (!raw) return defaults;
  return {
    ...defaults,
    ...raw,
    customPath: {
      ...defaults.customPath,
      ...(raw.customPath ?? {}),
      habitProtocolIds:
        raw.customPath?.habitProtocolIds && raw.customPath.habitProtocolIds.length > 0
          ? raw.customPath.habitProtocolIds.slice(0, 3)
          : defaults.customPath.habitProtocolIds,
    },
    inspirationIds: Array.isArray(raw.inspirationIds) ? raw.inspirationIds.slice(0, 2) : [],
    hiddenPathIds: Array.isArray(raw.hiddenPathIds) ? raw.hiddenPathIds : [],
    savedCuts: Array.isArray(raw.savedCuts) ? raw.savedCuts : [],
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    myVideos: Array.isArray(raw.myVideos) ? raw.myVideos : [],
    channelsFollowed: Array.isArray(raw.channelsFollowed) ? raw.channelsFollowed : [],
    videosPerDayCap: Math.max(1, Math.min(3, Number(raw.videosPerDayCap) || 1)),
  };
}

export function getActivePathIds(mp: MindsetPathsSettings): MindsetPathId[] {
  if (!mp.pathsEnabled) return [];
  const hidden = new Set(mp.hiddenPathIds);
  const raw: MindsetPathId[] = [];
  if (mp.mainPathId && !hidden.has(mp.mainPathId)) {
    raw.push(mp.mainPathId);
  }
  if (mp.mode !== 'single') {
    for (const insp of mp.inspirationIds) {
      if (!hidden.has(insp) && !raw.includes(insp)) {
        raw.push(insp);
      }
    }
  }
  return raw;
}

export function getPathDisplayName(
  pathId: MindsetPathId,
  mp?: MindsetPathsSettings
): string {
  if (pathId === 'custom') {
    return (mp?.customPath.name || 'My Custom Path').trim() || 'My Custom Path';
  }
  return MINDSET_PATH_MAP[pathId]?.name ?? 'General';
}

export function getPathShortName(
  pathId: MindsetPathId,
  mp?: MindsetPathsSettings
): string {
  if (pathId === 'custom') {
    return (mp?.customPath.name || 'My Path').trim() || 'My Path';
  }
  return MINDSET_PATH_MAP[pathId]?.shortName ?? 'General';
}

export function getPathDefinitionForUser(
  pathId: MindsetPathId,
  mp?: MindsetPathsSettings
): MindsetPathDefinition {
  const base = MINDSET_PATH_MAP[pathId] ?? MINDSET_PATH_MAP.eagle;
  if (pathId !== 'custom' || !mp) return base;
  return {
    ...base,
    name: (mp.customPath.name || 'My Custom Path').trim() || 'My Custom Path',
    shortName: (mp.customPath.name || 'Custom').trim() || 'Custom',
    oneLineIdea:
      (mp.customPath.identityStatement || base.oneLineIdea).trim() || base.oneLineIdea,
    habitProtocolIds:
      mp.customPath.habitProtocolIds.length > 0
        ? mp.customPath.habitProtocolIds
        : base.habitProtocolIds,
  };
}

function dateHash(dateKey: string): number {
  return dateKey.split('').reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 1), 0);
}

export function getPathForDate(params: {
  mp: MindsetPathsSettings;
  dateKey: string;
  swapCount?: number;
}): MindsetPathId | null {
  const { mp, dateKey, swapCount = 0 } = params;
  const active = getActivePathIds(mp);
  if (active.length === 0) return null;

  if (mp.mode === 'single') {
    return active[0];
  }

  if (
    mp.mode === 'one_per_day' &&
    swapCount === 0 &&
    mp.todayPersonOverrideDate === dateKey &&
    mp.todayPersonOverrideId &&
    active.includes(mp.todayPersonOverrideId)
  ) {
    return mp.todayPersonOverrideId;
  }

  const dayNumber = Math.floor(new Date(`${dateKey}T12:00:00`).getTime() / 86400000);
  if (mp.mode === 'one_per_day') {
    const idx = Math.abs(dayNumber + swapCount) % active.length;
    return active[idx];
  }

  // Mix all (default): steady weighted rotation across ticked paths
  const idx = Math.abs(dateHash(dateKey) + swapCount) % active.length;
  return active[idx];
}

export function getOnePerDayWeekStrip(params: {
  mp: MindsetPathsSettings;
  todayKey: string;
}): Array<{
  dateKey: string;
  dayShort: string;
  pathId: MindsetPathId;
  shortName: string;
  isToday: boolean;
}> {
  const { mp, todayKey } = params;
  const active = getActivePathIds(mp);
  if (active.length === 0) return [];
  const weekDates = getWeekDates(todayKey);
  return weekDates.map((dk) => {
    const d = new Date(`${dk}T12:00:00`);
    const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' });
    const pid = getPathForDate({ mp, dateKey: dk, swapCount: 0 }) ?? active[0];
    return {
      dateKey: dk,
      dayShort,
      pathId: pid,
      shortName: getPathShortName(pid, mp),
      isToday: dk === todayKey,
    };
  });
}

export interface ResolvedDailyCut {
  lesson: DailyCutLesson;
  path: MindsetPathDefinition;
  displayIdea: string;
  sourceLabel: string;
  isUnder18Filtered: boolean;
  tonePrefix: string;
  recentIdsCount: number;
}

export function resolveUserCurrentFocusTag(params: {
  profile: UserProfile;
  dailyLogs?: DailyLog[];
  settings?: AppSettings;
  todayKey: string;
}): 'fight_camp' | 'study' | 'sleep' | 'general' {
  const { profile, dailyLogs = [], settings, todayKey } = params;
  if (settings?.roughDayDates?.includes(todayKey)) return 'sleep';
  const lastLogs = dailyLogs.filter((l) => l.date >= addDays(todayKey, -3) && l.sleepHours > 0);
  if (lastLogs.length > 0) {
    const avg = lastLogs.reduce((s, l) => s + l.sleepHours, 0) / lastLogs.length;
    if (avg < 6.8) return 'sleep';
  }
  if (
    profile.mainGoalMode === 'fight_camp' ||
    profile.aboutMe?.tournamentUpcoming ||
    (profile.mmaDaysPerWeek ?? 0) > 0
  ) {
    return 'fight_camp';
  }
  if (
    profile.focusAreas?.includes('mind') ||
    (profile.mindSubGoals?.length ?? 0) > 0
  ) {
    return 'study';
  }
  return 'general';
}

export function getRecentLessonIdsWithin14Days(
  history: Record<string, string>,
  todayKey: string
): Set<string> {
  const cutoff = addDays(todayKey, -14);
  const recent = new Set<string>();
  for (const [dk, lessonId] of Object.entries(history)) {
    if (dk >= cutoff && dk < todayKey && lessonId) {
      recent.add(lessonId);
    }
  }
  return recent;
}

export function getDailyCutForDate(params: {
  profile: UserProfile;
  settings: Partial<AppSettings>;
  dailyLogs?: DailyLog[];
  todayKey: string;
}): ResolvedDailyCut | null {
  const { profile, settings, dailyLogs = [], todayKey } = params;
  const mp = getMindsetPathsSettings(settings);
  const active = getActivePathIds(mp);
  if (active.length === 0) return null;

  const swapCount = mp.dailyCutSwapCountByDate[todayKey] ?? 0;
  const recent14 = getRecentLessonIdsWithin14Days(mp.dailyCutHistory, todayKey);
  const chosenPathId = getPathForDate({ mp, dateKey: todayKey, swapCount }) ?? active[0];
  const path = getPathDefinitionForUser(chosenPathId, mp);
  const focusTag = resolveUserCurrentFocusTag({
    profile,
    dailyLogs,
    settings: settings as AppSettings,
    todayKey,
  });

  // Only honor saved date lock if swapCount === 0 and its path is still active & not hidden
  const storedId = mp.dailyCutHistory[todayKey];
  let chosenLesson: DailyCutLesson | null = null;
  if (swapCount === 0 && storedId && LESSONS_BY_ID[storedId]) {
    const stored = LESSONS_BY_ID[storedId];
    if (
      active.includes(stored.pathId) &&
      (mp.mode !== 'one_per_day' || stored.pathId === chosenPathId) &&
      (mp.mode !== 'single' || stored.pathId === chosenPathId)
    ) {
      chosenLesson = stored;
    }
  }

  if (!chosenLesson) {
    const pool = LESSONS_BY_PATH[chosenPathId] ?? REAL_AND_CUSTOM_LESSONS;
    const nonRepeated = pool.filter((l) => !recent14.has(l.id));
    const available = nonRepeated.length > 0 ? nonRepeated : pool;

    // Sort gently to prefer current user focus first, while staying deterministic per day + swap
    const prioritized = [...available].sort((a, b) => {
      const aMatch = a.focusTag === focusTag ? 0 : 1;
      const bMatch = b.focusTag === focusTag ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.dayIndex - b.dayIndex;
    });

    const pickIdx = Math.abs(dateHash(todayKey) + swapCount) % prioritized.length;
    chosenLesson = prioritized[pickIdx] ?? available[0];
  }

  if (!chosenLesson) return null;

  const under18 = isUnder18OrGrowing(profile);
  const spoilerFree = mp.spoilerFreeDefault !== false;

  let displayIdea = chosenLesson.idea;
  if (under18 && path.hasMatureThemeSummary) {
    displayIdea = chosenLesson.matureSafeSummary;
  } else if (spoilerFree) {
    displayIdea = chosenLesson.ideaSpoilerFree;
  }

  const tone: ToneMode = settings.tone ?? 'normal';
  const tonePrefix =
    tone === 'chill'
      ? 'Keep it clean:'
      : tone === 'serious'
      ? 'Standard today:'
      : 'Today’s focus:';

  const sourceLabel = `From: ${path.name}`;

  return {
    lesson: chosenLesson,
    path,
    displayIdea,
    sourceLabel,
    isUnder18Filtered: under18 && path.hasMatureThemeSummary,
    tonePrefix,
    recentIdsCount: recent14.size,
  };
}

// ============================================================================
// Identity Votes & 7-Day Vote Bars
// ============================================================================

export interface IdentityVotesSummary {
  activePathId: MindsetPathId | null;
  activePathName: string;
  todayVotes: number;
  weeklyTotalVotes: number;
  sevenDayBars: Array<{ dateKey: string; label: string; votes: number }>;
  statementLine: string;
  evidenceTag: string;
}

export function computeIdentityVotes(params: {
  settings: Partial<AppSettings>;
  completions: TaskCompletion[];
  workouts: WorkoutSession[];
  exerciseLogs?: ExerciseSessionLog[];
  todayKey: string;
}): IdentityVotesSummary {
  const { settings, completions, workouts, exerciseLogs = [], todayKey } = params;
  const mp = getMindsetPathsSettings(settings);
  const active = getActivePathIds(mp);
  const mainId = active[0] ?? null;
  const mainName = mainId ? getPathShortName(mainId, mp) : 'General habits';

  const countForDate = (dk: string) => {
    const taskCount = completions.filter((c) => c.date === dk).length;
    const workoutCount = workouts.filter((w) => w.date === dk).length;
    const exCount = exerciseLogs.filter((e) => e.date === dk).length;
    return taskCount + workoutCount + exCount;
  };

  const todayVotes = countForDate(todayKey);
  const sevenDayBars = Array.from({ length: 7 }, (_, i) => {
    const dk = addDays(todayKey, -(6 - i));
    const d = new Date(`${dk}T12:00:00`);
    return {
      dateKey: dk,
      label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      votes: countForDate(dk),
    };
  });

  const weeklyTotalVotes = sevenDayBars.reduce((s, b) => s + b.votes, 0);
  const statementLine = mainId
    ? `${todayVotes} ${todayVotes === 1 ? 'vote' : 'votes'} today for ${mainName}`
    : `${todayVotes} ${todayVotes === 1 ? 'habit vote' : 'habit votes'} logged today`;

  return {
    activePathId: mainId,
    activePathName: mainName,
    todayVotes,
    weeklyTotalVotes,
    sevenDayBars,
    statementLine,
    evidenceTag: 'Likely helps (identity-based habits); individual results vary.',
  };
}

// ============================================================================
// Daily Motivation Video (Long-form 4-20 min search, My Videos, Guardrails)
// ============================================================================

export function buildYouTubeSearchUrl(query: string, withDurationFilter = true): string {
  const clean = encodeURIComponent(query.trim());
  // sp=EgIYAw%3D%3D restricts YouTube search to medium duration (4-20 min), filtering out Shorts
  return withDurationFilter
    ? `https://www.youtube.com/results?search_query=${clean}&sp=EgIYAw%3D%3D`
    : `https://www.youtube.com/results?search_query=${clean}`;
}

export function buildChannelSearchUrl(channelName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName.trim())}`;
}

export function validateYouTubeVideoUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  reason?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Paste a YouTube link first.' };
  }
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const allowedHosts = ['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'];
    if (!allowedHosts.includes(host)) {
      return { valid: false, reason: 'Only YouTube links are supported.' };
    }
    if (parsed.pathname.toLowerCase().includes('/shorts')) {
      return {
        valid: false,
        reason: 'Shorts links are blocked to prevent endless scroll — pick a 4–20 min full video.',
      };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, reason: 'Use an https YouTube URL.' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, reason: 'Enter a valid YouTube link.' };
  }
}

export interface DailyVideoSuggestion {
  kind: 'my_video' | 'search_topic';
  path: MindsetPathDefinition;
  topic: string;
  note?: string;
  primaryUrl: string;
  fallbackUrl: string;
  myVideo?: MySavedVideo;
  sourceLabel: string;
  isRealPersonPath: boolean;
}

export function getDailyVideoSuggestion(params: {
  mp: MindsetPathsSettings;
  todayKey: string;
  activePathId?: MindsetPathId | null;
}): DailyVideoSuggestion {
  const { mp, todayKey, activePathId } = params;
  const fallbackPathId = activePathId ?? mp.mainPathId ?? 'eagle';
  const path = getPathDefinitionForUser(fallbackPathId, mp);

  // Check if user saved personal long-form videos for this path (or overall)
  const matchingSaved = mp.myVideos.filter((v) => v.pathId === path.id);
  const savedPool = matchingSaved.length > 0 ? matchingSaved : mp.myVideos;
  if (savedPool.length > 0) {
    const idx = Math.abs(dateHash(todayKey)) % savedPool.length;
    const picked = savedPool[idx];
    return {
      kind: 'my_video',
      path,
      topic: picked.title,
      note: picked.whySaved,
      primaryUrl: picked.url,
      fallbackUrl: buildYouTubeSearchUrl(picked.title, false),
      myVideo: picked,
      sourceLabel: `From: My Videos (${getPathShortName(picked.pathId, mp)})`,
      isRealPersonPath: path.isRealPerson,
    };
  }

  // Otherwise pick from path's 20+ search topics, avoiding topics marked unhelpful recently
  const unhelpfulTopics = new Set(
    Object.values(mp.videoFeedbackByDate)
      .filter((fb) => fb && fb.helped === false)
      .map((fb) => fb.topic)
  );
  const candidates = path.youtubeTopics.filter((t) => !unhelpfulTopics.has(t));
  const pool = candidates.length > 0 ? candidates : path.youtubeTopics;
  const idx = Math.abs(dateHash(todayKey)) % pool.length;
  const topic = pool[idx] ?? 'how to build daily discipline talk';

  return {
    kind: 'search_topic',
    path,
    topic,
    primaryUrl: buildYouTubeSearchUrl(topic, true),
    fallbackUrl: buildYouTubeSearchUrl(topic, false),
    sourceLabel: `From: ${path.name}`,
    isRealPersonPath: path.isRealPerson,
  };
}

// ============================================================================
// 90-Day Chapters & "Files" (Unlocked strictly by REAL logged days/actions)
// ============================================================================

export interface StoryChapterFile {
  chapter: number;
  requiredActiveDays: number;
  title: string;
  fileTitle: string;
  badgeTitle: string;
  unlocked: boolean;
  progressDays: number;
  lessonSummary: string;
}

const CHAPTER_SEEDS = [
  { chapter: 1, requiredActiveDays: 1, title: 'Chapter 1 · Boot Sequence', fileTitle: 'File 01: First Vote' },
  { chapter: 2, requiredActiveDays: 7, title: 'Chapter 2 · First Quiet Week', fileTitle: 'File 02: Seven Days Straight' },
  { chapter: 3, requiredActiveDays: 15, title: 'Chapter 3 · Friction Drop', fileTitle: 'File 03: Basics Under Fatigue' },
  { chapter: 4, requiredActiveDays: 30, title: 'Chapter 4 · Thirty-Day Frame', fileTitle: 'File 04: Honest Mirror' },
  { chapter: 5, requiredActiveDays: 60, title: 'Chapter 5 · Camp & Craft', fileTitle: 'File 05: Steady Execution' },
  { chapter: 6, requiredActiveDays: 90, title: 'Chapter 6 · Ninety-Day Standard', fileTitle: 'File 06: Who You Showed Up As' },
];

export function computeUnlockedChapters(params: {
  completions: TaskCompletion[];
  workouts: WorkoutSession[];
  settings: Partial<AppSettings>;
}): StoryChapterFile[] {
  const { completions, workouts, settings } = params;
  const mp = getMindsetPathsSettings(settings);
  const activeIds = new Set<string>();
  completions.forEach((c) => activeIds.add(c.date));
  workouts.forEach((w) => activeIds.add(w.date));
  const realActiveDays = activeIds.size;

  const activePath = getPathDefinitionForUser(mp.mainPathId ?? 'eagle', mp);
  const pathLessons = LESSONS_BY_PATH[activePath.id] ?? REAL_AND_CUSTOM_LESSONS;

  return CHAPTER_SEEDS.map((seed, idx) => {
    const lesson = pathLessons[Math.min(pathLessons.length - 1, idx * 5)] ?? pathLessons[0];
    return {
      chapter: seed.chapter,
      requiredActiveDays: seed.requiredActiveDays,
      title: seed.title,
      fileTitle: `${seed.fileTitle} (${activePath.shortName})`,
      badgeTitle: activePath.badgeNames[idx] ?? `Tier ${idx + 1}`,
      unlocked: realActiveDays >= seed.requiredActiveDays,
      progressDays: Math.min(realActiveDays, seed.requiredActiveDays),
      lessonSummary: lesson ? lesson.ideaSpoilerFree : activePath.weeklyFocus,
    };
  });
}

export function getBadgeTitleForPath(
  level: number,
  settings: Partial<AppSettings> | undefined,
  defaultRankTitle: string
): string {
  const mp = getMindsetPathsSettings(settings);
  if (!mp.pathsEnabled || !mp.mainPathId) return defaultRankTitle;
  const def = getPathDefinitionForUser(mp.mainPathId, mp);
  const idx = Math.min(def.badgeNames.length - 1, Math.max(0, Math.floor((level - 1) / 2)));
  return def.badgeNames[idx] ?? defaultRankTitle;
}

export function buildRealBootLine(params: {
  dayNumber: number;
  weeklySessions: number;
  todayCompletedCount: number;
  settings: Partial<AppSettings>;
}): string {
  const { dayNumber, weeklySessions, todayCompletedCount, settings } = params;
  const mp = getMindsetPathsSettings(settings);
  const tag =
    mp.pathsEnabled && mp.mainPathId ? ` · ${getPathShortName(mp.mainPathId, mp)}` : '';
  const sessLabel = weeklySessions === 1 ? '1 session' : `${weeklySessions} sessions`;
  if (todayCompletedCount > 0) {
    return `Day ${dayNumber} · ${sessLabel} this week · ${todayCompletedCount} done today${tag}.`;
  }
  return `Day ${dayNumber} · ${sessLabel} this week · Ready${tag}.`;
}

export function buildWeeklyCutRecap(
  mp: MindsetPathsSettings,
  todayKey: string
): Array<{ dateKey: string; lesson: DailyCutLesson; pathName: string }> {
  const cutoff = addDays(todayKey, -6);
  const out: Array<{ dateKey: string; lesson: DailyCutLesson; pathName: string }> = [];
  const seen = new Set<string>();

  const dates = Object.keys(mp.actedCutIdsByDate)
    .filter((dk) => dk >= cutoff && dk <= todayKey)
    .sort((a, b) => b.localeCompare(a));

  for (const dk of dates) {
    for (const lessonId of mp.actedCutIdsByDate[dk] ?? []) {
      if (seen.has(lessonId)) continue;
      const lesson = LESSONS_BY_ID[lessonId];
      if (!lesson) continue;
      seen.add(lessonId);
      out.push({
        dateKey: dk,
        lesson,
        pathName: getPathDisplayName(lesson.pathId, mp),
      });
      if (out.length >= 3) return out;
    }
  }
  return out;
}
