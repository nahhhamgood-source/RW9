import React, { useState } from 'react';
import { ChevronDown, ChevronUp, EyeOff, Lightbulb, Sparkles } from 'lucide-react';
import type { DetectedPatternCard } from '../../lib/patterns';
import type { TimeBlock } from '../../types';

interface PatternInsightsCardsProps {
  cards: DetectedPatternCard[];
  insufficientSummary: string | null;
  onDismiss: (patternId: string) => void;
  onMoveBlockTasks: (fromBlock: TimeBlock, toBlock: TimeBlock) => void;
  onOpenFoodBreakfast: () => void;
  onSwitchRestDay: () => void;
}

export const PatternInsightsCards: React.FC<PatternInsightsCardsProps> = ({
  cards,
  insufficientSummary,
  onDismiss,
  onMoveBlockTasks,
  onOpenFoodBreakfast,
  onSwitchRestDay,
}) => {
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);

  if (cards.length === 0) {
    if (!insufficientSummary) return null;
    return (
      <section className="ascend-card p-3.5 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
        <Lightbulb className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
        <p>{insufficientSummary}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5" aria-label="Patterns noticed from your logs">
      {cards.map((card) => {
        const whyOpen = openWhyId === card.id;
        return (
          <div
            key={card.id}
            className="ascend-card p-4 space-y-2.5 border-l-2 border-l-[var(--accent)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>I noticed · {card.title}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 normal-case">
                    {card.evidence}
                  </span>
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {card.headline}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(card.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-500 shrink-0 min-h-[34px]"
              >
                <EyeOff className="w-3 h-3" /> Not useful
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {card.suggestion}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {card.action?.kind === 'move_block' && (
                <button
                  type="button"
                  onClick={() =>
                    onMoveBlockTasks(card.action!.kind === 'move_block' ? card.action!.fromBlock : 'evening', card.action!.kind === 'move_block' ? card.action!.toBlock : 'morning')
                  }
                  className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                >
                  Accept: {card.action.label}
                </button>
              )}
              {card.action?.kind === 'open_food_breakfast' && (
                <button
                  type="button"
                  onClick={onOpenFoodBreakfast}
                  className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                >
                  {card.action.label}
                </button>
              )}
              {card.action?.kind === 'set_rest_day' && (
                <button
                  type="button"
                  onClick={onSwitchRestDay}
                  className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                >
                  {card.action.label}
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpenWhyId((cur) => (cur === card.id ? null : card.id))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--accent)] min-h-[36px]"
              >
                Why?
                {whyOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {whyOpen && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10 leading-relaxed">
                {card.why}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
};
