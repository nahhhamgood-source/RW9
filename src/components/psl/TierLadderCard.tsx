import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import {
  PSL_HONEST_DISCLAIMER,
  PSL_LADDER_RUNGS,
  WHAT_MOVES_PSL,
  getPslTierMeta,
} from '../../lib/faceMetricsConstants';

interface TierLadderCardProps {
  score: number | null;
  slangTierNames?: boolean;
  compact?: boolean;
}

export const TierLadderCard: React.FC<TierLadderCardProps> = ({
  score,
  slangTierNames = true,
  compact = false,
}) => {
  const [showGuide, setShowGuide] = useState(false);
  const currentMeta = score !== null ? getPslTierMeta(score, slangTierNames) : null;

  return (
    <div className="ascend-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
            {slangTierNames ? 'PSL Tier Ladder' : 'Appearance Tier Ladder'}
          </p>
          {currentMeta && score !== null ? (
            <h3 className="font-display text-base sm:text-lg font-bold mt-0.5">
              You are here: <span className="text-[var(--accent)]">{currentMeta.bracketLabel}</span>{' '}
              <span className="font-mono-num text-sm text-slate-500 dark:text-slate-400">
                ({score.toFixed(1)}/8)
              </span>
            </h3>
          ) : (
            <h3 className="font-display text-base font-bold mt-0.5">
              Run a scan to see your baseline tier
            </h3>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[38px]"
        >
          <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
          What moves it?
          {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 6-Rung Ladder */}
      <div className={compact ? 'grid grid-cols-2 sm:grid-cols-3 gap-1.5' : 'space-y-1.5'}>
        {PSL_LADDER_RUNGS.map((rung) => {
          const isCurrent = currentMeta?.id === rung.id;
          const label = slangTierNames ? rung.slangFull : rung.neutralName;
          return (
            <div
              key={rung.id}
              className={`rounded-xl px-3 py-2 border transition flex items-center justify-between gap-2 ${
                isCurrent
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-slate-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-bold ${isCurrent ? 'text-[var(--accent)]' : ''}`}>
                    {label}
                  </span>
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-contrast)] text-[10px] font-bold">
                      You
                    </span>
                  )}
                </div>
                {!compact && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {rung.explanation}
                  </p>
                )}
              </div>
              <span className="font-mono-num text-[11px] font-bold shrink-0 text-slate-500 dark:text-slate-400">
                {rung.rangeLabel}
              </span>
            </div>
          );
        })}
      </div>

      {currentMeta && (
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {currentMeta.constructiveLine}
        </p>
      )}

      {showGuide && (
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-2">
          <div>
            <p className="font-bold text-emerald-600 dark:text-emerald-300">What realistically improves it:</p>
            <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300 list-disc pl-4">
              {WHAT_MOVES_PSL.realisticLevers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-bold text-amber-600 dark:text-amber-300">What does not move it:</p>
            <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300 list-disc pl-4">
              {WHAT_MOVES_PSL.doesNotMove.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-white/10">
            {PSL_HONEST_DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
};
