import React, { useEffect, useState } from 'react';
import { Check, Loader2, PartyPopper, ShieldCheck, Sparkles, Utensils, X } from 'lucide-react';
import {
  EVENT_OUTCOME_OPTIONS,
  EVENT_PLAN_AHEAD_TIPS,
  EVENT_PRESET_PLATES,
  EVENT_TYPE_META,
  getEventTypeMeta,
  type EventPresetPlate,
} from '../../data/eventPresets';
import {
  endEventModeForDay,
  saveEventOutcomeLog,
  saveMealScanEntry,
  startEventModeForDay,
} from '../../db/database';
import { ARABIC_HINTS } from '../../i18n/arabicHints';
import { toLocalDateKey } from '../../lib/date';
import { roundKcal, roundProtein } from '../../lib/foodChatParser';
import { computeDebloatImpact } from '../../lib/nutrition';
import { useToast } from '../ui/ToastProvider';
import type {
  AppSettings,
  DailyLog,
  EventOutcomeLevel,
  EventType,
  MealFoodItem,
  MealType,
} from '../../types';

interface EventModeModalProps {
  open: boolean;
  dateKey?: string;
  dailyLog?: DailyLog | null;
  settings?: AppSettings | null;
  onClose: () => void;
  onOpenDetailsFlow?: (mode: 'voice' | 'gallery') => void;
}

