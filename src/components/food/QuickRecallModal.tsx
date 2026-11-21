import React, { useMemo, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { RECALL_FOOD_CHIPS, RECALL_PORTION_CHIPS } from '../../data/eventPresets';
import { saveMealScanEntry } from '../../db/database';
import { en } from '../../i18n/en';
import { toLocalDateKey } from '../../lib/date';
import { roundKcal, roundProtein } from '../../lib/foodChatParser';
import { computeDebloatImpact } from '../../lib/nutrition';
import { useToast } from '../ui/ToastProvider';
import type { MealFoodItem, MealType } from '../../types';

interface QuickRecallModalProps {
  open: boolean;
  dateKey?: string;
  initialSlot?: MealType;
  onClose: () => void;
  onSaved?: (entryId: number, slot: MealType) => void;
}

export const QuickRecallModal: React.FC<QuickRecallModalProps> = ({
  open,
  dateKey = toLocalDateKey(),
  initialSlot = 'dinner',
  onClose,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [slot, setSlot] = useState<MealType>(initialSlot);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [portionSize, setPortionSize] = useState<'light' | 'medium' | 'large'>('medium');
  const [saving, setSaving] = useState(false);

  const multiplier = useMemo(
    () => RECALL_PORTION_CHIPS.find((p) => p.id === portionSize)?.multiplier ?? 1,
    [portionSize]
  );

  const selectedChips = useMemo(
    () => RECALL_FOOD_CHIPS.filter((c) => selectedIds.includes(c.id)),
    [selectedIds]
  );

  const summary = useMemo(() => {
    const kcal = roundKcal(
      selectedChips.reduce((s, c) => s + c.kcalPerMedium * multiplier, 0)
    );
    const proteinG = roundProtein(
      selectedChips.reduce((s, c) => s + c.proteinPerMedium * multiplier, 0)
    );
    const sodiumMg = Math.round(
      selectedChips.reduce((s, c) => s + c.sodiumMgPerMedium * multiplier, 0)
    );
    const addedSugarG = Math.round(
      selectedChips.reduce((s, c) => s + c.addedSugarPerMedium * multiplier, 0)
    );
    const minKcal = roundKcal(kcal * 0.8);
    const maxKcal = roundKcal(kcal * 1.25);
    return { kcal, minKcal, maxKcal, proteinG, sodiumMg, addedSugarG };
  }, [selectedChips, multiplier]);

  if (!open) return null;

  const toggleChip = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (selectedChips.length === 0) {
      showToast('Tap 1 or more foods from the chips first.', 'info');
      return;
    }
    setSaving(true);
    try {
      const sizeLabel =
        RECALL_PORTION_CHIPS.find((p) => p.id === portionSize)?.label ?? 'Normal';
      const items: MealFoodItem[] = selectedChips.map((c, idx) => {
        const cKcal = roundKcal(c.kcalPerMedium * multiplier);
        const cPro = roundProtein(c.proteinPerMedium * multiplier);
        return {
          id: `recall-${Date.now()}-${idx}`,
          name: `${c.label} (${sizeLabel.toLowerCase()})`,
          icon: c.icon,
          portionLabel: `${c.portionWord} · ${sizeLabel.toLowerCase()}`,
          confidence: 'Low',
          portionGrams: Math.max(40, Math.round(cKcal * 0.6)),
          baseGrams: Math.max(40, Math.round(cKcal * 0.6)),
          calories: cKcal,
          proteinG: cPro,
          carbsG: Math.round((cKcal * 0.45) / 4),
          fatsG: Math.round((cKcal * 0.3) / 9),
          sodiumMg: Math.round(c.sodiumMgPerMedium * multiplier),
          addedSugarG: Math.round(c.addedSugarPerMedium * multiplier),
        };
      });

      const debloat = computeDebloatImpact(summary.sodiumMg, summary.addedSugarG);
      const rangeLabel = `about ${summary.minKcal}–${summary.maxKcal} kcal`;
      const title = selectedChips.map((c) => c.label).slice(0, 3).join(' + ');

      const id = await saveMealScanEntry({
        date: dateKey,
        timestamp: Date.now(),
        mealType: slot,
        mealTitle: title,
        confidence: 'Low',
        items,
        totalCalories: summary.kcal,
        totalProteinG: summary.proteinG,
        totalCarbsG: Math.round((summary.kcal * 0.45) / 4),
        totalFatsG: Math.round((summary.kcal * 0.3) / 9),
        totalSodiumMg: summary.sodiumMg,
        totalAddedSugarG: summary.addedSugarG,
        debloatStatus: debloat.status,
        debloatHeadline: debloat.headline,
        summaryNote: `${rangeLabel} · 30s recall estimate`,
        isManual: true,
        isEstimate: true,
        estimateRangeLabel: rangeLabel,
        sourceKind: 'recall',
      });
      showToast(`Saved "${title}" (estimate)`);
      onSaved?.(id, slot);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm no-print">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              What did I probably eat?
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              30-second fuzzy-memory recap · Tap food chips, then portion size
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recall mode"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meal slot chips */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlot(s)}
              className={`py-2 px-2 rounded-xl text-xs font-bold min-h-[38px] ${
                slot === s
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200'
              }`}
            >
              {en.meals[s]}
            </button>
          ))}
        </div>

        {/* Step 1: Food group picture chips */}
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
            1. Tap what was on your plate
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {RECALL_FOOD_CHIPS.map((chip) => {
              const active = selectedIds.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleChip(chip.id)}
                  className={`p-2.5 rounded-2xl border text-left transition min-h-[64px] flex flex-col justify-between ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="text-xl">{chip.icon}</span>
                  <span className="text-xs font-bold leading-tight">{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Portion chips */}
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
            2. Overall portion size
          </p>
          <div className="grid grid-cols-3 gap-2">
            {RECALL_PORTION_CHIPS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPortionSize(p.id)}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold min-h-[42px] border ${
                  portionSize === p.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                    : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live summary + Save */}
        <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-mono-num font-bold text-slate-900 dark:text-white">
              {selectedChips.length > 0
                ? `About ${summary.minKcal}–${summary.maxKcal} kcal · ~${summary.proteinG}g protein`
                : 'Pick foods above to see estimate'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Saved as estimate for {dateKey}
            </p>
          </div>
          <button
            type="button"
            disabled={saving || selectedChips.length === 0}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save estimate
          </button>
        </div>
      </div>
    </div>
  );
};
