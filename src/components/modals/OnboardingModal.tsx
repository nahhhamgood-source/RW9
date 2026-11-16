import React, { useState } from 'react';
import { ArrowRight, Check, HelpCircle, X } from 'lucide-react';
import {
  db,
  isUnder18OrGrowing,
  regenerateProtocolFromProfile,
  saveAndVerifyProfile,
} from '../../db/database';
import { addDays, toLocalDateKey } from '../../lib/date';
import { calculateMifflinStJeor } from '../../lib/fitness';
import type { MainGoalMode, ToneMode, UserProfile, WeighInRule } from '../../types';
import { useToast } from '../ui/ToastProvider';

interface OnboardingModalProps {
  profile: UserProfile;
  currentTone?: ToneMode;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  profile,
  currentTone = 'normal',
  onClose,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [tone, setTone] = useState<ToneMode>(currentTone);
  const [notSureNote, setNotSureNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<UserProfile>({
    ...profile,
    mainGoalMode: profile.mainGoalMode ?? 'both',
    gymDaysPerWeek: profile.gymDaysPerWeek ?? 3,
    mmaDaysPerWeek: profile.mmaDaysPerWeek ?? 2,
    usualWakeTime: profile.usualWakeTime ?? '07:00',
    usualBedtime: profile.usualBedtime ?? '23:00',
    weighInRule: profile.weighInRule ?? 'not_sure',
    focusAreas: profile.focusAreas?.length ? profile.focusAreas : ['face', 'body'],
    stillGrowing: profile.stillGrowing ?? (profile.age < 18 ? 'yes' : 'no'),
  });

  const [tournamentDate, setTournamentDate] = useState(
    profile.aboutMe?.tournamentDate ?? addDays(toLocalDateKey(), 42)
  );
  const [targetWeightKg, setTargetWeightKg] = useState(
    String(profile.aboutMe?.targetWeightKg ?? Math.max(52, Math.round((profile.weightKg || 74) - 2)))
  );

  const ageBlocked = isUnder18OrGrowing(form);
  const showFightCampStep =
    !ageBlocked && (form.mainGoalMode === 'fight_camp' || form.mainGoalMode === 'both');
  const totalSteps = showFightCampStep ? 6 : 5;

  const advance = () => {
    setNotSureNote(null);
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    }
  };

  const skipSetup = async () => {
    setSaving(true);
    try {
      const skipped: UserProfile = {
        ...profile,
        id: 'me',
        ageExplicitlySet: profile.ageExplicitlySet ?? false,
        onboardingDone: true,
        onboardingComplete: true,
        onboardingSkipped: true,
        updatedAt: Date.now(),
      };
      await saveAndVerifyProfile(skipped);
      showToast('Ready — edit details anytime in Settings', 'info');
      onClose();
    } catch {
      showToast('Could not save setup right now.', 'warning');
    } finally {
      setSaving(false);
    }
  };

