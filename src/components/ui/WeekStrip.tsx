import React from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, formatShortDay, getWeekDates, parseDateKey, toLocalDateKey } from '../../lib/date';

interface WeekStripProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  completionPctByDate: Record<string, number>;
}

export const WeekStrip: React.FC<WeekStripProps> = ({
  selectedDate,
  onSelectDate,
  completionPctByDate,
}) => {
  const today = toLocalDateKey();
  const weekDates = getWeekDates(selectedDate);

  const monthLabel = parseDateKey(selectedDate).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="ascend-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {monthLabel}
        </span>
        <div className="flex items-center gap-1.5">
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => onSelectDate(today)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 transition min-h-[32px]"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectDate(addDays(selectedDate, -7))}
            aria-label="Previous week"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(addDays(selectedDate, 7))}
            aria-label="Next week"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDates.map((dKey) => {
          const isSelected = dKey === selectedDate;
          const isToday = dKey === today;
          const isFuture = dKey > today;
          const pct = completionPctByDate[dKey] ?? 0;
          const isDone = pct >= 80;
          const dayNum = parseDateKey(dKey).getDate();
          const dayName = formatShortDay(dKey).slice(0, 3);

          return (
            <button
              key={dKey}
              type="button"
              onClick={() => onSelectDate(dKey)}
              className={`flex flex-col items-center justify-center py-2 rounded-2xl transition min-h-[56px] min-w-0 ${
                isSelected
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-bold shadow-[0_0_18px_-4px_var(--accent-glow)]'
                  : isToday
                  ? 'ring-1 ring-[var(--accent)]/60 bg-[var(--accent-soft)] text-slate-900 dark:text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider leading-none ${isSelected ? 'opacity-90' : 'text-slate-500 dark:text-slate-400'}`}>
                {dayName}
              </span>
              <span className="font-mono-num text-sm font-semibold mt-1 leading-none">
                {dayNum}
              </span>
              <span className="mt-1.5 h-3.5 flex items-center justify-center">
                {isDone ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.75} />
                ) : pct > 0 ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-[var(--accent-contrast)]' : 'bg-[var(--accent)]'
                    }`}
                  />
                ) : (
                  <span
                    className={`w-3 h-3 rounded-full border border-dashed ${
                      isFuture
                        ? 'border-slate-300 dark:border-white/15'
                        : isSelected
                        ? 'border-[var(--accent-contrast)]/50'
                        : 'border-slate-300 dark:border-white/20'
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
