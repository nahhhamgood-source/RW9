import React, { useState } from 'react';
import { X, Droplets, Flame, Moon, Scale, Smile, Sparkles, AlertTriangle } from 'lucide-react';
import { db, getOrCreateDailyLog, recalculateXpAndBadges } from '../../db/database';
import { toLocalDateKey } from '../../lib/date';
import { calculateUSNavyBodyFat, computeBmi } from '../../lib/fitness';
import type { UserProfile } from '../../types';
import { useToast } from '../ui/ToastProvider';

type QuickTab = 'water' | 'nutrition' | 'sleep' | 'body' | 'mood' | 'skin';

interface QuickLogSheetProps {
  open: boolean;
  initialTab?: QuickTab;
  dateKey: string;
  profile: UserProfile;
  onClose: () => void;
  onOpenSkinLab?: () => void;
}

const MOOD_FACES = [
  { val: 1, icon: '😞', label: 'Low' },
  { val: 2, icon: '😕', label: 'Tired' },
  { val: 3, icon: '😐', label: 'Okay' },
  { val: 4, icon: '🙂', label: 'Good' },
  { val: 5, icon: '😄', label: 'Sharp' },
];

export const QuickLogSheet: React.FC<QuickLogSheetProps> = ({
  open,
  initialTab = 'water',
  dateKey,
  profile,
  onClose,
  onOpenSkinLab,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<QuickTab>(initialTab);
  const [waterAdd, setWaterAdd] = useState(250);
  const [proteinAdd, setProteinAdd] = useState(30);
  const [caloriesInput, setCaloriesInput] = useState('');
  const [sleepHours, setSleepHours] = useState('7.5');
  const [sleepQuality, setSleepQuality] = useState(4);
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [weightKg, setWeightKg] = useState(String(profile.weightKg || 74));
  const [waistCm, setWaistCm] = useState(profile.waistCm ? String(profile.waistCm) : '');
  const [neckCm, setNeckCm] = useState(profile.neckCm ? String(profile.neckCm) : '');
  const [stepsInput, setStepsInput] = useState('');
  const [skinHydration, setSkinHydration] = useState(4);
  const [skinIrritation, setSkinIrritation] = useState(0);
  const [skinBreakouts, setSkinBreakouts] = useState(0);
  const [skinNotes, setSkinNotes] = useState('');
  const [careCaution, setCareCaution] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setCareCaution(null);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const logWater = async (ml: number) => {
    const log = await getOrCreateDailyLog(dateKey);
    await db.dailyLogs.update(dateKey, {
      waterMl: Math.max(0, log.waterMl + ml),
      updatedAt: Date.now(),
    });
    showToast(`Added ${ml} ml water`);
    onClose();
  };

  const logNutrition = async (e: React.FormEvent) => {
    e.preventDefault();
    const log = await getOrCreateDailyLog(dateKey);
    const cal = caloriesInput ? Number(caloriesInput) : log.calories;
    if (caloriesInput && cal > 0 && cal < 1200) {
      setCareCaution(
        `You entered ${cal} kcal. Very low calorie targets risk muscle loss, fatigue, and hair/skin dullness. Keep intake at or above safe maintenance floors and talk to a doctor if restricting severely.`
      );
    }
    await db.dailyLogs.update(dateKey, {
      proteinG: Math.max(0, log.proteinG + Number(proteinAdd || 0)),
      calories: Math.max(0, cal),
      steps: stepsInput ? Number(stepsInput) : log.steps,
      updatedAt: Date.now(),
    });
    showToast('Nutrition & activity updated');
    if (!(caloriesInput && cal > 0 && cal < 1200)) onClose();
  };

  const logSleep = async (e: React.FormEvent) => {
    e.preventDefault();
    await getOrCreateDailyLog(dateKey);
    const hrs = Math.max(0, Math.min(20, Number(sleepHours) || 0));
    await db.dailyLogs.update(dateKey, {
      sleepHours: hrs,
      sleepQuality,
      bedtime,
      wakeTime,
      updatedAt: Date.now(),
    });
    showToast(`Logged ${hrs}h sleep`);
    onClose();
  };

  const logBody = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weightKg);
    if (!w || w < 30 || w > 300) {
      showToast('Enter a valid weight (30–300 kg)', 'warning');
      return;
    }
    const waist = waistCm ? Number(waistCm) : null;
    const neck = neckCm ? Number(neckCm) : null;
    const bf =
      waist && neck
        ? calculateUSNavyBodyFat({
            sex: profile.sex,
            heightCm: profile.heightCm,
            waistCm: waist,
            neckCm: neck,
          })?.bodyFatPct ?? null
        : null;

    await db.bodyMetrics.add({
      date: dateKey,
      weightKg: w,
      waistCm: waist,
      neckCm: neck,
      bodyFatPct: bf,
      createdAt: Date.now(),
    });
    await db.profile.update('me', {
      weightKg: w,
      waistCm: waist ?? profile.waistCm,
      neckCm: neck ?? profile.neckCm,
      updatedAt: Date.now(),
    });

    const bmi = computeBmi(w, profile.heightCm);
    if (bmi > 0 && bmi < 17.5) {
      setCareCaution(
        `Estimated BMI is ${bmi} (underweight range). Please prioritize nourishment and consult a healthcare professional before pursuing further weight reduction.`
      );
      showToast('Measurement saved with care note', 'warning');
      return;
    }

    showToast('Body measurement saved');
    onClose();
  };

  const logMood = async (val: number) => {
    await getOrCreateDailyLog(dateKey);
    await db.dailyLogs.update(dateKey, {
      mood: val,
      energy: val,
      updatedAt: Date.now(),
    });
    showToast('Mood check-in saved');
    onClose();
  };

  const logSkinNote = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.skinEntries.add({
      date: dateKey || toLocalDateKey(),
      hydrationRating: skinHydration,
      irritationLevel: skinIrritation,
      breakoutsCount: skinBreakouts,
      notes: skinNotes.trim(),
      productsUsed: [],
      createdAt: Date.now(),
    });
    await recalculateXpAndBadges();
    showToast('Skin note saved to Skin Lab');
    onClose();
  };

  const tabs: Array<{ id: QuickTab; label: string; icon: React.ReactNode }> = [
    { id: 'water', label: 'Water', icon: <Droplets className="w-4 h-4" /> },
    { id: 'nutrition', label: 'Protein', icon: <Flame className="w-4 h-4" /> },
    { id: 'sleep', label: 'Sleep', icon: <Moon className="w-4 h-4" /> },
    { id: 'body', label: 'Weight', icon: <Scale className="w-4 h-4" /> },
    { id: 'mood', label: 'Mood', icon: <Smile className="w-4 h-4" /> },
    { id: 'skin', label: 'Skin Note', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm no-print">
      <div className="w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-white dark:bg-[#080D0A]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-emerald-500/20 p-5 max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold">Quick Log</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Logging for {dateKey}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick Log"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[40px] transition ${
                tab === t.id
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {careCaution && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold mb-0.5">Care Check</p>
              <p>{careCaution}</p>
            </div>
          </div>
        )}

        {tab === 'water' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[250, 500, 750].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => logWater(amt)}
                  className="py-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] font-mono-num text-sm font-semibold min-h-[48px]"
                >
                  +{amt} ml
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={waterAdd}
                onChange={(e) => setWaterAdd(Number(e.target.value))}
                min={50}
                max={2000}
                step={50}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => logWater(waterAdd)}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
              >
                Add Water
              </button>
            </div>
          </div>
        )}

        {tab === 'nutrition' && (
          <form onSubmit={logNutrition} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Add Protein (grams)
              </label>
              <div className="flex gap-2 mb-2">
                {[20, 30, 45].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setProteinAdd(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono-num font-semibold ${
                      proteinAdd === g
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    +{g}g
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={proteinAdd}
                onChange={(e) => setProteinAdd(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Total Daily Calories (optional)
                </label>
                <input
                  type="number"
                  placeholder={String(profile.calorieGoal)}
                  value={caloriesInput}
                  onChange={(e) => setCaloriesInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Total Steps (optional)
                </label>
                <input
                  type="number"
                  placeholder="8500"
                  value={stepsInput}
                  onChange={(e) => setStepsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
            >
              Save Nutrition &amp; Steps
            </button>
          </form>
        )}

        {tab === 'sleep' && (
          <form onSubmit={logSleep} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Hours</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="18"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Bedtime</label>
                <input
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Wake</label>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                Sleep Quality (1–5)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSleepQuality(q)}
                    className={`py-2.5 rounded-xl font-mono-num text-sm font-semibold min-h-[44px] ${
                      sleepQuality === q
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
            >
              Save Sleep Log
            </button>
          </form>
        )}

        {tab === 'body' && (
          <form onSubmit={logBody} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Waist (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="Optional"
                  value={waistCm}
                  onChange={(e) => setWaistCm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Neck (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="Optional"
                  value={neckCm}
                  onChange={(e) => setNeckCm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
            >
              Save Measurement
            </button>
          </form>
        )}

        {tab === 'mood' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">How are you feeling today?</p>
            <div className="grid grid-cols-5 gap-2">
              {MOOD_FACES.map((m) => (
                <button
                  key={m.val}
                  type="button"
                  onClick={() => logMood(m.val)}
                  className="flex flex-col items-center justify-center py-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] min-h-[68px]"
                >
                  <span className="text-2xl">{m.icon}</span>
                  <span className="text-[11px] font-medium mt-1">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'skin' && (
          <form onSubmit={logSkinNote} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Hydration (1–5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={skinHydration}
                  onChange={(e) => setSkinHydration(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Irritation (0–3)</label>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={skinIrritation}
                  onChange={(e) => setSkinIrritation(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Breakouts</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={skinBreakouts}
                  onChange={(e) => setSkinBreakouts(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-sm min-h-[44px]"
                />
              </div>
            </div>
            <textarea
              rows={2}
              placeholder="Notes (new product, tightness, redness, sleep impact...)"
              value={skinNotes}
              onChange={(e) => setSkinNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
              >
                Save Skin Note
              </button>
              {onOpenSkinLab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSkinLab();
                  }}
                  className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[44px]"
                >
                  Open Skin Lab
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