  const finishSetup = async (overrideProfile?: Partial<UserProfile>) => {
    setSaving(true);
    try {
      const merged: UserProfile = {
        ...form,
        ...overrideProfile,
      };
      const growingOrMinor = isUnder18OrGrowing(merged);
      const goalMode = growingOrMinor
        ? 'maintain'
        : merged.mainGoalMode === 'fight_camp'
        ? 'cut'
        : merged.mainGoalMode === 'both'
        ? 'cut'
        : 'maintain';

      const totalWorkouts = Math.min(
        7,
        (merged.gymDaysPerWeek ?? 3) + (merged.mmaDaysPerWeek ?? 2)
      );
      const activityLevel: UserProfile['activityLevel'] =
        totalWorkouts >= 5 ? 'active' : totalWorkouts >= 3 ? 'moderate' : 'light';

      const calc = calculateMifflinStJeor({
        sex: merged.sex,
        weightKg: Math.max(35, merged.weightKg || 74),
        heightCm: Math.max(120, merged.heightCm || 178),
        age: Math.max(10, Math.min(99, merged.age || 20)),
        activityLevel,
        goalMode,
      });

      const targetKgNum = Number(targetWeightKg);
      const hasValidTarget = Number.isFinite(targetKgNum) && targetKgNum > 35;

      const updated: UserProfile = {
        ...merged,
        id: 'me',
        workoutDaysPerWeek: totalWorkouts,
        activityLevel,
        dietGoal: growingOrMinor ? 'maintain' : goalMode,
        focusAreas:
          merged.mainGoalMode === 'fight_camp'
            ? ['body', 'face']
            : merged.mainGoalMode === 'look_better'
            ? ['face', 'body']
            : ['face', 'body'],
        calorieGoal: calc.recommendedCalories,
        proteinTargetG: calc.proteinGrams,
        waterTargetMl: calc.waterMl,
        aboutMe: {
          ...(merged.aboutMe ?? {
            countryRegion: 'Egypt',
            localFoods: [],
            trainingDisciplines: [],
            tournamentUpcoming: false,
            tournamentDate: null,
            weightClassKg: null,
            currentWeightKg: merged.weightKg,
            targetWeightKg: null,
            eatingPattern: '',
            identityFocus: '',
            supportStyle: '',
            statuses: {},
            deletedKeys: [],
          }),
          currentWeightKg: merged.weightKg,
          tournamentUpcoming: !growingOrMinor && merged.mainGoalMode !== 'look_better',
          tournamentDate: !growingOrMinor && merged.mainGoalMode !== 'look_better' ? tournamentDate || null : null,
          targetWeightKg: !growingOrMinor && merged.mainGoalMode !== 'look_better' && hasValidTarget ? targetKgNum : null,
          weightClassKg: !growingOrMinor && merged.mainGoalMode !== 'look_better' && hasValidTarget ? targetKgNum : null,
          statuses: {
            ...(merged.aboutMe?.statuses ?? {}),
            training_camp: merged.mainGoalMode !== 'look_better' ? 'confirmed' : 'suggested',
          },
          updatedAt: Date.now(),
        },
        onboardingDone: true,
        onboardingComplete: true,
        onboardingSkipped: false,
        updatedAt: Date.now(),
      };

      await db.settings.update('app', { tone }).catch(() => {});
      const verified = await saveAndVerifyProfile(updated);
      await regenerateProtocolFromProfile(verified);
      showToast('Autopilot ready');
      onClose();
    } catch {
      showToast('Could not save your setup right now.', 'warning');
    } finally {
      setSaving(false);
    }
  };

  const applyNotSureForStep = () => {
    if (step === 0) {
      setForm((prev) => ({
        ...prev,
        age: 17,
        ageExplicitlySet: false,
        stillGrowing: 'unsure',
      }));
      setNotSureNote('Picked default: safe growing mode (weight-cut locked until age set).');
      setTimeout(() => advance(), 350);
    } else if (step === 1) {
      setForm((prev) => ({ ...prev, heightCm: 176, weightKg: 74 }));
      setNotSureNote('Picked default: 176 cm · 74 kg (editable anytime).');
      setTimeout(() => advance(), 350);
    } else if (step === 2) {
      setForm((prev) => ({ ...prev, mainGoalMode: 'look_better' }));
      setNotSureNote('Picked default: Look better & steady habits.');
      setTimeout(() => advance(), 350);
    } else if (step === 3) {
      setForm((prev) => ({ ...prev, gymDaysPerWeek: 3, mmaDaysPerWeek: 2 }));
      setNotSureNote('Picked default: 3 gym days · 2 MMA days per week.');
      setTimeout(() => advance(), 350);
    } else if (step === 4) {
      setForm((prev) => ({ ...prev, usualWakeTime: '07:00', usualBedtime: '23:00' }));
      if (showFightCampStep) {
        setNotSureNote('Picked default: Wake 07:00 · Sleep 23:00.');
        setTimeout(() => advance(), 350);
      } else {
        void finishSetup({ usualWakeTime: '07:00', usualBedtime: '23:00' });
      }
    } else if (step === 5) {
      const defDate = addDays(toLocalDateKey(), 42);
      const defKg = String(Math.max(52, Math.round((form.weightKg || 74) - 2)));
      setTournamentDate(defDate);
      setTargetWeightKg(defKg);
      setForm((prev) => ({ ...prev, weighInRule: 'not_sure' }));
      void finishSetup({ weighInRule: 'not_sure' });
    }
  };

