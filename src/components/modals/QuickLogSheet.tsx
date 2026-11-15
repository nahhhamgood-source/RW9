import React, { useMemo, useState } from 'react';
import {
  X,
  Droplets,
  Utensils,
  Moon,
  Scale,
  Smile,
  Camera,
  Ruler,
  AlertTriangle,
  ScanLine,
  Wind,
  ShieldCheck,
} from 'lucide-react';
import {
  db,
  getOrCreateDailyLog,
  isUnder18OrGrowing,
  recalculateXpAndBadges,
  saveHeightLog,
  saveMealScanEntry,
} from '../../db/database';
import { toLocalDateKey } from '../../lib/date';
import { calculateUSNavyBodyFat, computeBmi } from '../../lib/fitness';
import { computeDebloatImpact } from '../../lib/nutrition';
import { en, getMealTypeByHour } from '../../i18n/en';
import type { MealFoodItem, MealType, UnitSystem, UserProfile } from '../../types';
import { useToast } from '../ui/ToastProvider';

export type QuickLogTab =
  | 'water'
  | 'nutrition'
  | 'body'
  | 'sleep'
  | 'mood'
  | 'photo'
  | 'height'
  | 'urge';

interface QuickLogSheetProps {
  open: boolean;
  initialTab?: QuickLogTab | 'skin';
  dateKey: string;
  profile: UserProfile;
  units?: UnitSystem;
  onClose: () => void;
  onOpenSkinLab?: () => void;
  onOpenMealScanner?: (mealType?: MealType) => void;
  onOpenQuitHabits?: () => void;
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
  units = 'metric',
  onClose,
  onOpenSkinLab,
  onOpenMealScanner,
  onOpenQuitHabits,
}) => {
  const { showToast } = useToast();
  const normalizedInitial: QuickLogTab = initialTab === 'skin' ? 'photo' : initialTab;
  const [tab, setTab] = useState<QuickLogTab>(normalizedInitial);
  const [urgeSecLeft, setUrgeSecLeft] = useState(120);
  const [urgeActive, setUrgeActive] = useState(false);

  // Water
  const [waterAdd, setWaterAdd] = useState(250);

  // Meal quick add
  const [mealType, setMealType] = useState<MealType>(() => getMealTypeByHour());
  const [mealNameInput, setMealNameInput] = useState('');
  const [proteinAdd, setProteinAdd] = useState(30);
  const [caloriesInput, setCaloriesInput] = useState('450');
  const [stepsInput, setStepsInput] = useState('');

  // Sleep
  const [sleepHours, setSleepHours] = useState('8');
  const [sleepQuality, setSleepQuality] = useState(4);
  const [bedtime, setBedtime] = useState(profile.usualBedtime || '23:00');
  const [wakeTime, setWakeTime] = useState(profile.usualWakeTime || '07:00');

  // Weight
  const [weightValue, setWeightValue] = useState(() =>
    units === 'imperial'
      ? String(Math.round((profile.weightKg || 74) * 2.20462))
      : String(profile.weightKg || 74)
  );
  const [waistCm, setWaistCm] = useState(profile.waistCm ? String(profile.waistCm) : '');
  const [neckCm, setNeckCm] = useState(profile.neckCm ? String(profile.neckCm) : '');

  // Photo / Skin note
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoNotes, setPhotoNotes] = useState('');
  const [skinHydration, setSkinHydration] = useState(4);

  // Height
  const [heightCmInput, setHeightCmInput] = useState(String(profile.heightCm || 178));
  const [feetInput, setFeetInput] = useState(String(Math.floor((profile.heightCm || 178) / 30.48)));
  const [inchesInput, setInchesInput] = useState(
    String(Math.round(((profile.heightCm || 178) / 2.54) % 12))
  );
  const [heightTimeOfDay, setHeightTimeOfDay] = useState<'morning' | 'evening'>('morning');
  const [heightNote, setHeightNote] = useState('');

  const [careCaution, setCareCaution] = useState<string | null>(null);

  const isGrowingSafe = useMemo(() => isUnder18OrGrowing(profile), [profile]);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab === 'skin' ? 'photo' : initialTab);
      setMealType(getMealTypeByHour());
      setCareCaution(null);
      setUrgeSecLeft(120);
      setUrgeActive(initialTab === 'urge');
      setHeightCmInput(String(profile.heightCm || 178));
      setWeightValue(
        units === 'imperial'
          ? String(Math.round((profile.weightKg || 74) * 2.20462))
          : String(profile.weightKg || 74)
      );
    }
  }, [open, initialTab, profile.heightCm, profile.weightKg, units]);

  React.useEffect(() => {
    if (!open || tab !== 'urge' || !urgeActive) return undefined;
    const id = window.setInterval(() => {
      setUrgeSecLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, tab, urgeActive]);

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
    const targetDate = dateKey || toLocalDateKey();
    const log = await getOrCreateDailyLog(targetDate);
    const mealCal = Math.max(0, Math.round(Number(caloriesInput) || 0));
    const mealPro = Math.max(0, Number(Number(proteinAdd || 0).toFixed(1)));
    const title = mealNameInput.trim() || `${en.meals[mealType]} quick add`;

    if (!isGrowingSafe && mealCal > 0 && mealCal < 250 && log.calories === 0) {
      // small snack is normal, only flag extreme total < 1200 when logging total intake later
    }

    const item: MealFoodItem = {
      id: `ql-${Date.now()}`,
      name: title,
      portionGrams: 250,
      baseGrams: 250,
      calories: mealCal,
      proteinG: mealPro,
      carbsG: 0,
      fatsG: 0,
      sodiumMg: 400,
      addedSugarG: 0,
    };
    const debloat = computeDebloatImpact(item.sodiumMg, 0);
    await saveMealScanEntry({
      date: targetDate,
      timestamp: Date.now(),
      mealType,
      mealTitle: title,
      confidence: 'High',
      items: [item],
      totalCalories: mealCal,
      totalProteinG: mealPro,
      totalCarbsG: 0,
      totalFatsG: 0,
      totalSodiumMg: item.sodiumMg,
      totalAddedSugarG: 0,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: `${en.meals[mealType]} · Quick add`,
      isManual: true,
    });

    if (stepsInput) {
      await db.dailyLogs.update(targetDate, {
        steps: Math.max(0, Number(stepsInput) || log.steps),
        updatedAt: Date.now(),
      });
    }
    setMealNameInput('');
    showToast(`Saved "${title}" to ${en.meals[mealType]}`);
    onClose();
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
    const rawNum = Number(weightValue);
    const weightKg = units === 'imperial' ? Number((rawNum / 2.20462).toFixed(1)) : rawNum;
    if (!weightKg || weightKg < 25 || weightKg > 300) {
      showToast(
        units === 'imperial' ? 'Enter a weight between 55 and 660 lb' : 'Enter a weight between 25 and 300 kg',
        'warning'
      );
      return;
    }
    const waist = waistCm ? Number(waistCm) : null;
    const neck = neckCm ? Number(neckCm) : null;
    const bf =
      !isGrowingSafe && waist && neck
        ? calculateUSNavyBodyFat({
            sex: profile.sex,
            heightCm: profile.heightCm,
            waistCm: waist,
            neckCm: neck,
          })?.bodyFatPct ?? null
        : null;

    await db.bodyMetrics.add({
      date: dateKey,
      weightKg,
      waistCm: waist,
      neckCm: neck,
      bodyFatPct: bf,
      createdAt: Date.now(),
    });
    await db.profile.update('me', {
      weightKg,
      waistCm: waist ?? profile.waistCm,
      neckCm: neck ?? profile.neckCm,
      updatedAt: Date.now(),
    });

    const bmi = computeBmi(weightKg, profile.heightCm);
    if (bmi > 0 && bmi < 17.5) {
      setCareCaution(
        `Saved. Your numbers look quite light for your height — focus on nourishing meals, sleep, and talk to a doctor before pushing harder.`
      );
      showToast('Weight saved', 'info');
      return;
    }

    showToast('Weight saved');
    onClose();
  };

  const logMood = async (val: number) => {
    await getOrCreateDailyLog(dateKey);
    await db.dailyLogs.update(dateKey, {
      mood: val,
      energy: val,
      updatedAt: Date.now(),
    });
    showToast('Mood saved');
    onClose();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, 560 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.78));
        return;
      }
    } catch {
      // Fallback to FileReader + Image below
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 560 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const logPhotoEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.skinEntries.add({
      date: dateKey || toLocalDateKey(),
      hydrationRating: skinHydration,
      irritationLevel: 0,
      breakoutsCount: 0,
      notes: photoNotes.trim(),
      photoDataUrl: photoDataUrl || undefined,
      productsUsed: [],
      createdAt: Date.now(),
    });
    await recalculateXpAndBadges();
    showToast(photoDataUrl ? 'Check-in photo saved on this device' : 'Note saved');
    setPhotoDataUrl('');
    setPhotoNotes('');
    onClose();
  };

  const logHeight = async (e: React.FormEvent) => {
    e.preventDefault();
    let cm = Number(heightCmInput);
    if (units === 'imperial') {
      const ft = Number(feetInput) || 0;
      const inc = Number(inchesInput) || 0;
      cm = Number(((ft * 12 + inc) * 2.54).toFixed(1));
    }
    if (!Number.isFinite(cm) || cm < 90 || cm > 250) {
      showToast('Enter a valid height (90–250 cm)', 'warning');
      return;
    }
    await saveHeightLog({
      date: dateKey || toLocalDateKey(),
      heightCm: cm,
      timeOfDay: heightTimeOfDay,
      note: heightNote,
    });
    showToast(`Height saved: ${cm.toFixed(1)} cm`);
    onClose();
  };

  const tabs: Array<{ id: QuickLogTab; label: string; icon: React.ReactNode }> = [
    { id: 'water', label: en.quickAdd.water, icon: <Droplets className="w-4 h-4" /> },
    { id: 'nutrition', label: en.quickAdd.meal, icon: <Utensils className="w-4 h-4" /> },
    { id: 'body', label: en.quickAdd.weight, icon: <Scale className="w-4 h-4" /> },
    { id: 'sleep', label: en.quickAdd.sleep, icon: <Moon className="w-4 h-4" /> },
    { id: 'mood', label: en.quickAdd.mood, icon: <Smile className="w-4 h-4" /> },
    { id: 'photo', label: en.quickAdd.photo, icon: <Camera className="w-4 h-4" /> },
    { id: 'height', label: en.quickAdd.height, icon: <Ruler className="w-4 h-4" /> },
    { id: 'urge', label: en.quickAdd.urge, icon: <Wind className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-[26px] sm:rounded-[26px] bg-white dark:bg-[#0C121E]/95 dark:backdrop-blur-2xl border border-slate-200 dark:border-sky-400/20 p-5 max-h-[88dvh] overflow-y-auto overscroll-y-contain shadow-2xl">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold">{en.quickAdd.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Saved locally for {dateKey}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick Add"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
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
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[44px] transition ${
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
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold mb-0.5">Heads up</p>
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
                aria-label="Custom water amount ml"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => logWater(waterAdd)}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
              >
                Add water
              </button>
            </div>
          </div>
        )}

        {tab === 'nutrition' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                1. Meal type
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setMealType(slot)}
                    className={`py-2.5 rounded-xl text-xs font-semibold min-h-[42px] transition ${
                      mealType === slot
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {en.meals[slot]}
                  </button>
                ))}
              </div>
            </div>

            {onOpenMealScanner && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMealScanner(mealType);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] text-sm font-bold flex items-center justify-center gap-2 min-h-[48px]"
              >
                <ScanLine className="w-4 h-4" />
                Scan {en.meals[mealType]} with camera AI
              </button>
            )}

            {isGrowingSafe && (
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-700 dark:text-slate-200">
                {en.safety.under18Headline} Focus on protein, meals, and sleep rather than cutting calories.
              </div>
            )}

            <form onSubmit={logNutrition} className="space-y-3 pt-1 border-t border-slate-200 dark:border-white/10">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                2. Or quick add {en.meals[mealType]} manually
              </p>
              <input
                type="text"
                value={mealNameInput}
                onChange={(e) => setMealNameInput(e.target.value)}
                placeholder={`Meal name (e.g., ${en.meals[mealType]} plate)`}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
              />
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Protein (grams)
                </label>
                <div className="flex gap-2 mb-2">
                  {[20, 30, 45].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setProteinAdd(g)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono-num font-semibold min-h-[40px] ${
                        proteinAdd === g
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-slate-100 dark:bg-white/5'
                      }`}
                    >
                      {g}g
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={proteinAdd}
                  onChange={(e) => setProteinAdd(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Meal calories (kcal)
                  </label>
                  <input
                    type="number"
                    placeholder="450"
                    value={caloriesInput}
                    onChange={(e) => setCaloriesInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Steps today
                  </label>
                  <input
                    type="number"
                    placeholder="8500"
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[46px]"
              >
                Quick add to {en.meals[mealType]}
              </button>
            </form>
          </div>
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
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Bedtime</label>
                <input
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Wake</label>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                How rested do you feel? (1–5)
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
              className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[46px]"
            >
              Save sleep
            </button>
          </form>
        )}

        {tab === 'body' && (
          <form onSubmit={logBody} className="space-y-3">
            <div className={`grid ${isGrowingSafe ? 'grid-cols-1' : 'grid-cols-3'} gap-2.5`}>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Weight ({units === 'imperial' ? 'lb' : 'kg'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
              {!isGrowingSafe && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Waist (cm, opt)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Optional"
                      value={waistCm}
                      onChange={(e) => setWaistCm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Neck (cm, opt)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Optional"
                      value={neckCm}
                      onChange={(e) => setNeckCm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                    />
                  </div>
                </>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[46px]"
            >
              Save weight
            </button>
          </form>
        )}

        {tab === 'mood' && (
          <div className="space-y-3">
            <p className="text-base text-slate-700 dark:text-slate-200">How are you feeling today?</p>
            <div className="grid grid-cols-5 gap-2">
              {MOOD_FACES.map((m) => (
                <button
                  key={m.val}
                  type="button"
                  onClick={() => logMood(m.val)}
                  className="flex flex-col items-center justify-center py-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] min-h-[68px]"
                >
                  <span className="text-2xl">{m.icon}</span>
                  <span className="text-xs font-medium mt-1">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'photo' && (
          <form onSubmit={logPhotoEntry} className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save a check-in photo on your device (same spot &amp; daylight is best).
            </p>
            <label className="w-full py-4 px-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-dashed border-slate-300 dark:border-white/20 flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer min-h-[56px]">
              <Camera className="w-5 h-5 text-[var(--accent)]" />
              {photoDataUrl ? 'Photo ready — tap to change' : 'Take or pick a photo'}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
            {photoDataUrl && (
              <img
                src={photoDataUrl}
                alt="Check-in preview"
                className="w-28 h-28 rounded-2xl object-cover mx-auto border border-slate-200 dark:border-white/15"
              />
            )}
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Skin feel today (1–5)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSkinHydration(v)}
                    className={`py-2 rounded-xl text-sm font-mono-num font-semibold min-h-[44px] ${
                      skinHydration === v
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              placeholder="Optional note (sleep, new cleanser, lighting)..."
              value={photoNotes}
              onChange={(e) => setPhotoNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[46px]"
              >
                Save check-in
              </button>
              {onOpenSkinLab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSkinLab();
                  }}
                  className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[46px]"
                >
                  Skin Lab
                </button>
              )}
            </div>
          </form>
        )}

        {tab === 'height' && (
          <form onSubmit={logHeight} className="space-y-3.5">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Tip: Stand barefoot with your back flat to a wall, eyes level, take 3 readings and save the average.
            </div>

            {units === 'imperial' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Feet</label>
                  <input
                    type="number"
                    min={3}
                    max={8}
                    value={feetInput}
                    onChange={(e) => setFeetInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Inches</label>
                  <input
                    type="number"
                    min={0}
                    max={11}
                    step="0.5"
                    value={inchesInput}
                    onChange={(e) => setInchesInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={90}
                  max={250}
                  value={heightCmInput}
                  onChange={(e) => setHeightCmInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Time measured (morning is usually ~1 cm taller)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['morning', 'evening'] as const).map((tod) => (
                  <button
                    key={tod}
                    type="button"
                    onClick={() => setHeightTimeOfDay(tod)}
                    className={`py-2.5 rounded-xl text-sm font-semibold capitalize min-h-[44px] ${
                      heightTimeOfDay === tod
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/5'
                    }`}
                  >
                    {tod}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              placeholder="Note (optional, e.g. wall check)"
              value={heightNote}
              onChange={(e) => setHeightNote(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
            />

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[46px]"
            >
              Save height
            </button>
          </form>
        )}

        {tab === 'urge' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-center space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                2-minute urge reset
              </p>
              <p className="font-mono-num text-4xl font-bold text-[var(--accent)]">
                {Math.floor(urgeSecLeft / 60)}:{String(urgeSecLeft % 60).padStart(2, '0')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {urgeSecLeft === 0
                  ? '2 minutes cleared. Drink water or change rooms for another 5 minutes.'
                  : 'Inhale 4s · Hold 4s · Exhale 4s · Step away from the trigger.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUrgeActive((v) => !v)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-bold min-h-[46px]"
              >
                {urgeActive ? 'Pause timer' : 'Start 2-min reset'}
              </button>
              {onOpenQuitHabits && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQuitHabits();
                  }}
                  className="flex-1 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[46px] inline-flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" /> Open Quit habits
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
