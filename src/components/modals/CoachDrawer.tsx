import React, { useState } from 'react';
import { X, Send, Plus, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { addProtocolToPlan } from '../../db/database';
import { answerCoachQuery, type CoachContext, type CoachResponse } from '../../lib/coach';
import { useToast } from '../ui/ToastProvider';

interface CoachDrawerProps {
  open: boolean;
  context: CoachContext;
  onClose: () => void;
}

const PRESET_PROMPTS = [
  'Why is my face puffy?',
  'What should I do today?',
  'Fix my skin',
  'Explain my scan',
  'What haircut suits me?',
  'Analyze my month',
];

export const CoachDrawer: React.FC<CoachDrawerProps> = ({ open, context, onClose }) => {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<CoachResponse>(() =>
    answerCoachQuery('What should I do today?', context)
  );
  const [showMore, setShowMore] = useState(false);

  if (!open) return null;

  const runQuery = (text: string) => {
    setQuery(text);
    setResponse(answerCoachQuery(text, context));
    setShowMore(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    runQuery(query);
  };

  const handleAddTask = async (protocolId: string, label: string) => {
    const added = await addProtocolToPlan(protocolId, 'Offline Coach');
    if (added) {
      showToast(`Added "${label}" to today's plan`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm no-print">
      <div className="w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-white dark:bg-[#080D0A]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-emerald-500/20 p-5 max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-bold">Offline Coach</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic · Reads only your local logs &amp; scans
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Coach"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
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
          <h3 className="font-display text-base font-semibold">{response.title}</h3>
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {response.bullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--accent)] font-bold">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

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
              {response.moreDetail}
            </p>
          )}

          {response.suggestedActions.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-2">
              {response.suggestedActions.map((act) => (
                <button
                  key={act.protocolId}
                  type="button"
                  onClick={() => handleAddTask(act.protocolId, act.label)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {act.label}
                </button>
              ))}
            </div>
          )}

          {response.escalateNote && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>{response.escalateNote}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about skin, bloat, scan, haircut, month..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
          />
          <button
            type="submit"
            aria-label="Send query"
            className="px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center min-h-[44px]"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
