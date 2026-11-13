import React, { useState } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';
import { db, regenerateProtocolFromProfile } from '../../db/database';
import { calculateMifflinStJeor } from '../../lib/fitness';
import type { GymLevel, HairType, SkinType, UserProfile } from '../../types';
import { useToast } from '../ui/ToastProvider';

interface OnboardingModalProps {
  profile: UserProfile;
  onClose: () => void;
}

const SKIN_CONCERNS = ['acne', 'oiliness', 'dryness', 'redness', 'dark_spots', 'texture'];
const HAIR_CONCERNS = ['thinning', 'dandruff', 'frizz', 'flatness', 'dryness'];
const GOAL_OPTIONS = [
  { id: 'skin', label: 'Clearer Skin' },
  { id: 'body_fat', label: 'Lower Body Fat / Definition' },
  { id: 'hair', label: 'Better Hair & Grooming' },
  { id: 'posture', label: 'Sharper Posture' },
  { id: 'sleep', label: 'Sleep & Debloat' },
  { id: 'training', label: 'Strength & Frame' },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ profile, onClose }) => {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<UserProfile>({ ...profile });

  const toggleArr = (field: 'skinConcerns' | 'hairConcerns' | 'goals', val: string) => {
    setForm((prev) => {
      const list = prev[field];
      const next = list.includes(val) ? list.filter((x) => x !== val) : [...list, val];
      return { ...prev, [field]: next };
    });
  };

  const skipSetup = async () => {
    await db.profile.update('me', {
      onboardingSkipped: true,
      onboardingDone: true,
      updatedAt: Date.now(),
    });
    showToast('Setup skipped — editable anytime in Profile or Settings', 'info');
    onClose();
  };

  const saveAndGenerate = async () => {
    const goalMode = form.goals.includes('body_fat') ? 'cut' : form.goals.includes('training') ? 'lean_gain' : 'maintain';
    const calc = calculateMifflinStJeor({
      sex: form.sex,
      weightKg: form.weightKg,
      heightCm: form.heightCm,
      age: form.age,
      activityLevel: form.activityLevel,
      goalMode,
    });
    const updated: UserProfile = {
      ...form,
      calorieGoal: calc.recommendedCalories,
      proteinTargetG: calc.proteinGrams,
      waterTargetMl: calc.waterMl,
      onboardingDone: true,
      onboardingSkipped: false,
      updatedAt: Date.now(),
    };
    await db.profile.put(updated);
    await regenerateProtocolFromProfile(updated);
    showToast('Profile saved & daily protocol built');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 no-print">
      <div className="w-full max-w-lg rounded-[28px] bg-white dark:bg-[#080D0A]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-emerald-500/20 p-5 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">Personal Baseline Setup</p>
            <h2 className="font-display text-xl font-bold mt-0.5">
              {step === 0 ? 'Basics & Body' : step === 1 ? 'Skin & Hair' : 'Training, Sleep & Goals'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skipSetup}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 min-h-[36px]"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close setup"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 mb-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? 'bg-[var(--accent)]' : 'bg-slate-200 dark:bg-white/10'
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">First Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Age</label>
                <input
                  type="number"
                  min={14}
                  max={99}
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sex (for calorie/BF formulas)</label>
              <div className="grid grid-cols-3 gap-2">
                {(['male', 'female', 'other'] as const).map((sx) => (
                  <button
                    key={sx}
                    type="button"
                    onClick={() => setForm({ ...form, sex: sx })}
                    className={`py-2.5 rounded-xl text-xs font-semibold capitalize min-h-[44px] ${
                      form.sex === sx
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {sx}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={form.heightCm}
                  onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.weightKg}
                  onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Waist (opt)</label>
                <input
                  type="number"
                  placeholder="cm"
                  value={form.waistCm ?? ''}
                  onChange={(e) => setForm({ ...form, waistCm: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Skin Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['normal', 'oily', 'dry', 'combination', 'sensitive'] as SkinType[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setForm({ ...form, skinType: st })}
                    className={`py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
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

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Skin Focus Areas</label>
              <div className="flex flex-wrap gap-2">
                {SKIN_CONCERNS.map((c) => {
                  const active = form.skinConcerns.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleArr('skinConcerns', c)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize min-h-[38px] ${
                        active ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]' : 'bg-slate-100 dark:bg-white/5'
                      }`}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Hair Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['straight', 'wavy', 'curly', 'coily', 'thinning'] as HairType[]).map((ht) => (
                  <button
                    key={ht}
                    type="button"
                    onClick={() => setForm({ ...form, hairType: ht })}
                    className={`py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
                      form.hairType === ht
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {ht}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Hair Focus Areas</label>
              <div className="flex flex-wrap gap-2">
                {HAIR_CONCERNS.map((c) => {
                  const active = form.hairConcerns.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleArr('hairConcerns', c)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize min-h-[38px] ${
                        active ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]' : 'bg-slate-100 dark:bg-white/5'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Gym Experience</label>
                <select
                  value={form.gymLevel}
                  onChange={(e) => setForm({ ...form, gymLevel: e.target.value as GymLevel })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Workouts / Week</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={form.workoutDaysPerWeek}
                  onChange={(e) => setForm({ ...form, workoutDaysPerWeek: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Equipment</label>
                <select
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value as UserProfile['equipment'] })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
                >
                  <option value="full_gym">Full Gym</option>
                  <option value="home_dumbbells">Home Dumbbells</option>
                  <option value="none">Bodyweight Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Daily Time Budget</label>
                <select
                  value={form.dailyTimeBudgetMin}
                  onChange={(e) => setForm({ ...form, dailyTimeBudgetMin: Number(e.target.value) as 15 | 30 | 60 | 90 })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
                >
                  <option value={15}>15 min/day</option>
                  <option value={30}>30 min/day</option>
                  <option value={60}>60 min/day</option>
                  <option value={90}>90 min/day</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sleep Target (hrs)</label>
                <input
                  type="number"
                  step="0.5"
                  min={5}
                  max={10}
                  value={form.targetSleepHours}
                  onChange={(e) => setForm({ ...form, targetSleepHours: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sun Exposure</label>
                <select
                  value={form.sunExposure}
                  onChange={(e) => setForm({ ...form, sunExposure: e.target.value as UserProfile['sunExposure'] })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
                >
                  <option value="low">Mostly Indoors</option>
                  <option value="moderate">Moderate Daily</option>
                  <option value="high">High Outdoors</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Primary Priorities</label>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_OPTIONS.map((g) => {
                  const active = form.goals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleArr('goals', g.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold text-left min-h-[40px] ${
                        active ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]' : 'bg-slate-100 dark:bg-white/5'
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
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

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={saveAndGenerate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
            >
              <Check className="w-4 h-4" />
              Save &amp; Build Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
