import React, { useState } from 'react';
import { ArrowLeftRight, Check, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  applyDirectPortionEdit,
  buildEditablePortionChips,
  formatKcalEstimate,
  roundProtein,
} from '../../lib/foodChatParser';
import { formatDisplayNumber } from '../../i18n/arabicHints';
import type { DraftFoodItem } from './foodChatTypes';

interface FoodResultCardProps {
  item: DraftFoodItem;
  arabicDigits?: boolean;
  showProteinFeedback?: boolean;
  onUpdateItem: (updated: DraftFoodItem) => void;
  onSwapItem: (item: DraftFoodItem) => void;
  onRemoveItem: (id: string) => void;
  onSaveItem?: (item: DraftFoodItem) => void;
  saving?: boolean;
}

export const FoodResultCard: React.FC<FoodResultCardProps> = ({
  item,
  arabicDigits = false,
  showProteinFeedback = false,
  onUpdateItem,
  onSwapItem,
  onRemoveItem,
  onSaveItem,
  saving = false,
}) => {
  const [editingPortion, setEditingPortion] = useState(false);
  const portionChips = buildEditablePortionChips(item);
  const proteinWhole = roundProtein(item.proteinG);

  const proteinBadge =
    showProteinFeedback && (item.kcal >= 100 || proteinWhole >= 10)
      ? proteinWhole >= 15
        ? { label: 'protein: good for you', tone: 'good' as const }
        : { label: 'protein: low for you', tone: 'low' as const }
      : null;

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center text-xl shrink-0"
            aria-hidden="true"
          >
            {item.icon || '🍽️'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {item.name}
              </p>
              {item.nameAr && (
                <span className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">
                  {item.nameAr}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Portion: <strong>{item.portionLabel}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemoveItem(item.id)}
          aria-label={`Remove ${item.name}`}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Estimates row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono-num font-bold text-slate-900 dark:text-white">
          {formatDisplayNumber(formatKcalEstimate(item), arabicDigits)}
        </span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
          {formatDisplayNumber(`${proteinWhole} g protein`, arabicDigits)}
        </span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span
          className={`text-[11px] font-semibold ${
            item.confidence === 'High'
              ? 'text-emerald-600 dark:text-emerald-300'
              : item.confidence === 'Medium'
              ? 'text-sky-600 dark:text-sky-300'
              : 'text-amber-600 dark:text-amber-300'
          }`}
        >
          {item.confidence} confidence
        </span>
        {proteinBadge && (
          <>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span
              className={`text-[11px] font-bold ${
                proteinBadge.tone === 'good'
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : 'text-amber-600 dark:text-amber-300'
              }`}
            >
              {proteinBadge.label}
            </span>
          </>
        )}
      </div>

      {/* Inline everyday portion chips editor (NEVER grams) */}
      {editingPortion && (
        <div className="p-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Pick portion in everyday size:
            </span>
            <button
              type="button"
              onClick={() => setEditingPortion(false)}
              aria-label="Close portion chips"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {portionChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  onUpdateItem(applyDirectPortionEdit(item, chip));
                  setEditingPortion(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[40px] border transition ${
                  item.portionLabel === chip.value
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                    : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => setEditingPortion((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
          Edit portion
        </button>
        <button
          type="button"
          onClick={() => onSwapItem(item)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Swap food
        </button>
        {onSaveItem && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSaveItem(item)}
            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            <Check className="w-3.5 h-3.5" />
            Save
          </button>
        )}
      </div>
    </div>
  );
};
