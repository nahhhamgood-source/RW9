import React from 'react';
import { Award, X } from 'lucide-react';
import { getWinBannerCopy } from '../../i18n/en';
import type { ToneMode } from '../../types';

export type WinMilestoneKind =
  | 'first_scan'
  | 'streak_7'
  | 'weight_milestone'
  | 'level_up'
  | 'journey_level';

interface WinMomentBannerProps {
  kind: WinMilestoneKind;
  tone?: ToneMode;
  onDismiss: () => void;
}

export const WinMomentBanner: React.FC<WinMomentBannerProps> = ({
  kind,
  tone = 'normal',
  onDismiss,
}) => {
  const copy = getWinBannerCopy(kind, tone);

  return (
    <div
      role="status"
      className="ascend-card p-3.5 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
          <Award className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{copy.title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{copy.subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss win banner"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white/10 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
