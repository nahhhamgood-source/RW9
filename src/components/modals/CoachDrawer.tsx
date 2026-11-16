import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Loader2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import {
  addProtocolToPlan,
  isAboutMeItemConfirmed,
  isUnder18OrGrowing,
  saveMealScanEntry,
} from '../../db/database';
import { askOnlineCoach, hasOnlineConsent } from '../../lib/api';
import { answerCoachQuery, type CoachContext } from '../../lib/coach';
import { toLocalDateKey } from '../../lib/date';
import { getPslTierMeta } from '../../lib/faceMetricsConstants';
import { computeDebloatImpact } from '../../lib/nutrition';
import { detectUserPatterns } from '../../lib/patterns';
import { OnlineConsentModal } from './OnlineConsentModal';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, MealFoodItem } from '../../types';

interface CoachDrawerProps {
  open: boolean;
  initialPrompt?: string;
  context: CoachContext;
  settings: AppSettings;
  onClose: () => void;
}

interface UnifiedCoachReply {
  source: 'online' | 'offline';
  title: string;
  reply?: string;
  bullets: string[];
  moreDetail: string;
  suggestedTasks: Array<{ label: string; protocolId: string }>;
  suggestedMeals: Array<{ title: string; calories: number; proteinG: number }>;
  escalateNote?: string;
}

const PRESET_PROMPTS = [
  'What should I do today?',
  'Egyptian breakfast & lunch swaps',
  'Why is my face puffy?',
  'Fix my skin',
  'Explain my scan',
  "I'm having a rough day",
  'Ask about height',
];

/**
 * Builds a compact, numbers + confirmed About-me summary ONLY.
 * Never includes photos, face thumbnails, or private Quit habit names.
 */
function buildContextSummary(ctx: CoachContext, settings: AppSettings): string {
  const today = toLocalDateKey();
  const todayLog = ctx.dailyLogs.find((l) => l.date === today);
  const doneIds = new Set(ctx.completions.filter((c) => c.date === today).map((c) => c.taskId));
  const pendingCount = ctx.tasks.filter((t) => t.enabled && !doneIds.has(t.id)).length;
  const latestScan = ctx.scans[0];
  const tier = latestScan ? getPslTierMeta(latestScan.pslEstimate, true).displayLabel : 'No scan';
  const about = ctx.profile.aboutMe;
  const isRoughDay = Boolean(settings.roughDayDates?.includes(today));
  const dayMode = settings.dayModeByDate?.[today] ?? 'gym';

  const lines: string[] = [
    `Age=${ctx.profile.ageExplicitlySet ? ctx.profile.age : 'unset (teen safety active)'}, Height=${ctx.profile.heightCm}cm, Weight=${ctx.profile.weightKg}kg, Goal=${ctx.profile.dietGoal ?? 'maintain'}`,
    `Today mode=${dayMode}${isRoughDay ? ' (ROUGH DAY MODE)' : ''}, water=${todayLog?.waterMl ?? 0}/${ctx.profile.waterTargetMl}ml, calories=${todayLog?.calories ?? 0}/${ctx.profile.calorieGoal}, protein=${todayLog?.proteinG ?? 0}/${ctx.profile.proteinTargetG}g, sleep=${todayLog?.sleepHours ?? 0}h`,
    `Tasks remaining today=${pendingCount}, Skin=${ctx.profile.skinType}, Hair=${ctx.profile.hairType}`,
    `Latest face scan: ${latestScan ? `${latestScan.pslEstimate}/8 (${tier}, ${latestScan.faceShape})` : 'none'}`,
  ];

  if (about) {
    if (isAboutMeItemConfirmed(about, 'location_foods')) {
      lines.push(`Region=${about.countryRegion}; Everyday foods=${about.localFoods.slice(0, 8).join(', ')}`);
    }
    if (isAboutMeItemConfirmed(about, 'training_camp')) {
      lines.push(
        `Training=${about.trainingDisciplines.join('+')}${about.weightClassKg ? `, WeightClass=${about.weightClassKg}kg` : ''}${about.tournamentDate ? `, Tournament=${about.tournamentDate}` : ''}`
      );
    }
    if (isAboutMeItemConfirmed(about, 'eating_pattern') && about.eatingPattern) {
      lines.push(`Eating note=${about.eatingPattern}`);
    }
    if (isAboutMeItemConfirmed(about, 'support_style') && about.supportStyle) {
      lines.push(`Support preference=${about.supportStyle}`);
    }
  }

  const patterns = detectUserPatterns({
    todayKey: today,
    profile: ctx.profile,
    dailyLogs: ctx.dailyLogs,
    mealScans: ctx.mealScans ?? [],
    workouts: ctx.workouts,
    bodyMetrics: ctx.bodyMetrics ?? [],
    tasks: ctx.tasks,
    completions: ctx.completions,
    dismissedIds: settings.dismissedPatternIds ?? [],
    maxCards: 2,
  });
  if (patterns.cards.length > 0) {
    lines.push(`Detected log patterns: ${patterns.cards.map((c) => c.headline).join(' | ')}`);
  }

  return lines.join('\n');
}

