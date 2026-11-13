import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Droplets,
  Plus,
  ShieldAlert,
  Sparkles,
  Wind,
} from 'lucide-react';
import { addProtocolToPlan, db, getOrCreateDailyLog } from '../db/database';
import type { DailyLog } from '../types';
import { useToast } from './ui/ToastProvider';

interface InteractiveDailyCheckinProps {
  selectedDate: string;
  dailyLog?: DailyLog;
  waterTargetMl: number;
}

export const InteractiveDailyCheckin: React.FC<InteractiveDailyCheckinProps> = ({
  selectedDate,
  dailyLog,
  waterTargetMl,
}) => {
  const { showToast } = useToast();

  const mewingHours = dailyLog?.mewingHours ?? 0;
  const chewingMinutes = dailyLog?.chewingMinutes ?? 0;
  const postureScore = dailyLog?.postureScore ?? 0;
  const waterMl = dailyLog?.waterMl ?? 0;
  const puffiness = dailyLog?.morningPuffiness ?? null;
  const jawDiscomfort = dailyLog?.jawDiscomfort ?? false;

  const updateLogField = async (patch: Partial<DailyLog>) => {
    await getOrCreateDailyLog(selectedDate);
    await db.dailyLogs.update(selectedDate, {
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const handleAddWater = async (deltaMl: number) => {
    const log = await getOrCreateDailyLog(selectedDate);
    const nextWater = Math.max(0, (log.waterMl ?? 0) + deltaMl);
    await db.dailyLogs.update(selectedDate, {
      waterMl: nextWater,
      updatedAt: Date.now(),
    });
    showToast(`+${deltaMl} ml water logged`);
  };

  const handlePuffinessSelect = async (val: 'none' | 'mild' | 'noticeable') => {
    await updateLogField({ morningPuffiness: val });
    showToast(
      val === 'none'
        ? 'Morning check saved: sharp & clear'
        : 'Debloat flow unlocked below',
      val === 'none' ? 'success' : 'info'
    );
  };

  const handleJawToggle = async (hasTension: boolean) => {
    await updateLogField({
      jawDiscomfort: hasTension,
      ...(hasTension ? { chewingMinutes: 0 } : {}),
    });
    showToast(
      hasTension
        ? 'Jaw safety alert active — pause chewing strain'
        : 'Jaw comfort saved: relaxed',
      hasTension ? 'warning' : 'success'
    );
  };

  const handleQuickAddProtocol = async (protocolId: string, label: string) => {
    const added = await addProtocolToPlan(protocolId, 'Daily Interactive Check-In');
    if (added) {
      showToast(`Added "${label}" to Today's Protocol`);
    }
  };

  const waterPct = Math.min(100, Math.round((waterMl / Math.max(500, waterTargetMl)) * 100));

  return (
    <div className="ascend-card p-4 sm:p-5 space-y-5 hover:border-[var(--accent)]/35">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            Interactive Daily Tracking &amp; Flow
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Adjust posture, safe meal chewing, hydration, and morning diagnostic prompts
          </p>
        </div>
        <span className="font-mono-num text-xs font-semibold text-[var(--accent)]">
          {waterPct}% hydrated
        </span>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Nasal & Relaxed Tongue Posture */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-[var(--accent)]" />
              Nasal / Tongue Rest
            </span>
            <span className="font-mono-num text-sm font-bold text-[var(--accent)]">
              {mewingHours}h
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={mewingHours}
            aria-label="Nasal and relaxed tongue posture hours"
            onChange={(e) => updateLogField({ mewingHours: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] cursor-pointer h-2 rounded-lg"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Gentle palate rest &amp; nasal breathing · Submental tone only (not proven for adult bone)
          </p>
        </div>

        {/* Cervical & Thoracic Posture Consistency */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Posture Consistency</span>
            <span className="font-mono-num text-sm font-bold text-[var(--accent)]">
              {postureScore}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={postureScore}
            aria-label="Posture consistency percentage"
            onChange={(e) => updateLogField({ postureScore: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] cursor-pointer h-2 rounded-lg"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Eye-level screens, stacked cervical spine, and scapular alignment
          </p>
        </div>

        {/* Balanced Whole-Food Chewing Awareness */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Balanced Meal Chewing</span>
            <span className="font-mono-num text-sm font-bold text-[var(--accent)]">
              {chewingMinutes}m
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={45}
            step={5}
            disabled={jawDiscomfort}
            value={chewingMinutes}
            aria-label="Balanced chewing duration minutes"
            onChange={(e) => updateLogField({ chewingMinutes: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] cursor-pointer h-2 rounded-lg disabled:opacity-40"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Even left/right whole-food chewing · Avoid hard silicone blocks or strain
          </p>
        </div>

        {/* Instant Hydration Stepper */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
              Hydration Pulse
            </span>
            <span className="font-mono-num text-xs font-bold">
              {waterMl} / {waterTargetMl} ml
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${waterPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleAddWater(250)}
              className="py-2 rounded-xl bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 hover:border-[var(--accent)]/50 text-xs font-semibold min-h-[40px] transition active:scale-95"
            >
              +250 ml
            </button>
            <button
              type="button"
              onClick={() => handleAddWater(500)}
              className="py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 text-xs font-semibold min-h-[40px] transition active:scale-95"
            >
              +500 ml
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Decision Prompts */}
      <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Prompt 1: Morning Puffiness */}
          <div className="space-y-2">
            <p className="text-xs font-semibold">Did you wake up puffy today?</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'none', label: 'Sharp' },
                { id: 'mild', label: 'Mild' },
                { id: 'noticeable', label: 'Puffy' },
              ] as const).map((opt) => {
                const active = puffiness === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePuffinessSelect(opt.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold min-h-[42px] transition border ${
                      active
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                        : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 hover:border-[var(--accent)]/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt 2: Jaw Comfort */}
          <div className="space-y-2">
            <p className="text-xs font-semibold">Any jaw tension or clicking?</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleJawToggle(false)}
                className={`py-2 px-2 rounded-xl text-xs font-semibold min-h-[42px] transition border flex items-center justify-center gap-1.5 ${
                  !jawDiscomfort
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Relaxed
              </button>
              <button
                type="button"
                onClick={() => handleJawToggle(true)}
                className={`py-2 px-2 rounded-xl text-xs font-semibold min-h-[42px] transition border flex items-center justify-center gap-1.5 ${
                  jawDiscomfort
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Tense / Click
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Debloat Decision Output */}
        {(puffiness === 'mild' || puffiness === 'noticeable') && (
          <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 space-y-2.5 text-xs">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {puffiness === 'noticeable'
                    ? 'Debloat Protocol Recommended'
                    : 'Light Morning Debloat Check'}
                </p>
                <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                  Prioritize 500 ml water + potassium-rich whole foods (spinach, banana, avocado) and a brisk 15–25 min outdoor walk to clear overnight fluid retention.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickAddProtocol('hydration-sodium-sugar', 'Low-Sodium Check')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Low-Sodium Check
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddProtocol('training-zone2-walk', 'Daily Step & Walk Goal')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 font-semibold min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Walk Goal
              </button>
            </div>
          </div>
        )}

        {/* Dynamic TMJ / Jaw Safety Output */}
        {jawDiscomfort && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2.5 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                TMJ Safety Mode Active
              </p>
              <p className="text-amber-800 dark:text-amber-200/90">
                Keep teeth gently apart with lips relaxed, avoid all gum or tough chewing today, and consult a dentist if clicking or pain continues.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
