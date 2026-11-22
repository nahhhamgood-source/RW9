import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  ExternalLink,
  EyeOff,
  Film,
  Flame,
  FolderLock,
  FolderOpen,
  History,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { addProtocolToPlan, db } from '../../db/database';
import { MINDSET_PATHS } from '../../data/pathsCatalog';
import {
  buildChannelSearchUrl,
  buildWeeklyCutRecap,
  buildYouTubeSearchUrl,
  computeIdentityVotes,
  computeUnlockedChapters,
  getActivePathIds,
  getDailyCutForDate,
  getDailyVideoSuggestion,
  getMindsetPathsSettings,
  getOnePerDayWeekStrip,
  getPathShortName,
  validateYouTubeVideoUrl,
} from '../../lib/mindsetEngine';
import { playUiSound } from '../../lib/themes';
import type {
  ActiveProtocolTask,
  AppSettings,
  DailyLog,
  ExerciseSessionLog,
  MindsetPathId,
  MindsetPathsSettings,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
} from '../../types';

interface DailyCutCardProps {
  profile: UserProfile;
  settings: AppSettings;
  dailyLogs: DailyLog[];
  completions: TaskCompletion[];
  workouts: WorkoutSession[];
  exerciseLogs: ExerciseSessionLog[];
  tasks: ActiveProtocolTask[];
  todayKey: string;
  isOnline: boolean;
  onOpenPathPicker: () => void;
  onCompleteTaskByProtocol?: (protocolId: string) => void;
  onVideoWatchedWin?: (topic: string) => void;
}

type CardSubTab = 'today' | 'video' | 'saved' | 'watchlist' | 'recap' | 'chapters';