  const stepTitles = [
    'How old are you?',
    'Height & current weight',
    'What is your main goal?',
    'Training days per week',
    'Wake & sleep times',
    'Fight camp details',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget && (profile.onboardingComplete || profile.onboardingDone)) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-[26px] bg-white dark:bg-[#0C121E]/95 border border-slate-200 dark:border-sky-400/20 p-5 max-h-[90dvh] overflow-y-auto shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">
              Quick setup · Question {step + 1} of {totalSteps}
            </p>
            <h2 className="font-display text-xl font-bold mt-0.5">{stepTitles[step]}</h2>
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

        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? 'bg-[var(--accent)]' : 'bg-slate-200 dark:bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Question 1: Age */}
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Age</label>
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
                      ageExplicitlySet: true,
                      stillGrowing: age < 18 ? 'yes' : 'no',
                    });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Name (optional)</label>
                <input
                  type="text"
                  placeholder="First name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
                />
              </div>
            </div>
            {form.age < 18 && (
              <p className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-600 dark:text-slate-300">
                Weight-cut tools stay off under 18. Nutrition and training stay full access.
              </p>
            )}
          </div>
        )}

        {/* Question 2: Height + weight */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Height (cm)</label>
              <input
                type="number"
                min={100}
                max={240}
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Weight (kg)</label>
              <input
                type="number"
                min={30}
                max={240}
                step="0.5"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
              />
            </div>
          </div>
        )}

        {/* Question 3: Main goal */}
        {step === 2 && (
          <div className="space-y-2">
            {(
              [
                { id: 'fight_camp', title: 'Fight camp', desc: 'Safe pace to tournament date & training fuel' },
                { id: 'look_better', title: 'Look better', desc: 'Face scan path, skincare, posture, leanness' },
                { id: 'both', title: 'Both', desc: 'Fight camp + daily face, skin & habit stack' },
              ] as Array<{ id: MainGoalMode; title: string; desc: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setForm({ ...form, mainGoalMode: opt.id })}
                className={`w-full p-3.5 rounded-2xl text-left border min-h-[54px] flex items-center justify-between gap-3 ${
                  form.mainGoalMode === opt.id
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                }`}
              >
                <div>
                  <p className="text-sm font-bold">{opt.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{opt.desc}</p>
                </div>
                {form.mainGoalMode === opt.id && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Question 4: Training days per week (gym, MMA) */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Gym days / week</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={form.gymDaysPerWeek ?? 3}
                  onChange={(e) => setForm({ ...form, gymDaysPerWeek: Math.max(0, Math.min(7, Number(e.target.value))) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">MMA days / week</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={form.mmaDaysPerWeek ?? 2}
                  onChange={(e) => setForm({ ...form, mmaDaysPerWeek: Math.max(0, Math.min(7, Number(e.target.value))) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Coach vibe</label>
              <div className="grid grid-cols-3 gap-2">
                {(['normal', 'chill', 'serious'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`py-2.5 rounded-xl text-xs font-bold capitalize min-h-[44px] ${
                      tone === t ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Question 5: Wake and sleep times */}
        {step === 4 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Wake time</label>
              <input
                type="time"
                value={form.usualWakeTime ?? '07:00'}
                onChange={(e) => setForm({ ...form, usualWakeTime: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Sleep time</label>
              <input
                type="time"
                value={form.usualBedtime ?? '23:00'}
                onChange={(e) => setForm({ ...form, usualBedtime: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
              />
            </div>
          </div>
        )}

        {/* Question 6: Conditional Fight camp details */}
        {step === 5 && showFightCampStep && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Tournament date</label>
                <input
                  type="date"
                  value={tournamentDate}
                  onChange={(e) => setTournamentDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Target / class (kg)</label>
                <input
                  type="number"
                  step="0.5"
                  min={40}
                  max={180}
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                Do you know the weigh-in rule?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'same_day', label: 'Same-day' },
                    { id: 'day_before', label: 'Day-before' },
                    { id: 'not_sure', label: 'Not sure' },
                  ] as Array<{ id: WeighInRule; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm({ ...form, weighInRule: opt.id })}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold min-h-[44px] ${
                      form.weighInRule === opt.id
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

        {notSureNote && (
          <p className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
            {notSureNote}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            disabled={saving}
            onClick={applyNotSureForStep}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px] inline-flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[var(--accent)]" /> Not sure
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
              >
                Back
              </button>
            )}

            {step < totalSteps - 1 ? (
              <button
                type="button"
                onClick={advance}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void finishSetup()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px] disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : 'Start plan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
