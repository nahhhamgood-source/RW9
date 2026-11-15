import React, { useState } from 'react';
import { Cloud, ShieldCheck, X } from 'lucide-react';
import { db } from '../../db/database';
import { en } from '../../i18n/en';
import type { AppSettings } from '../../types';

interface OnlineConsentModalProps {
  open: boolean;
  featureName: 'AI Food Scan' | 'Online AI Coach';
  settings: AppSettings;
  onAccept: () => void;
  onDecline: () => void;
}

export const OnlineConsentModal: React.FC<OnlineConsentModalProps> = ({
  open,
  featureName,
  settings,
  onAccept,
  onDecline,
}) => {
  const [foodEnabled, setFoodEnabled] = useState(
    featureName === 'AI Food Scan' ? true : Boolean(settings.onlineFoodEnabled)
  );
  const [coachEnabled, setCoachEnabled] = useState(
    featureName === 'Online AI Coach' ? true : Boolean(settings.onlineCoachEnabled)
  );

  if (!open) return null;

  const handleSave = async () => {
    await db.settings.update('app', {
      onlineConsentSeen: true,
      onlineFoodEnabled: foodEnabled,
      onlineCoachEnabled: coachEnabled,
    });
    const enabledRequested =
      featureName === 'AI Food Scan' ? foodEnabled : coachEnabled;
    if (enabledRequested) {
      onAccept();
    } else {
      onDecline();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDecline();
      }}
    >
      <div className="w-full max-w-md rounded-[26px] bg-white dark:bg-[#0C121E]/95 border border-slate-200 dark:border-sky-400/20 p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                Privacy &amp; Consent
              </p>
              <h2 className="font-display text-lg font-bold">{en.privacy.consentTitle}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onDecline}
            aria-label="Close consent dialog"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {en.privacy.consentBody}
        </p>

        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 cursor-pointer min-h-[52px]">
            <div>
              <p className="text-xs font-bold">AI Food Photo Scan</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sends resized meal photo only when you tap scan
              </p>
            </div>
            <input
              type="checkbox"
              checked={foodEnabled}
              onChange={(e) => setFoodEnabled(e.target.checked)}
              className="w-5 h-5 accent-[var(--accent)]"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 cursor-pointer min-h-[52px]">
            <div>
              <p className="text-xs font-bold">Online AI Coach</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sends chat prompt + brief summary; otherwise uses offline coach
              </p>
            </div>
            <input
              type="checkbox"
              checked={coachEnabled}
              onChange={(e) => setCoachEnabled(e.target.checked)}
              className="w-5 h-5 accent-[var(--accent)]"
            />
          </label>
        </div>

        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Face scans never leave your device. You can change these toggles anytime in Settings → Online features.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
          >
            Stay Offline
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            Save &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
};