export const DailyCutCard: React.FC<DailyCutCardProps> = ({
  profile,
  settings,
  dailyLogs,
  completions,
  workouts,
  exerciseLogs,
  tasks,
  todayKey,
  isOnline,
  onOpenPathPicker,
  onCompleteTaskByProtocol,
  onVideoWatchedWin,
}) => {
  const mp = getMindsetPathsSettings(settings);
  const activeIds = getActivePathIds(mp);
  const [collapsed, setCollapsed] = useState(false);
  const [subTab, setSubTab] = useState<CardSubTab>('today');
  const [realityOpen, setRealityOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [manageVideosOpen, setManageVideosOpen] = useState(false);

  // Action feedback
  const [actionToast, setActionToast] = useState<string | null>(null);

  // 10-minute post-tap timer for Daily Video
  const [videoTimerSec, setVideoTimerSec] = useState<number | null>(null);
  const [microActionText, setMicroActionText] = useState('');

  // My Videos + Channels inputs
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoWhy, setNewVideoWhy] = useState('');
  const [newVideoPathId, setNewVideoPathId] = useState<MindsetPathId>(mp.mainPathId ?? 'eagle');
  const [newVideoError, setNewVideoError] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState('');

  useEffect(() => {
    if (videoTimerSec === null || videoTimerSec <= 0) return;
    const id = window.setInterval(() => {
      setVideoTimerSec((prev) => (prev !== null && prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [videoTimerSec]);

  const updateMp = async (patch: Partial<MindsetPathsSettings>) => {
    const next: MindsetPathsSettings = { ...mp, ...patch };
    await db.settings.update('app', { mindsetPaths: next });
  };

  const flashMsg = (msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(null), 2400);
  };

  const resolvedCut = useMemo(
    () =>
      getDailyCutForDate({
        profile,
        settings,
        dailyLogs,
        todayKey,
      }),
    [profile, settings, dailyLogs, todayKey]
  );

  // Sync current day's lesson ID into 14-day history once resolved (non-blocking)
  useEffect(() => {
    if (!resolvedCut) return;
    const existing = mp.dailyCutHistory[todayKey];
    if (existing !== resolvedCut.lesson.id) {
      db.settings
        .update('app', {
          mindsetPaths: {
            ...mp,
            dailyCutHistory: {
              ...mp.dailyCutHistory,
              [todayKey]: resolvedCut.lesson.id,
            },
          },
        })
        .catch(() => {});
    }
  }, [resolvedCut?.lesson.id, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const votes = useMemo(
    () =>
      computeIdentityVotes({
        settings,
        completions,
        workouts,
        exerciseLogs,
        todayKey,
      }),
    [settings, completions, workouts, exerciseLogs, todayKey]
  );

  const weekStrip = useMemo(
    () =>
      mp.mode === 'one_per_day'
        ? getOnePerDayWeekStrip({ mp, todayKey })
        : [],
    [mp, todayKey]
  );

  const dailyVideo = useMemo(
    () =>
      getDailyVideoSuggestion({
        mp,
        todayKey,
        activePathId: resolvedCut?.path.id ?? mp.mainPathId ?? 'eagle',
      }),
    [mp, todayKey, resolvedCut?.path.id]
  );

  const weeklyRecap = useMemo(
    () => buildWeeklyCutRecap(mp, todayKey),
    [mp, todayKey]
  );

  const chapters = useMemo(
    () => computeUnlockedChapters({ completions, workouts, settings }),
    [completions, workouts, settings]
  );

  const maxBarVotes = Math.max(1, ...votes.sevenDayBars.map((b) => b.votes));

  // Empty state if user has no active paths or turned paths off
  if (!mp.pathsEnabled || activeIds.length === 0 || !resolvedCut) {
    return (
      <section className="ascend-card p-4 border border-[var(--accent)]/30 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold">Today&apos;s inspiration</h3>
          </div>
          <span className="text-[11px] text-slate-400">Optional</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pick a real athlete or discipline archetype to get 1 short Daily Cut idea, identity votes, and 1 long-form focus video. Optional — never changes your core ring rules.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenPathPicker}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
          >
            Choose who inspires you
          </button>
          {!mp.pathsEnabled && (
            <button
              type="button"
              onClick={() => updateMp({ pathsEnabled: true })}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              Turn Paths back on
            </button>
          )}
        </div>
      </section>
    );
  }

  const { lesson, path, displayIdea, sourceLabel, isUnder18Filtered, tonePrefix } = resolvedCut;
  const isSaved = mp.savedCuts.some((s) => s.lessonId === lesson.id);
  const isActedToday = (mp.actedCutIdsByDate[todayKey] ?? []).includes(lesson.id);
  const inWatchlist = lesson.watchMoreTitle
    ? mp.watchlist.some((w) => w.title === lesson.watchMoreTitle)
    : false;

  const videoFeedback = mp.videoFeedbackByDate[todayKey];
  const opensToday = mp.videoOpenCountByDate[todayKey] ?? 0;
  const videoCapReached = opensToday >= mp.videosPerDayCap;

  const handleDoIt = async () => {
    await addProtocolToPlan(lesson.protocolId, path.shortName);
    const prevActed = mp.actedCutIdsByDate[todayKey] ?? [];
    if (!prevActed.includes(lesson.id)) {
      await updateMp({
        actedCutIdsByDate: {
          ...mp.actedCutIdsByDate,
          [todayKey]: [...prevActed, lesson.id],
        },
      });
    }
    const existingTask = tasks.find((t) => t.protocolId === lesson.protocolId && t.enabled);
    if (existingTask && onCompleteTaskByProtocol) {
      onCompleteTaskByProtocol(lesson.protocolId);
      flashMsg('Action logged + checked off on Today');
    } else {
      flashMsg('Added move to your Today plan');
    }
    playUiSound(settings, 'done');
  };

  const handleAnother = async () => {
    const cur = mp.dailyCutSwapCountByDate[todayKey] ?? 0;
    await updateMp({
      dailyCutSwapCountByDate: {
        ...mp.dailyCutSwapCountByDate,
        [todayKey]: cur + 1,
      },
    });
    playUiSound(settings, 'click');
  };

  const handleNotForMe = async () => {
    const nextHidden = Array.from(new Set([...mp.hiddenPathIds, path.id]));
    const remainingInsp = mp.inspirationIds.filter((id) => id !== path.id);
    const nextMain = mp.mainPathId === path.id ? remainingInsp[0] ?? null : mp.mainPathId;
    await updateMp({
      hiddenPathIds: nextHidden,
      mainPathId: nextMain,
      inspirationIds: remainingInsp.filter((id) => id !== nextMain),
    });
    flashMsg(`Hid ${path.shortName} (restore anytime in Settings > Paths)`);
  };

  const handleToggleSaveCut = async () => {
    if (isSaved) {
      await updateMp({
        savedCuts: mp.savedCuts.filter((s) => s.lessonId !== lesson.id),
      });
      flashMsg('Removed from Saved cuts');
    } else {
      await updateMp({
        savedCuts: [
          {
            lessonId: lesson.id,
            pathId: lesson.pathId,
            title: lesson.title,
            idea: displayIdea,
            moveToday: lesson.moveToday,
            protocolId: lesson.protocolId,
            realityCheck: lesson.realityCheck,
            savedAt: Date.now(),
            actedDates: isActedToday ? [todayKey] : [],
          },
          ...mp.savedCuts,
        ].slice(0, 60),
      });
      flashMsg('Saved to cuts');
    }
  };

  const handleAddWatchlist = async () => {
    if (!lesson.watchMoreTitle || inWatchlist) return;
    await updateMp({
      watchlist: [
        {
          id: `wl-${Date.now()}`,
          title: lesson.watchMoreTitle,
          pathId: path.id,
          watched: false,
          addedAt: Date.now(),
        },
        ...mp.watchlist,
      ].slice(0, 40),
    });
    flashMsg('Saved to Watchlist');
  };

  const handleVideoTap = async () => {
    setVideoTimerSec(10 * 60);
    await updateMp({
      videoOpenCountByDate: {
        ...mp.videoOpenCountByDate,
        [todayKey]: opensToday + 1,
      },
    });
  };

  const handleMarkVideoWatched = async () => {
    await updateMp({
      videoFeedbackByDate: {
        ...mp.videoFeedbackByDate,
        [todayKey]: {
          topic: dailyVideo.topic,
          helped: videoFeedback?.helped ?? null,
          watched: !videoFeedback?.watched,
          updatedAt: Date.now(),
        },
      },
    });
    if (!videoFeedback?.watched) {
      onVideoWatchedWin?.(dailyVideo.topic);
      flashMsg('Marked video watched · Added to Wins');
      playUiSound(settings, 'done');
    }
  };

  const handleVideoHelped = async (helped: boolean) => {
    await updateMp({
      videoFeedbackByDate: {
        ...mp.videoFeedbackByDate,
        [todayKey]: {
          topic: dailyVideo.topic,
          helped,
          watched: videoFeedback?.watched ?? true,
          updatedAt: Date.now(),
        },
      },
    });
    flashMsg(helped ? 'Noted — keeping similar topics' : 'Noted — skipping this topic next time');
  };

  const handleAddMicroActionToToday = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = microActionText.trim();
    if (!clean) return;
    await db.protocolTasks.put({
      id: `video-act-${todayKey}-${Date.now()}`,
      protocolId: 'custom-video-action',
      title: clean,
      actionLine: clean,
      why: `Post-video step (${path.shortName})`,
      steps: [clean],
      evidence: 'Likely works',
      category: 'mind',
      block: 'afternoon',
      minutes: 10,
      xp: 15,
      isCustom: true,
      enabled: true,
      scheduledDate: todayKey,
      sortOrder: tasks.length + 1,
      sourceFocusArea: path.shortName,
    });
    setMicroActionText('');
    flashMsg(`Added "${clean}" to Today`);
    playUiSound(settings, 'done');
  };

  const handleSaveMyVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateYouTubeVideoUrl(newVideoUrl);
    if (!check.valid || !check.normalizedUrl) {
      setNewVideoError(check.reason ?? 'Invalid URL');
      return;
    }
    setNewVideoError(null);
    await updateMp({
      myVideos: [
        {
          id: `mv-${Date.now()}`,
          url: check.normalizedUrl,
          title: newVideoTitle.trim() || 'Saved long-form video',
          pathId: newVideoPathId,
          whySaved: newVideoWhy.trim() || 'Keeps me grounded',
          createdAt: Date.now(),
        },
        ...mp.myVideos,
      ].slice(0, 30),
    });
    setNewVideoUrl('');
    setNewVideoTitle('');
    setNewVideoWhy('');
    flashMsg('Saved personal video');
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newChannelName.trim();
    if (!clean) return;
    await updateMp({
      channelsFollowed: [
        {
          id: `ch-${Date.now()}`,
          name: clean,
          pathId: newVideoPathId,
          createdAt: Date.now(),
        },
        ...mp.channelsFollowed,
      ].slice(0, 25),
    });
    setNewChannelName('');
  };

  return (
    <section
      className="ascend-card p-4 sm:p-5 space-y-3 border-l-4"
      style={{ borderLeftColor: path.colorHex }}
      aria-label="Today's inspiration and Daily Cut"
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: path.colorHex }}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              Today&apos;s inspiration
            </span>
            <span className="text-[11px] text-slate-400">· Optional</span>
            {actionToast && (
              <span className="text-[11px] font-semibold text-emerald-400">· {actionToast}</span>
            )}
          </div>
          <p className="text-xs font-bold truncate">{sourceLabel}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenPathPicker}
            className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold min-h-[32px]"
          >
            Paths
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand inspiration' : 'Collapse inspiration'}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {/* Sub-navigation tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {([
              { id: 'today', label: 'Daily Cut' },
              { id: 'video', label: 'Daily Video' },
              { id: 'saved', label: `Saved (${mp.savedCuts.length})` },
              { id: 'watchlist', label: `Watchlist (${mp.watchlist.length})` },
              { id: 'recap', label: 'Recap' },
              { id: 'chapters', label: 'Chapters' },
            ] as Array<{ id: CardSubTab; label: string }>).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap min-h-[32px] ${
                  subTab === tab.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subTab === 'today' && (
            <div className="space-y-3">
              {/* One Character A Day week calendar + override */}
              {mp.mode === 'one_per_day' && weekStrip.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold">One character a day · This week</span>
                    <button
                      type="button"
                      onClick={() => setPersonPickerOpen((v) => !v)}
                      className="text-[var(--accent)] font-semibold hover:underline"
                    >
                      Choose today&apos;s person
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {weekStrip.map((day) => (
                      <div
                        key={day.dateKey}
                        className={`p-1.5 rounded-lg text-center border ${
                          day.isToday
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-transparent bg-white/60 dark:bg-white/[0.03]'
                        }`}
                      >
                        <p className="text-[9.5px] text-slate-400">{day.dayShort}</p>
                        <p className="text-[10px] font-bold truncate">{day.shortName}</p>
                      </div>
                    ))}
                  </div>
                  {personPickerOpen && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {activeIds.map((pid) => (
                        <button
                          key={pid}
                          type="button"
                          onClick={async () => {
                            await updateMp({
                              todayPersonOverrideDate: todayKey,
                              todayPersonOverrideId: pid,
                            });
                            setPersonPickerOpen(false);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                            path.id === pid
                              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                              : 'bg-white dark:bg-white/10'
                          }`}
                        >
                          {getPathShortName(pid, mp)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Disclaimers & Guardrails */}
              {(path.isRealPerson || path.guardrailNote || isUnder18Filtered) && (
                <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {path.isRealPerson && (
                    <p>
                      {path.paraphraseLabel ?? 'Paraphrase, not a quote'} ·{' '}
                      {path.realPersonDisclaimer ?? 'Not affiliated or endorsed.'}
                    </p>
                  )}
                  {path.guardrailNote && (
                    <p className="text-amber-400 flex items-start gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{path.guardrailNote}</span>
                    </p>
                  )}
                  {isUnder18Filtered && (
                    <p className="text-sky-400">
                      Age-safe summary active · Mature story themes filtered out.
                    </p>
                  )}
                </div>
              )}

              {/* Core Daily Cut Idea */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-bold">{lesson.title}</h4>
                  <button
                    type="button"
                    onClick={() => updateMp({ spoilerFreeDefault: !mp.spoilerFreeDefault })}
                    className="text-[10.5px] font-semibold text-slate-400 hover:text-[var(--accent)]"
                  >
                    {mp.spoilerFreeDefault ? 'Spoiler-free ON' : 'Spoiler-free OFF'}
                  </button>
                </div>
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold text-[var(--accent)]">{tonePrefix} </span>
                  {displayIdea}
                </p>
                {settings.arabicHintsEnabled && (
                  <p className="text-[11px] text-slate-400" dir="rtl">
                    فكرة اليوم من {path.shortName}: خطوة صغيرة ثابتة أهم من الحماس المؤقت.
                  </p>
                )}
              </div>

              {/* Your Move Today */}
              <div className="p-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 space-y-2">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    Your move today
                  </p>
                  <p className="text-xs font-semibold mt-0.5">{lesson.moveToday}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDoIt}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isActedToday ? 'Done today ✓' : 'Do it'}
                  </button>
                  <button
                    type="button"
                    onClick={handleAnother}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/10 text-xs font-semibold min-h-[36px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Another
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSaveCut}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold min-h-[36px] ${
                      isSaved ? 'bg-amber-500/20 text-amber-300' : 'bg-white dark:bg-white/10'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" /> {isSaved ? 'Saved' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNotForMe}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/10 text-xs font-semibold text-slate-400 min-h-[36px]"
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Not for me
                  </button>
                </div>
              </div>

              {/* Watch More + Reality Check Collapsible */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setRealityOpen((v) => !v)}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  {realityOpen ? 'Hide reality check' : 'Reality check (Take · Leave · Cost)'}
                </button>

                {lesson.watchMoreTitle && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Watch more: {lesson.watchMoreTitle}</span>
                    <button
                      type="button"
                      onClick={handleAddWatchlist}
                      disabled={inWatchlist}
                      className="font-semibold text-[var(--accent)] disabled:opacity-50"
                    >
                      {inWatchlist ? 'In Watchlist' : '+ Watchlist'}
                    </button>
                    {lesson.watchSearchQuery && (
                      <a
                        href={buildYouTubeSearchUrl(lesson.watchSearchQuery, false)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-semibold text-[var(--accent)] hover:underline"
                      >
                        Where to watch <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {realityOpen && (
                <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="font-bold text-emerald-400">Take this</p>
                    <p>{path.takeThis}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <p className="font-bold text-rose-400">Leave this</p>
                    <p>{path.leaveThis}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                    <p className="font-bold text-slate-400">Cost</p>
                    <p>{path.cost}</p>
                  </div>
                </div>
              )}

              {/* Identity Votes + 7-Day Bars */}
              <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-white/[0.04] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Flame className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>{votes.statementLine}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    {votes.weeklyTotalVotes} this week · {votes.evidenceTag}
                  </p>
                </div>

                <div className="flex items-end gap-1.5 h-9" aria-label="7 day identity votes">
                  {votes.sevenDayBars.map((bar) => (
                    <div key={bar.dateKey} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-3 rounded-sm bg-[var(--accent)] transition-all"
                        style={{
                          height: `${Math.max(4, Math.round((bar.votes / maxBarVotes) * 22))}px`,
                          opacity: bar.dateKey === todayKey ? 1 : 0.45,
                        }}
                        title={`${bar.dateKey}: ${bar.votes} votes`}
                      />
                      <span className="text-[9px] text-slate-400">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {subTab === 'video' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-[var(--accent)]" />
                  <p className="text-xs font-bold">Daily Motivation Video · One video a day, then done</p>
                </div>
                <div className="flex items-center gap-2">
                  {!isOnline && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10.5px] font-semibold">
                      <WifiOff className="w-3 h-3" /> Needs internet
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => updateMp({ videoMuted: !mp.videoMuted })}
                    className="text-[11px] font-semibold text-slate-400 hover:text-[var(--accent)]"
                  >
                    {mp.videoMuted ? 'Unmute video suggestions' : 'Mute video suggestions'}
                  </button>
                </div>
              </div>

              {mp.videoMuted ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily video suggestions are muted. Unmute anytime when you want 1 focused long-form talk.
                </p>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2">
                    <p className="text-[11px] font-semibold text-[var(--accent)]">
                      {dailyVideo.sourceLabel} · Long-form (4–20 min)
                    </p>
                    <p className="text-xs font-bold">{dailyVideo.topic}</p>
                    {dailyVideo.isRealPersonPath && (
                      <p className="text-[10.5px] text-slate-400">
                        Video by an external creator. ASCEND has no connection to them.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={dailyVideo.primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleVideoTap}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[38px]"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {videoCapReached ? 'Re-open today’s video' : 'Watch today’s video'}
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <a
                        href={dailyVideo.fallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleVideoTap}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-white/10 text-xs font-semibold min-h-[38px]"
                      >
                        Plain YouTube search <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        type="button"
                        onClick={handleMarkVideoWatched}
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold min-h-[38px] ${
                          videoFeedback?.watched
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white dark:bg-white/10'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {videoFeedback?.watched ? 'Watched ✓' : 'Watched'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Did it help?</span>
                        <button
                          type="button"
                          onClick={() => handleVideoHelped(true)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${
                            videoFeedback?.helped === true ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" /> Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVideoHelped(false)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${
                            videoFeedback?.helped === false ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10'
                          }`}
                        >
                          <ThumbsDown className="w-3 h-3" /> No
                        </button>
                      </div>

                      {videoTimerSec !== null && (
                        <div className="flex items-center gap-1.5 text-[var(--accent)] font-mono-num font-bold">
                          <Timer className="w-3.5 h-3.5" />
                          {videoTimerSec > 0 ? (
                            <span>
                              {Math.floor(videoTimerSec / 60)}:
                              {String(videoTimerSec % 60).padStart(2, '0')} left
                            </span>
                          ) : (
                            <span>10m limit complete — back to action</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setVideoTimerSec(null)}
                            className="text-[10px] underline text-slate-400"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Post-video 1-thing prompt */}
                  <form onSubmit={handleAddMicroActionToToday} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={microActionText}
                      onChange={(e) => setMicroActionText(e.target.value)}
                      placeholder="After watching: What is one thing you will do today?"
                      className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[40px]"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to Today
                    </button>
                  </form>

                  {/* My Videos & Channels I Follow */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setManageVideosOpen((v) => !v)}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      {manageVideosOpen
                        ? 'Hide My videos & channels'
                        : `My videos (${mp.myVideos.length}) & Channels I follow (${mp.channelsFollowed.length})`}
                    </button>

                    {manageVideosOpen && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-3">
                        <form onSubmit={handleSaveMyVideo} className="space-y-2">
                          <p className="text-[11px] font-bold">Add personal long-form YouTube link (Shorts blocked)</p>
                          <div className="grid sm:grid-cols-2 gap-1.5">
                            <input
                              type="url"
                              value={newVideoUrl}
                              onChange={(e) => {
                                setNewVideoUrl(e.target.value);
                                setNewVideoError(null);
                              }}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className="px-2.5 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                            />
                            <input
                              type="text"
                              value={newVideoTitle}
                              onChange={(e) => setNewVideoTitle(e.target.value)}
                              placeholder="Video title"
                              className="px-2.5 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                            />
                            <input
                              type="text"
                              value={newVideoWhy}
                              onChange={(e) => setNewVideoWhy(e.target.value)}
                              placeholder="Why this helps me"
                              className="px-2.5 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                            />
                            <div className="flex gap-1.5">
                              <select
                                value={newVideoPathId}
                                onChange={(e) => setNewVideoPathId(e.target.value as MindsetPathId)}
                                className="flex-1 px-2 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                              >
                                {MINDSET_PATHS.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.shortName}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                          {newVideoError && <p className="text-[11px] text-rose-400">{newVideoError}</p>}
                        </form>

                        {mp.myVideos.length > 0 && (
                          <div className="space-y-1">
                            {mp.myVideos.map((v) => (
                              <div key={v.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-white/5">
                                <a
                                  href={v.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={handleVideoTap}
                                  className="font-semibold text-[var(--accent)] hover:underline truncate"
                                >
                                  {v.title} · {getPathShortName(v.pathId, mp)}
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateMp({ myVideos: mp.myVideos.filter((x) => x.id !== v.id) })
                                  }
                                  aria-label="Remove video"
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <form onSubmit={handleAddChannel} className="flex gap-1.5">
                          <input
                            type="text"
                            value={newChannelName}
                            onChange={(e) => setNewChannelName(e.target.value)}
                            placeholder="Follow a channel (plain name)"
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/10 text-xs font-semibold"
                          >
                            Add channel
                          </button>
                        </form>

                        {mp.channelsFollowed.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {mp.channelsFollowed.map((ch) => (
                              <div
                                key={ch.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-xs"
                              >
                                <a
                                  href={buildChannelSearchUrl(ch.name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-[var(--accent)] hover:underline"
                                >
                                  {ch.name}
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateMp({
                                      channelsFollowed: mp.channelsFollowed.filter((x) => x.id !== ch.id),
                                    })
                                  }
                                  aria-label={`Remove channel ${ch.name}`}
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {subTab === 'saved' && (
            <div className="space-y-2">
              {mp.savedCuts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No saved cuts yet. Tap &ldquo;Save&rdquo; on any Daily Cut you want to keep.
                </p>
              ) : (
                mp.savedCuts.map((item) => (
                  <div
                    key={item.lessonId}
                    className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold">
                        {item.title} · <span className="text-[var(--accent)]">{getPathShortName(item.pathId, mp)}</span>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">{item.idea}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateMp({
                          savedCuts: mp.savedCuts.filter((x) => x.lessonId !== item.lessonId),
                        })
                      }
                      aria-label="Delete saved cut"
                      className="text-slate-400 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'watchlist' && (
            <div className="space-y-2">
              {mp.watchlist.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your Watchlist is empty. Tap &ldquo;+ Watchlist&rdquo; on any story lesson&apos;s Watch more title.
                </p>
              ) : (
                mp.watchlist.map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${w.watched ? 'line-through text-slate-400' : ''}`}>
                        {w.title}
                      </p>
                      <p className="text-[10.5px] text-slate-400">{getPathShortName(w.pathId, mp)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={buildYouTubeSearchUrl(`${w.title} where to watch`, false)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded bg-white/10 text-[var(--accent)] text-[11px] font-semibold"
                      >
                        Where to watch
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          updateMp({
                            watchlist: mp.watchlist.map((x) =>
                              x.id === w.id ? { ...x, watched: !x.watched } : x
                            ),
                          })
                        }
                        className={`px-2 py-1 rounded text-[11px] font-semibold ${
                          w.watched ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10'
                        }`}
                      >
                        {w.watched ? 'Watched ✓' : 'Watched'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateMp({
                            watchlist: mp.watchlist.filter((x) => x.id !== w.id),
                          })
                        }
                        aria-label="Remove watchlist item"
                        className="text-slate-400 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'recap' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <History className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>This week&apos;s 3 ideas you acted on</span>
              </div>
              {weeklyRecap.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap &ldquo;Do it&rdquo; on any Daily Cut this week to build your real action recap.
                </p>
              ) : (
                weeklyRecap.map((item) => (
                  <div
                    key={`${item.dateKey}-${item.lesson.id}`}
                    className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] text-xs space-y-0.5"
                  >
                    <p className="font-bold">
                      {item.lesson.title} · <span className="text-[var(--accent)]">{item.pathName}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Acted {item.dateKey}: {item.lesson.moveToday}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'chapters' && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                90-Day Chapters &amp; &ldquo;Files&rdquo; unlock strictly from real logged days — zero loot boxes or fake countdowns.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {chapters.map((ch) => (
                  <div
                    key={ch.chapter}
                    className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                      ch.unlocked
                        ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]'
                        : 'border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1">
                        {ch.unlocked ? (
                          <FolderOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                        ) : (
                          <FolderLock className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        {ch.fileTitle}
                      </span>
                      <span className="text-[10.5px] font-mono-num">
                        {ch.progressDays}/{ch.requiredActiveDays}d
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Badge: {ch.badgeTitle} · {ch.unlocked ? ch.lessonSummary : `Unlocks at ${ch.requiredActiveDays} real logged days`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
