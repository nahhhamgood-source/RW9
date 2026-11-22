import React from 'react';
import { Check, Terminal, X } from 'lucide-react';
import type { ActiveProtocolTask, AppSettings } from '../../types';

interface OperatorConsoleCardProps {
  settings: AppSettings;
  ringPct: number;
  todayVotes: number;
  campDaysLeft: number | null;
  nextTask: ActiveProtocolTask | null;
  onRunNext?: (task: ActiveProtocolTask) => void;
  onHideConsole: () => void;
}

export const OperatorConsoleCard: React.FC<OperatorConsoleCardProps> = ({
  ringPct,
  todayVotes,
  campDaysLeft,
  nextTask,
  onRunNext,
  onHideConsole,
}) => {
  return (
    <div className="ascend-card p-3.5 border border-[var(--accent)]/35 space-y-2.5 font-mono-num">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[var(--accent)] text-xs font-bold">
          <Terminal className="w-3.5 h-3.5" />
          <span>OPERATOR CONSOLE</span>
        </div>
        <button
          type="button"
          onClick={onHideConsole}
          aria-label="Hide operator console"
          className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Hide
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
          <p className="text-[10px] text-slate-400 uppercase">Ring</p>
          <p className="text-sm font-bold text-[var(--accent)]">{ringPct}%</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
          <p className="text-[10px] text-slate-400 uppercase">Camp</p>
          <p className="text-sm font-bold">
            {campDaysLeft !== null ? `${campDaysLeft}d` : '—'}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
          <p className="text-[10px] text-slate-400 uppercase">Votes</p>
          <p className="text-sm font-bold">{todayVotes}</p>
        </div>
      </div>

      {nextTask ? (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/30">
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--accent)] font-bold uppercase">Next Action</p>
            <p className="text-xs font-semibold truncate">{nextTask.title}</p>
          </div>
          {onRunNext && (
            <button
              type="button"
              onClick={() => onRunNext(nextTask)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-bold shrink-0 min-h-[34px]"
            >
              <Check className="w-3.5 h-3.5" /> Run
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-400 font-semibold">
          All scheduled Today items complete. Protect recovery.
        </p>
      )}
    </div>
  );
};