function toOfflineReply(query: string, ctx: CoachContext): UnifiedCoachReply {
  const off = answerCoachQuery(query, ctx);
  return {
    source: 'offline',
    title: off.title,
    bullets: off.bullets,
    moreDetail: off.moreDetail,
    suggestedTasks: off.suggestedActions,
    suggestedMeals: [],
    escalateNote: off.escalateNote,
  };
}

export const CoachDrawer: React.FC<CoachDrawerProps> = ({
  open,
  initialPrompt,
  context,
  settings,
  onClose,
}) => {
  const { showToast } = useToast();
  const [query, setQuery] = useState(initialPrompt ?? '');
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [reply, setReply] = useState<UnifiedCoachReply>(() =>
    toOfflineReply(initialPrompt || 'What should I do today?', context)
  );
  const [pendingOnlineQuestion, setPendingOnlineQuestion] = useState<string | null>(null);

  const onlineAllowed = hasOnlineConsent(settings, 'coach');

  const runQuery = async (text: string, forceOnline = false) => {
    const clean = text.trim();
    if (!clean) return;
    setQuery(clean);
    setShowMore(false);

    const offlineFallback = toOfflineReply(clean, context);
    setReply(offlineFallback);

    const canUseOnline =
      (forceOnline || onlineAllowed) &&
      (typeof navigator === 'undefined' || navigator.onLine);

    if (!canUseOnline) return;

    setLoading(true);
    try {
      const res = await askOnlineCoach({
        message: clean,
        history,
        contextSummary: buildContextSummary(context, settings),
        isUnder18: isUnder18OrGrowing(context.profile),
      });

      if (res.ok) {
        const d = res.data;
        const tasks = d.suggestions
          .filter((s) => s.type === 'task' && s.protocolId)
          .map((s) => ({ label: s.title, protocolId: s.protocolId! }));
        const meals = d.suggestions
          .filter((s) => s.type === 'meal')
          .map((s) => ({
            title: s.title,
            calories: s.calories ?? 400,
            proteinG: s.proteinG ?? 25,
          }));
        setReply({
          source: 'online',
          title: d.title,
          reply: d.reply,
          bullets: d.bullets.length ? d.bullets : [d.reply],
          moreDetail: d.moreDetail,
          suggestedTasks: tasks,
          suggestedMeals: meals,
          escalateNote: d.escalateNote,
        });
        setHistory((prev) => [
          ...prev.slice(-4),
          { role: 'user', text: clean },
          { role: 'assistant', text: d.reply || d.title },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && initialPrompt) {
      runQuery(initialPrompt);
    } else if (open && !initialPrompt) {
      setReply(toOfflineReply(query || 'What should I do today?', context));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    runQuery(query);
  };

  const handleAddTask = async (protocolId: string, label: string) => {
    const added = await addProtocolToPlan(protocolId, 'Coach');
    if (added) {
      showToast(`Added "${label}" to Today`);
    } else {
      showToast(`"${label}" not found in habit templates`, 'info');
    }
  };

  const handleLogMealSuggestion = async (meal: { title: string; calories: number; proteinG: number }) => {
    const item: MealFoodItem = {
      id: `coach-meal-${Date.now()}`,
      name: meal.title,
      portionGrams: 300,
      baseGrams: 300,
      calories: meal.calories,
      proteinG: meal.proteinG,
      carbsG: 0,
      fatsG: 0,
      sodiumMg: 420,
      addedSugarG: 0,
    };
    const debloat = computeDebloatImpact(420, 0);
    await saveMealScanEntry({
      date: toLocalDateKey(),
      timestamp: Date.now(),
      mealTitle: meal.title,
      confidence: 'Medium',
      items: [item],
      totalCalories: meal.calories,
      totalProteinG: meal.proteinG,
      totalCarbsG: 0,
      totalFatsG: 0,
      totalSodiumMg: 420,
      totalAddedSugarG: 0,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: 'Coach suggestion (rough estimate)',
      isManual: true,
    });
    showToast(`Logged "${meal.title}" to Food`);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm no-print"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-white dark:bg-[#080D0A]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-emerald-500/20 p-5 max-h-[88dvh] overflow-y-auto overscroll-y-contain shadow-2xl space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold">ASCEND Coach</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[10px] font-bold">
                  {reply.source === 'online' ? (
                    <>
                      <Cloud className="w-3 h-3 text-[var(--accent)]" /> Online AI
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-slate-400" /> Offline
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {onlineAllowed
                  ? 'This sends a short summary (no photos) to the coach. Turn off in Settings.'
                  : 'Running offline on your local logs. Optional Online AI Coach is off.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Coach"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!onlineAllowed && (
            <div className="p-2.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-700 dark:text-slate-200">
                Want personalized AI Q&amp;A? This sends a short summary (no photos) to the coach. Turn off in Settings.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingOnlineQuestion(query || 'What should I do today?');
                  setConsentOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold shrink-0 min-h-[34px]"
              >
                <Sparkles className="w-3.5 h-3.5" /> Enable Online
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {PRESET_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => runQuery(p)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] text-xs font-medium min-h-[36px] text-left"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold">{reply.title}</h3>
              {loading && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Asking AI...
                </span>
              )}
            </div>

            {reply.reply && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {reply.reply}
              </p>
            )}

            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {reply.bullets.slice(0, 4).map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {reply.moreDetail && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMore(!showMore)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] min-h-[32px]"
                >
                  {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showMore ? 'Less detail' : 'More'}
                </button>
                {showMore && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-200 dark:border-white/10">
                    {reply.moreDetail}
                  </p>
                )}
              </>
            )}

            {(reply.suggestedTasks.length > 0 || reply.suggestedMeals.length > 0) && (
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-2">
                {reply.suggestedTasks.map((act) => (
                  <button
                    key={act.protocolId}
                    type="button"
                    onClick={() => handleAddTask(act.protocolId, act.label)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[38px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Today: {act.label}
                  </button>
                ))}
                {reply.suggestedMeals.map((m) => (
                  <button
                    key={m.title}
                    type="button"
                    onClick={() => handleLogMealSuggestion(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold min-h-[38px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log meal: {m.title}
                  </button>
                ))}
              </div>
            )}

            {reply.escalateNote && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>{reply.escalateNote}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about skin, food swaps, scan, height, or rough day..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base sm:text-sm min-h-[44px]"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Send query"
              className="px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center min-h-[44px] disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <OnlineConsentModal
        open={consentOpen}
        featureName="Online AI Coach"
        settings={settings}
        onAccept={() => {
          setConsentOpen(false);
          if (pendingOnlineQuestion) {
            const q = pendingOnlineQuestion;
            setPendingOnlineQuestion(null);
            runQuery(q, true);
          }
        }}
        onDecline={() => {
          setConsentOpen(false);
          setPendingOnlineQuestion(null);
          showToast('Staying offline — local coach stays active', 'info');
        }}
      />
    </>
  );
};