export const EventModeModal: React.FC<EventModeModalProps> = ({
  open,
  dateKey = toLocalDateKey(),
  dailyLog,
  settings,
  onClose,
  onOpenDetailsFlow,
}) => {
  const { showToast } = useToast();
  const existingType = dailyLog?.eventMode?.type ?? 'wedding';
  const [eventType, setEventType] = useState<EventType>(existingType);
  const [selectedOutcome, setSelectedOutcome] = useState<EventOutcomeLevel>(
    dailyLog?.eventMode?.outcome ?? getEventTypeMeta(existingType).defaultOutcome
  );
  const [platesCount, setPlatesCount] = useState<number>(dailyLog?.eventMode?.platesCount ?? 1);
  const [hadDessert, setHadDessert] = useState<boolean>(dailyLog?.eventMode?.hadDessert ?? false);
  const [showTips, setShowTips] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [presetMult, setPresetMult] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const t = dailyLog?.eventMode?.type ?? 'wedding';
      setEventType(t);
      setSelectedOutcome(dailyLog?.eventMode?.outcome ?? getEventTypeMeta(t).defaultOutcome);
      setPlatesCount(dailyLog?.eventMode?.platesCount ?? 1);
      setHadDessert(dailyLog?.eventMode?.hadDessert ?? false);
    }
  }, [open, dailyLog]);

  if (!open) return null;

  const isEventActive = Boolean(dailyLog?.eventMode?.active);
  const meta = getEventTypeMeta(eventType);

  const handleSelectType = (next: EventType) => {
    setEventType(next);
    if (!dailyLog?.eventMode?.outcome) {
      setSelectedOutcome(getEventTypeMeta(next).defaultOutcome);
    }
  };

  const handleStartEventMode = async () => {
    setSaving(true);
    try {
      await startEventModeForDay(dateKey, eventType);
      showToast(`${meta.label} event mode ON — food reminders paused today.`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleEndEventMode = async () => {
    setSaving(true);
    try {
      await endEventModeForDay(dateKey);
      showToast('Event mode ended — reminders restored.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOutcome = async () => {
    setSaving(true);
    try {
      await saveEventOutcomeLog({
        dateKey,
        eventType,
        outcome: selectedOutcome,
        platesCount,
        hadDessert,
        mealType: 'dinner',
      });
      showToast('Event day logged as estimate. Tomorrow stays a normal day.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleLogPresetPlate = async (preset: EventPresetPlate) => {
    setSaving(true);
    try {
      const kcal = roundKcal(preset.kcalAvg * presetMult);
      const pro = roundProtein(preset.proteinAvgG * presetMult);
      const sod = Math.round(preset.sodiumMg * presetMult);
      const sug = Math.round(preset.addedSugarG * presetMult);
      const minK = roundKcal(preset.kcalMin * presetMult);
      const maxK = roundKcal(preset.kcalMax * presetMult);
      const rangeLabel = `about ${minK}–${maxK} kcal`;
      const mealSlot: MealType = 'dinner';

      const item: MealFoodItem = {
        id: `ev-preset-${Date.now()}`,
        name: `${preset.title}${presetMult !== 1 ? ` (${presetMult}x)` : ''}`,
        icon: preset.icon,
        portionLabel: `${preset.defaultPortionLabel}${presetMult !== 1 ? ` · ${presetMult}x` : ''}`,
        kcalRange: rangeLabel,
        confidence: 'Low',
        portionGrams: Math.round(350 * presetMult),
        baseGrams: 350,
        calories: kcal,
        proteinG: pro,
        carbsG: Math.round((kcal * 0.45) / 4),
        fatsG: Math.round((kcal * 0.33) / 9),
        sodiumMg: sod,
        addedSugarG: sug,
      };
      const debloat = computeDebloatImpact(sod, sug);
      await saveMealScanEntry({
        date: dateKey,
        timestamp: Date.now(),
        mealType: mealSlot,
        mealTitle: item.name,
        confidence: 'Low',
        items: [item],
        totalCalories: kcal,
        totalProteinG: pro,
        totalCarbsG: item.carbsG,
        totalFatsG: item.fatsG,
        totalSodiumMg: sod,
        totalAddedSugarG: sug,
        debloatStatus: debloat.status,
        debloatHeadline: 'Event preset estimate',
        summaryNote: `${rangeLabel} · ${preset.estimateNote}`,
        isManual: true,
        isEstimate: true,
        estimateRangeLabel: rangeLabel,
        sourceKind: 'event_preset',
      });
      await startEventModeForDay(dateKey, eventType);
      showToast(`Added "${preset.title}" (estimate)`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm no-print">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PartyPopper className="w-4 h-4 text-[var(--accent)]" />
              I'm out today — Event mode
              {settings?.arabicHintsEnabled && (
                <span className="text-xs font-normal text-slate-400">({ARABIC_HINTS.outToday})</span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dateKey === toLocalDateKey()
                ? 'Have fun. Food reminders pause and there is zero red/overshoot today.'
                : `Logging event for ${dateKey}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event mode"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Event type chips */}
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
            What kind of day is it?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPE_META.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectType(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold min-h-[38px] border transition ${
                  eventType === t.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                    : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{meta.shortHint}</p>
        </div>

        {/* Toggle Event Mode ON / OFF right away */}
        <div className="flex flex-wrap gap-2">
          {!isEventActive ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleStartEventMode}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 text-[var(--accent)] text-xs font-bold min-h-[42px]"
            >
              <ShieldCheck className="w-4 h-4" />
              Turn ON Event mode now (pause food reminders)
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleEndEventMode}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[42px]"
            >
              End Event mode
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowTips((v) => !v)}
            className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[42px]"
          >
            {showTips ? 'Hide tips' : 'Plan-ahead tips'}
          </button>
        </div>

        {showTips && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              Calm plan-ahead basics (no starving)
            </p>
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-200 list-disc pl-4">
              {EVENT_PLAN_AHEAD_TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* After the event: 1-tap "How did it go?" */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              After the event — How did it go?
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Saves 1 rough estimate (Confidence: Low). You can tweak anytime.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {EVENT_OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOutcome(opt.id)}
                className={`p-2.5 rounded-xl border text-left transition ${
                  selectedOutcome === opt.id
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-slate-900 dark:text-white'
                    : 'bg-white dark:bg-[#0D131F] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                }`}
              >
                <p className="text-xs font-bold">{opt.label}</p>
                <p className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                  {opt.kcalRangeLabel}
                </p>
              </button>
            ))}
          </div>

          {/* Optional quick follow-up: Plates & Dessert */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-semibold">Plates:</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPlatesCount(n)}
                  className={`w-8 h-8 rounded-lg font-bold ${
                    platesCount === n
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHadDessert((v) => !v)}
              className={`px-3 py-1.5 rounded-lg font-bold border ${
                hadDessert
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                  : 'bg-white dark:bg-[#0D131F] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              Dessert: {hadDessert ? 'Yes' : 'No'}
            </button>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveOutcome}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Log event estimate
          </button>
        </div>

        {/* Event Presets Library & Add Details Options */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPresets((v) => !v)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[40px]"
            >
              <Utensils className="w-3.5 h-3.5 text-[var(--accent)]" />
              {showPresets ? 'Hide event plates' : 'Pick specific event plate'}
            </button>
            {onOpenDetailsFlow && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDetailsFlow('voice');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[40px]"
                >
                  <Sparkles className="w-3.5 h-3.5 inline mr-1 text-[var(--accent)]" />
                  Say details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDetailsFlow('gallery');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[40px]"
                >
                  Pick photos
                </button>
              </>
            )}
          </div>

          {showPresets && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Portion scale (all estimates):
                </span>
                <div className="flex gap-1">
                  {[0.5, 1, 1.5, 2].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPresetMult(m)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                        presetMult === m
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {m}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {EVENT_PRESET_PLATES.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handleLogPresetPlate(preset)}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-left flex items-center justify-between gap-2 hover:border-[var(--accent)]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {preset.icon} {preset.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {roundKcal(preset.kcalMin * presetMult)}–{roundKcal(preset.kcalMax * presetMult)} kcal ·{' '}
                        {Math.round(preset.proteinMinG * presetMult)}–{Math.round(preset.proteinMaxG * presetMult)}g pro · estimate
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-[var(--accent)] shrink-0">+ Log</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          No compensation rule: tomorrow stays your normal calorie & protein day — never cut food to "pay back" an outing.
        </p>
      </div>
    </div>
  );
};
