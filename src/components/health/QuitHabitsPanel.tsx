import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  HeartHandshake,
  Lock,
  MessageSquareHeart,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { db, isUnder18OrGrowing } from '../../db/database';
import { toLocalDateKey } from '../../lib/date';
import {
  QUIT_CATEGORIES,
  QUIT_CATEGORY_MAP,
  QUIT_FACT_CARDS,
  computeQuitHabitStats,
} from '../../lib/quitStats';
import { useToast } from '../ui/ToastProvider';
import type { QuitHabitCategory, QuitHabitItem, QuitSlipEntry, UserProfile } from '../../types';

interface QuitHabitsPanelProps {
  profile: UserProfile;
  quitItems: QuitHabitItem[];
  quitSlips: QuitSlipEntry[];
}

const URGE_DURATION_SEC = 10 * 60; // 10-minute wave timer

const TALK_TEMPLATE =
  "Hey, I'm trying to cut back on a habit this month and having a tough urge right now — got 5 minutes to chat or distract me?";

export const QuitHabitsPanel: React.FC<QuitHabitsPanelProps> = ({
  profile,
  quitItems,
  quitSlips,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const isMinor = useMemo(() => isUnder18OrGrowing(profile), [profile]);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(quitItems.length === 0);
  const [selectedCategory, setSelectedCategory] = useState<QuitHabitCategory>('doomscroll');
  const [customTitle, setCustomTitle] = useState('');
  const [reason, setReason] = useState('');
  const [triggers, setTriggers] = useState<string[]>(['Boredom', 'Stress']);
  const [customTrigger, setCustomTrigger] = useState('');
  const [swapPlan, setSwapPlan] = useState('');
  const [discretePrivate, setDiscretePrivate] = useState(false);

  // Discrete mask toggle (hide exact titles on screen if someone peeks nearby)
  const [maskPrivateTitles, setMaskPrivateTitles] = useState(false);

  // Interactive 10-min Urge Timer
  const [urgeHabit, setUrgeHabit] = useState<QuitHabitItem | null>(null);
  const [urgeSecondsLeft, setUrgeSecondsLeft] = useState(URGE_DURATION_SEC);
  const [urgeRunning, setUrgeRunning] = useState(false);

  // Shame-free "I slipped" 2-step modal
  const [slipHabit, setSlipHabit] = useState<QuitHabitItem | null>(null);
  const [slipStep, setSlipStep] = useState<1 | 2>(1);
  const [slipTrigger, setSlipTrigger] = useState('');
  const [slipTweak, setSlipTweak] = useState('');

  // Collapsible helpers
  const [factsOpen, setFactsOpen] = useState(false);
  const [screenTimeOpen, setScreenTimeOpen] = useState(false);

  useEffect(() => {
    if (!urgeHabit || !urgeRunning) return undefined;
    const id = window.setInterval(() => {
      setUrgeSecondsLeft((prev) => {
        if (prev <= 1) {
          setUrgeRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [urgeHabit, urgeRunning]);

  const activeCategoryMeta = QUIT_CATEGORY_MAP[selectedCategory];

  const handleSelectCategory = (cat: QuitHabitCategory) => {
    setSelectedCategory(cat);
    const meta = QUIT_CATEGORY_MAP[cat];
    setTriggers(meta.suggestedTriggers.slice(0, 2));
    setSwapPlan(meta.suggestedSwaps[0] ?? '');
    setDiscretePrivate(Boolean(meta.isPrivateDefault));
    if (cat === 'private') {
      setCustomTitle('Private focus');
    } else if (!customTitle.trim() || Object.values(QUIT_CATEGORY_MAP).some((m) => m.defaultTitle === customTitle)) {
      setCustomTitle(meta.defaultTitle);
    }
  };

  const toggleTriggerChip = (t: string) => {
    setTriggers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleAddTrigger = () => {
    const clean = customTrigger.trim();
    if (!clean) return;
    if (!triggers.includes(clean)) setTriggers((prev) => [...prev, clean]);
    setCustomTrigger('');
  };

  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quitItems.length >= 3) {
      showToast('Max 3 active quit habits at once so you stay focused', 'warning');
      return;
    }
    const meta = QUIT_CATEGORY_MAP[selectedCategory];
    const title = customTitle.trim() || meta.defaultTitle;
    await db.quitItems.add({
      category: selectedCategory,
      title,
      reason: reason.trim() || undefined,
      triggers: triggers.length > 0 ? triggers : meta.suggestedTriggers.slice(0, 2),
      swaps: swapPlan.trim() ? [swapPlan.trim()] : [meta.suggestedSwaps[0] ?? 'Drink water & step away 5 min'],
      isPrivate: discretePrivate || selectedCategory === 'private',
      slipDates: [],
      urgesResisted: 0,
      lastResetAt: Date.now(),
      longestDays: 0,
      createdAt: Date.now(),
    });
    setCustomTitle('');
    setReason('');
    setShowAddForm(false);
    showToast('Added to Quit habits');
  };

  const startUrgeTimer = (item: QuitHabitItem) => {
    setUrgeHabit(item);
    setUrgeSecondsLeft(URGE_DURATION_SEC);
    setUrgeRunning(true);
  };

  const finishUrgeTimer = async () => {
    if (!urgeHabit?.id) {
      setUrgeHabit(null);
      return;
    }
    await db.quitItems.update(urgeHabit.id, {
      urgesResisted: (urgeHabit.urgesResisted ?? 0) + 1,
    });
    showToast('Urge wave passed — +1 handled without pressure');
    setUrgeRunning(false);
    setUrgeHabit(null);
  };

  const openSlipFlow = (item: QuitHabitItem) => {
    setSlipHabit(item);
    setSlipStep(1);
    setSlipTrigger(item.triggers?.[0] ?? '');
    setSlipTweak(item.swaps?.[0] ?? '');
  };

  const saveSlipReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slipHabit?.id) return;
    await db.quitSlips.add({
      habitId: slipHabit.id,
      date: todayKey,
      trigger: slipTrigger.trim() || 'Stress / autopilot',
      tweak: slipTweak.trim() || 'Pause 10 minutes before acting',
      createdAt: Date.now(),
    });
    const prevDates = slipHabit.slipDates ?? [];
    const nextDates = prevDates.includes(todayKey) ? prevDates : [...prevDates, todayKey];
    const nextSwaps =
      slipTweak.trim() && !(slipHabit.swaps ?? []).includes(slipTweak.trim())
        ? [slipTweak.trim(), ...(slipHabit.swaps ?? [])].slice(0, 3)
        : slipHabit.swaps;
    await db.quitItems.update(slipHabit.id, {
      slipDates: nextDates,
      swaps: nextSwaps,
    });
    setSlipHabit(null);
    showToast('Logged calmly. Total days in control stay intact.');
  };

  const handleCopyTalkMessage = async () => {
    try {
      await navigator.clipboard.writeText(TALK_TEMPLATE);
      showToast('Message copied — paste into any chat');
    } catch {
      showToast('Copy failed on this browser — select and copy text manually', 'warning');
    }
  };

  // 4-4-4-4 Box Breathing cue derived from seconds elapsed
  const elapsed = URGE_DURATION_SEC - urgeSecondsLeft;
  const breathCycle = elapsed % 16;
  const breathPhase =
    breathCycle < 4
      ? 'Breathe in slowly (4s)'
      : breathCycle < 8
      ? 'Hold gently (4s)'
      : breathCycle < 12
      ? 'Breathe out slowly (4s)'
      : 'Rest & soften shoulders (4s)';

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Privacy & No-Guilt Header */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
              Quit habits (no guilt)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Track days in control and your 30-day rate — slips never wipe your history.
            </p>
          </div>
          {quitItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMaskPrivateTitles((v) => !v)}
              aria-label={maskPrivateTitles ? 'Show habit names' : 'Hide private habit names'}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold inline-flex items-center gap-1.5 min-h-[44px] shrink-0"
            >
              {maskPrivateTitles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {maskPrivateTitles ? 'Show' : 'Mask'}
            </button>
          )}
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              Private on this device · Hidden elsewhere · Generic reminders
            </p>
            <p>
              Counters stay hidden outside this tab and never appear on PNG share cards. Any phone notification uses generic <span className="font-semibold">“Daily Check-In”</span> text — never your habit name.
            </p>
          </div>
        </div>

        {isMinor && (
          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2.5">
            <HeartHandshake className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Support note for teens &amp; students</p>
              <p>
                You don’t have to handle a tough habit alone. Talking to a trusted parent, school counselor, or doctor makes stopping much easier and safer.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Active Urge 10-Min Ride-It-Out Timer */}
      {urgeHabit && (
        <section className="ascend-card p-5 border-[var(--accent)]/40 bg-[var(--accent-soft)]/30 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--accent)] flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5" /> Ride out the wave · 10 min
              </p>
              <h3 className="font-display text-lg font-bold mt-0.5">
                {maskPrivateTitles || urgeHabit.isPrivate ? 'Private focus' : urgeHabit.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setUrgeRunning(false);
                setUrgeHabit(null);
              }}
              aria-label="Close urge timer"
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-white/10 text-center space-y-2">
            <p className="font-mono-num text-4xl font-bold tracking-tight text-[var(--accent)]">
              {formatTimer(urgeSecondsLeft)}
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {urgeSecondsLeft === 0 ? 'Wave passed! Nice steadiness.' : breathPhase}
            </p>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mt-2">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${Math.round((elapsed / URGE_DURATION_SEC) * 100)}%` }}
              />
            </div>
          </div>

          {urgeHabit.swaps && urgeHabit.swaps.length > 0 && (
            <div className="p-3 rounded-2xl bg-white/80 dark:bg-white/[0.05] text-xs">
              <span className="font-bold text-[var(--accent)]">Your swap plan: </span>
              <span>{urgeHabit.swaps[0]}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUrgeRunning((r) => !r)}
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-white/10 text-xs font-bold min-h-[44px] inline-flex items-center gap-1.5"
            >
              {urgeRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {urgeRunning ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              onClick={finishUrgeTimer}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] inline-flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Urge passed — finish
            </button>
          </div>
        </section>
      )}

      {/* Active Quit Habits List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold">
            Active habits ({quitItems.length}/3)
          </h3>
          {quitItems.length < 3 && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {showAddForm ? 'Close form' : 'Add habit'}
            </button>
          )}
        </div>

        {quitItems.length >= 3 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Max 3 active habits keeps focus steady. Archive or delete one above before adding another.
          </p>
        )}

        {quitItems.length === 0 ? (
          <div className="ascend-card p-5 text-center space-y-2">
            <p className="text-sm font-bold">No quit habits added yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick one habit below (even discrete “Private habit”) to build a swap plan and use the 10-minute urge timer.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {quitItems.map((item) => {
              const stats = computeQuitHabitStats(item, quitSlips, todayKey);
              const catMeta = item.category ? QUIT_CATEGORY_MAP[item.category] : undefined;
              const hiddenLabel = maskPrivateTitles || item.isPrivate;

              return (
                <article key={item.id} className="ascend-card p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-lg shrink-0">
                        {item.isPrivate ? '🔒' : catMeta?.emoji ?? '🛡️'}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-display text-base font-bold truncate">
                          {hiddenLabel ? 'Private habit' : item.title}
                        </h4>
                        {item.reason && !hiddenLabel && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            Why: {item.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => item.id && db.quitItems.delete(item.id)}
                      aria-label={`Remove ${hiddenLabel ? 'private habit' : item.title}`}
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {item.category === 'alcohol' && (
                    <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        Medical note: If quitting frequent or heavy alcohol/substance use, talk to a doctor first — sudden stopping can require medical care.
                      </span>
                    </div>
                  )}

                  {/* No-Guilt Metrics Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Days in control</p>
                      <p className="font-mono-num text-lg font-bold text-[var(--accent)]">
                        {stats.daysInControl}
                        <span className="text-xs font-normal text-slate-500">/{stats.totalTrackedDays}d</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">30-day rate</p>
                      <p className="font-mono-num text-lg font-bold text-emerald-500">
                        {stats.successRate30d}%
                      </p>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Urges handled</p>
                      <p className="font-mono-num text-lg font-bold">
                        {item.urgesResisted ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* Triggers & If-Then Swap Plan */}
                  {(item.triggers?.length || item.swaps?.length) && (
                    <div className="space-y-1.5 text-xs">
                      {item.triggers && item.triggers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400 font-semibold">Watch triggers:</span>
                          {item.triggers.map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.swaps && item.swaps.length > 0 && (
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold text-[var(--accent)]">Swap plan: </span>
                          {item.swaps[0]}
                        </p>
                      )}
                    </div>
                  )}

                  {stats.recentSlips.length > 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Last tweak saved ({stats.recentSlips[0].date}): “{stats.recentSlips[0].tweak || 'Take a 10-min pause'}”
                    </p>
                  )}

                  {/* Actions: Urge Timer + No-Shame Slip */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => startUrgeTimer(item)}
                      className="py-2.5 px-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] inline-flex items-center justify-center gap-1.5"
                    >
                      <Timer className="w-4 h-4" /> Urge right now
                    </button>
                    <button
                      type="button"
                      onClick={() => openSlipFlow(item)}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
                    >
                      I slipped (adjust)
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Habit Form */}
      {showAddForm && quitItems.length < 3 && (
        <form onSubmit={handleCreateHabit} className="ascend-card p-5 space-y-4">
          <h3 className="font-display text-base font-bold">Start a habit break (max 3 active)</h3>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              1. Pick a category (or keep it private)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {QUIT_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`p-2.5 rounded-2xl border text-left transition min-h-[56px] ${
                      active
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <div className="text-base leading-none mb-1">{cat.emoji}</div>
                    <div className="text-[11px] font-bold leading-tight">{cat.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeCategoryMeta.isMedicalCaution && (
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Medical safety warning</p>
                <p>
                  Heavy alcohol or substance dependence can have dangerous withdrawal symptoms. Consult a doctor or local confidential helpline before stopping suddenly.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Habit label
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={activeCategoryMeta.defaultTitle}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Why I want to stop (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Better sleep, clearer skin, more focus"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Common triggers
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activeCategoryMeta.suggestedTriggers.map((t) => {
                const picked = triggers.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTriggerChip(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold min-h-[38px] border ${
                      picked
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                        : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customTrigger}
                onChange={(e) => setCustomTrigger(e.target.value)}
                placeholder="Add another trigger..."
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
              />
              <button
                type="button"
                onClick={handleAddTrigger}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-white/10 text-xs font-bold min-h-[44px]"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Swap plan (“When I want this, I will do…”)
            </label>
            <input
              type="text"
              value={swapPlan}
              onChange={(e) => setSwapPlan(e.target.value)}
              placeholder={activeCategoryMeta.suggestedSwaps[0]}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
            />
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 cursor-pointer min-h-[44px]">
            <div className="text-xs">
              <p className="font-semibold flex items-center gap-1.5">
                <BellOff className="w-3.5 h-3.5 text-[var(--accent)]" /> Mask label as “Private habit”
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Useful if anyone ever glances at your phone screen.
              </p>
            </div>
            <input
              type="checkbox"
              checked={discretePrivate}
              onChange={(e) => setDiscretePrivate(e.target.checked)}
              className="w-5 h-5 accent-[var(--accent)]"
            />
          </label>

          <button
            type="submit"
            className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
          >
            Save Quit habit
          </button>
        </form>
      )}

      {/* Practical Support & Evidence Cards */}
      <section className="ascend-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold flex items-center gap-1.5">
            <MessageSquareHeart className="w-4 h-4 text-[var(--accent)]" /> Talk to someone (low pressure)
          </h3>
          <button
            type="button"
            onClick={handleCopyTalkMessage}
            className="px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[44px] inline-flex items-center gap-1.5 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" /> Copy text
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.04] p-3 rounded-xl border border-slate-200 dark:border-white/10">
          “{TALK_TEMPLATE}”
        </p>

        {/* Collapsible Phone Screen Time Guide */}
        <button
          type="button"
          onClick={() => setScreenTimeOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
        >
          <span className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[var(--accent)]" />
            Set phone Screen Time / App Timer limits
          </span>
          {screenTimeOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {screenTimeOpen && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
            <p>
              <strong>Android:</strong> Settings → Digital Wellbeing &amp; parental controls → Dashboard → set a 15-min timer on triggering apps + Bedtime mode at night.
            </p>
            <p>
              <strong>iPhone:</strong> Settings → Screen Time → App Limits → Add Limit, plus Downtime 30 minutes before sleep.
            </p>
          </div>
        )}

        {/* Collapsible Fact Cards */}
        <button
          type="button"
          onClick={() => setFactsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
        >
          <span>Why urge surfing &amp; swaps work (evidence &amp; limits)</span>
          {factsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {factsOpen && (
          <div className="space-y-2.5 pt-1">
            {QUIT_FACT_CARDS.map((card) => (
              <div
                key={card.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-white">{card.title}</p>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${
                      card.evidence === 'Proven'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-sky-500/15 text-sky-500'
                    }`}
                  >
                    {card.evidence}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{card.summary}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Honest limit: {card.limitNote}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Shame-free 2-step "I slipped" Modal */}
      {slipHabit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSlipHabit(null);
          }}
        >
          <form
            onSubmit={saveSlipReflection}
            className="w-full max-w-md rounded-t-[26px] sm:rounded-[26px] bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-white/15 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Step {slipStep} of 2 · Zero guilt reset
                </p>
                <h3 className="font-display text-lg font-bold">Slips are data, not a wipeout</h3>
              </div>
              <button
                type="button"
                onClick={() => setSlipHabit(null)}
                aria-label="Close reflection"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {slipStep === 1 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Your past days in control stay saved. What triggered it right before?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(slipHabit.triggers?.length
                    ? slipHabit.triggers
                    : ['Stress', 'Tired / late', 'Boredom', 'Alone']
                  ).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSlipTrigger(t)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[40px] border ${
                        slipTrigger === t
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={slipTrigger}
                  onChange={(e) => setSlipTrigger(e.target.value)}
                  placeholder="Or type what set it off..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setSlipStep(2)}
                  className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
                >
                  Next: One small tweak
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Pick one tiny change to make next time easier:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Leave phone in another room',
                    'Start the 10-min timer immediately',
                    'Go to bed 30 min earlier',
                    'Drink water & walk 5 min',
                  ].map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setSlipTweak(idea)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[40px] border text-left ${
                        slipTweak === idea
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent'
                      }`}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={slipTweak}
                  onChange={(e) => setSlipTweak(e.target.value)}
                  placeholder="One small tweak for next time..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSlipStep(1)}
                    className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-bold min-h-[48px]"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
                  >
                    Save tweak &amp; keep going
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
