import React, { useState } from 'react';
import { X, ArrowRight, Check, Zap } from 'lucide-react';
import {
  db,
  isUnder18OrGrowing,
  regenerateProtocolFromProfile,
  saveAndVerifyProfile,
} from '../../db/database';
import { calculateMifflinStJeor } from '../../lib/fitness';
import type {
  FocusAreaId,
  SkinType,
  StillGrowingStatus,
  ToneMode,
  UserProfile,
} from '../../types';
import { useToast } from '../ui/ToastProvider';

interface OnboardingModalProps {
  profile: UserProfile;
  currentTone?: ToneMode;
  onClose: () => void;
}

const FOCUS_OPTIONS: Array<{ id: FocusAreaId; label: string; sub: string }> = [
  { id: 'face', label: 'Face & Skin', sub: 'Clear skin, de-puff, jawline tone' },
  { id: 'body', label: 'Body & Height', sub: 'Posture, sleep, workouts, nutrition' },
  { id: 'mind', label: 'Mind & Focus', sub: 'Study, coding, calm habits' },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  profile,
  currentTone = 'normal',
  onClose,
}) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'quickstart' | 'guided'>('quickstart');
  const [step, setStep] = useState(0); // 0..4 max 5 simple screens in guided mode
  const [tone, setTone] = useState<ToneMode>(currentTone);
  const [form, setForm] = useState<UserProfile>({
    ...profile,
    focusAreas: profile.focusAreas?.length ? profile.focusAreas : ['face', 'body'],
    stillGrowing: profile.stillGrowing ?? (profile.age < 18 ? 'yes' : 'unsure'),
  });
  const [saving, setSaving] = useState(false);

  const toggleFocus = (id: FocusAreaId) => {
    setForm((prev) => {
      const current = prev.focusAreas ?? ['face', 'body'];
      const exists = current.includes(id);
      if (exists && current.length <= 1) return prev;
      const next = exists ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, focusAreas: next };
    });
  };

  const skipSetup = async () => {
    setSaving(true);
    try {
      const skipped: UserProfile = {
        ...profile,
        id: 'me',
        onboardingDone: true,
        onboardingComplete: true,
        onboardingSkipped: true,
        updatedAt: Date.now(),
      };
      await saveAndVerifyProfile(skipped);
      showToast('Ready to go — edit anytime in your profile', 'info');
      onClose();
    } catch {
      showToast('Could not save setup right now.', 'warning', {
        actionLabel: 'Retry',
        onAction: () => void skipSetup(),
      });
    } finally {
      setSaving(false);
    }
  };

  const finishSetup = async () => {
    setSaving(true);
    try {
      const isGuidedAgeConfirmed = mode === 'guided' || profile.ageExplicitlySet === true;
      const formWithAgeFlag: UserProfile = {
        ...form,
        ageExplicitlySet: isGuidedAgeConfirmed,
        onboardingSkipped: false,
      };
      const growingOrMinor = isUnder18OrGrowing(formWithAgeFlag);
      const goalMode = growingOrMinor
        ? 'maintain'
        : form.goals.includes('body_fat')
        ? 'cut'
        : form.goals.includes('training')
        ? 'lean_gain'
        : 'maintain';

      const calc = calculateMifflinStJeor({
        sex: form.sex,
        weightKg: Math.max(30, form.weightKg || 70),
        heightCm: Math.max(100, form.heightCm || 175),
        age: Math.max(10, Math.min(99, form.age || 20)),
        activityLevel: form.activityLevel || 'moderate',
        goalMode,
      });

      const updated: UserProfile = {
        ...formWithAgeFlag,
        id: 'me',
        goals: growingOrMinor ? form.goals.filter((g) => g !== 'body_fat') : form.goals,
        dietGoal: growingOrMinor ? 'maintain' : form.dietGoal ?? goalMode,
        calorieGoal: calc.recommendedCalories,
        proteinTargetG: calc.proteinGrams,
        waterTargetMl: calc.waterMl,
        onboardingDone: true,
        onboardingComplete: true,
        onboardingSkipped: false,
        updatedAt: Date.now(),
      };
      await db.settings.update('app', { tone }).catch(() => {});
      const verified = await saveAndVerifyProfile(updated);
      await regenerateProtocolFromProfile(verified);
      showToast('Your plan is ready');
      onClose();
    } catch {
      showToast('Could not save your setup right now.', 'warning', {
        actionLabel: 'Retry',
        onAction: () => void finishSetup(),
      });
    } finally {
      setSaving(false);
    }
  };

  const totalGuidedSteps = 5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget && (profile.onboardingComplete || profile.onboardingDone)) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-[26px] bg-white dark:bg-[#0C121E]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-sky-400/20 p-5 max-h-[90dvh] overflow-y-auto overscroll-y-contain shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">
              {mode === 'quickstart' ? 'Quick start · 20 seconds' : `Step ${step + 1} of ${totalGuidedSteps}`}
            </p>
            <h2 className="font-display text-xl font-bold mt-0.5">
              {mode === 'quickstart'
                ? 'Set up your daily plan'
                : step === 0
                ? 'What is your name & age?'
                : step === 1
                ? 'Height & weight'
                : step === 2
                ? 'What is your main focus?'
                : step === 3
                ? 'Minutes per day'
                : 'Skin & coach vibe'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={saving}
              onClick={skipSetup}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 min-h-[44px]"
            >
              Skip
            </button>
            {(profile.onboardingComplete || profile.onboardingDone) && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close setup"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mode switcher: 2-question Quick start vs 5-question Guided */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setMode('quickstart')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold min-h-[40px] flex items-center justify-center gap-1.5 transition ${
              mode === 'quickstart'
                ? 'bg-white dark:bg-[#131C2E] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-[var(--accent)]" /> Quick start (2 Qs)
          </button>
          <button
            type="button"
            onClick={() => setMode('guided')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold min-h-[40px] transition ${
              mode === 'guided'
                ? 'bg-white dark:bg-[#131C2E] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Guided (5 steps)
          </button>
        </div>

        {mode === 'quickstart' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold">1. Pick your focus areas</label>
              <div className="space-y-2">
                {FOCUS_OPTIONS.map((f) => {
                  const active = (form.focusAreas ?? []).includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFocus(f.id)}
                      className={`w-full p-3.5 rounded-2xl text-left border min-h-[54px] flex items-center justify-between gap-3 transition ${
                        active
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-slate-900 dark:text-white'
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold">{f.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{f.sub}</p>
                      </div>
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          active
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border border-slate-300 dark:border-white/25'
                        }`}
                      >
                        {active && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold">2. Time per day</label>
              <div className="grid grid-cols-3 gap-2">
                {([15, 30, 60] as const).map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setForm({ ...form, dailyTimeBudgetMin: min })}
                    className={`py-3 rounded-2xl text-sm font-semibold min-h-[48px] transition ${
                      form.dailyTimeBudgetMin === min
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={finishSetup}
              className="w-full py-3.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Building...' : 'Build my plan'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1.5">
              {Array.from({ length: totalGuidedSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= step ? 'bg-[var(--accent)]' : 'bg-slate-200 dark:bg-white/10'
                  }`}
                />
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    First name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Your first name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Age
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={99}
                      value={form.age}
                      onChange={(e) => {
                        const age = Number(e.target.value);
                        setForm({
                          ...form,
                          age,
                          stillGrowing: age < 18 ? 'yes' : form.stillGrowing,
                        });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Sex
                    </label>
                    <select
                      value={form.sex}
                      onChange={(e) =>
                        setForm({ ...form, sex: e.target.value as UserProfile['sex'] })
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    Do you think you are still growing?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'yes', label: 'Yes' },
                      { id: 'no', label: 'No' },
                      { id: 'unsure', label: 'Not sure' },
                    ] as Array<{ id: StillGrowingStatus; label: string }>).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setForm({ ...form, stillGrowing: opt.id })}
                        className={`py-2.5 rounded-xl text-xs font-semibold min-h-[44px] ${
                          form.stillGrowing === opt.id
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'bg-slate-100 dark:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    min={90}
                    max={240}
                    value={form.heightCm}
                    onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    min={25}
                    max={250}
                    step="0.5"
                    value={form.weightKg}
                    onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                {isUnder18OrGrowing(form) && (
                  <p className="col-span-2 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-600 dark:text-slate-300">
                    Since you are under 18 or still growing, we hide weight-loss deficits and focus on food fuel, sleep, and activity.
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                {FOCUS_OPTIONS.map((f) => {
                  const active = (form.focusAreas ?? []).includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFocus(f.id)}
                      className={`w-full p-3.5 rounded-2xl text-left border min-h-[54px] flex items-center justify-between gap-3 ${
                        active
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold">{f.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{f.sub}</p>
                      </div>
                      {active && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { min: 15, desc: '5 quick essentials' },
                    { min: 30, desc: 'Balanced daily habits' },
                    { min: 60, desc: 'Full skin + gym + mind' },
                    { min: 90, desc: 'Deep focus mode' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.min}
                      type="button"
                      onClick={() => setForm({ ...form, dailyTimeBudgetMin: opt.min })}
                      className={`p-3.5 rounded-2xl text-left border min-h-[64px] ${
                        form.dailyTimeBudgetMin === opt.min
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <p className="font-mono-num text-base font-bold">{opt.min} min/day</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    App voice tone
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'normal', title: 'Normal', desc: 'Clear & short' },
                      { id: 'chill', title: 'Chill', desc: 'Friendly' },
                      { id: 'serious', title: 'Serious', desc: 'Direct' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTone(opt.id)}
                        className={`p-3 rounded-2xl text-left border min-h-[54px] ${
                          tone === opt.id
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                            : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <p className="text-sm font-bold">{opt.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    Skin type (optional)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['normal', 'oily', 'dry', 'combination', 'sensitive'] as SkinType[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setForm({ ...form, skinType: st })}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
                          form.skinType === st
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'bg-slate-100 dark:bg-white/5'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/10">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
                >
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < totalGuidedSteps - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={finishSetup}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px] disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Finish & start'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
