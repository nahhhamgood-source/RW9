import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Flame,
  ImagePlus,
  Loader2,
  Minus,
  PenLine,
  Plus,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  deleteMealScanEntry,
  getOrCreateDailyLog,
  isAgeUnknown,
  isUnder18OrGrowing,
  saveAndVerifyProfile,
  saveMealScanEntry,
  updateMealScanEntry,
  db,
} from '../db/database';
import { en } from '../i18n/en';
import { apiRequest, hasOnlineConsent } from '../lib/api';
import { toLocalDateKey } from '../lib/date';
import {
  computeDailyNutritionTargets,
  computeDebloatImpact,
  prepareMealImageAssets,
  resolveSafeDietGoal,
  scaleFoodItemWeight,
  sumMealItems,
} from '../lib/nutrition';
import { OnlineConsentModal } from '../components/modals/OnlineConsentModal';
import { CircularRing } from '../components/ui/ProgressRings';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AppSettings,
  DailyLog,
  DietGoalMode,
  MealFoodItem,
  MealScanEntry,
  UserProfile,
} from '../types';

interface NutritionScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
}

interface PendingAiEstimate {
  name: string;
  portion_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  sodium_mg: number;
  sugar_g: number;
  confidence: number;
  notes: string;
  photoThumbnail: string;
  items: MealFoodItem[];
}

export const NutritionScreen: React.FC<NutritionScreenProps> = ({
  profile,
  settings,
  dailyLogs,
  mealScans,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();

  const hideCut = isUnder18OrGrowing(profile);
  const { goal: safeGoalMode, cutLocked, lockReason } = useMemo(
    () => resolveSafeDietGoal(profile),
    [profile]
  );
  const [mealNote, setMealNote] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<PendingAiEstimate | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingPhotoSourceRef = useRef<File | string | null>(null);
  const lastImageSourceRef = useRef<File | string | null>(null);
  const [activeMealId, setActiveMealId] = useState<number | null>(null);
  const [expandedTimelineId, setExpandedTimelineId] = useState<number | null>(null);

  const handleSelectGoalMode = async (nextMode: DietGoalMode) => {
    const resolved = resolveSafeDietGoal(profile, nextMode);
    if (nextMode === 'cut' && resolved.cutLocked) {
      showToast(
        resolved.lockReason === 'underweight'
          ? 'Cut goal locked while BMI is under 18.5.'
          : isAgeUnknown(profile)
          ? en.diet.under18Lock
          : en.diet.under18Maintain,
        'warning'
      );
      return;
    }
    const nextTargets = computeDailyNutritionTargets(profile, resolved.goal);
    await saveAndVerifyProfile({
      ...profile,
      dietGoal: resolved.goal,
      calorieGoal: nextTargets.calories,
      proteinTargetG: nextTargets.proteinG,
      waterTargetMl: nextTargets.debloatWaterMl,
    });
    showToast(`Diet goal set to ${resolved.goal === 'cut' ? en.diet.loseFat : resolved.goal === 'lean_gain' ? en.diet.buildMuscle : en.diet.staySame}`);
  };

  // Live Camera Modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Manual Fallback / Custom Food Entry state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualGrams, setManualGrams] = useState('220');
  const [manualCalories, setManualCalories] = useState('420');
  const [manualProtein, setManualProtein] = useState('38');
  const [manualCarbs, setManualCarbs] = useState('35');
  const [manualFats, setManualFats] = useState('12');
  const [manualSodium, setManualSodium] = useState('480');
  const [manualSugar, setManualSugar] = useState('3');

  const targets = useMemo(
    () => computeDailyNutritionTargets(profile, safeGoalMode),
    [profile, safeGoalMode]
  );

  const todayLog = useMemo(
    () => dailyLogs.find((l) => l.date === todayKey),
    [dailyLogs, todayKey]
  );

  const todayMeals = useMemo(
    () =>
      mealScans
        .filter((m) => m.date === todayKey)
        .sort((a, b) => b.timestamp - a.timestamp),
    [mealScans, todayKey]
  );

  const activeMeal = useMemo(() => {
    if (activeMealId !== null) {
      return todayMeals.find((m) => m.id === activeMealId) ?? todayMeals[0] ?? null;
    }
    return todayMeals[0] ?? null;
  }, [activeMealId, todayMeals]);

  // Daily cumulative totals from today's scanned/manual meals (+ Quick Log deltas if any)
  const dailyTotals = useMemo(() => {
    const mealsCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const mealsPro = todayMeals.reduce((s, m) => s + m.totalProteinG, 0);
    const mealsCarbs = todayMeals.reduce((s, m) => s + m.totalCarbsG, 0);
    const mealsFats = todayMeals.reduce((s, m) => s + m.totalFatsG, 0);
    const mealsSodium = todayMeals.reduce((s, m) => s + m.totalSodiumMg, 0);
    const mealsSugar = todayMeals.reduce((s, m) => s + m.totalAddedSugarG, 0);

    const calories = Math.max(mealsCal, todayLog?.calories ?? 0);
    const proteinG = Number(Math.max(mealsPro, todayLog?.proteinG ?? 0).toFixed(1));
    return {
      calories,
      proteinG,
      carbsG: Number(mealsCarbs.toFixed(1)),
      fatsG: Number(mealsFats.toFixed(1)),
      sodiumMg: mealsSodium,
      addedSugarG: Number(mealsSugar.toFixed(1)),
      waterMl: todayLog?.waterMl ?? 0,
    };
  }, [todayMeals, todayLog]);

  const dailyDebloat = useMemo(
    () => computeDebloatImpact(dailyTotals.sodiumMg, dailyTotals.addedSugarG),
    [dailyTotals.sodiumMg, dailyTotals.addedSugarG]
  );

  const caloriePct = Math.min(
    100,
    Math.round((dailyTotals.calories / Math.max(1, targets.calories)) * 100)
  );
  const caloriesRemaining = Math.max(0, targets.calories - dailyTotals.calories);
  const waterPct = Math.min(
    100,
    Math.round((dailyTotals.waterMl / targets.debloatWaterMl) * 100)
  );

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  const openLiveCamera = async () => {
    setCameraError(null);
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Live camera is not supported in this browser. Use Snap Mobile Photo or Gallery Upload instead.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Allow camera access in browser settings or use Snap Mobile Photo / Gallery Upload.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        setCameraError(
          'No back camera was found on this device. Use Snap Mobile Photo or Gallery Upload instead.'
        );
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError(
          'Camera is currently in use by another app or tab. Close it and retry, or upload a meal photo.'
        );
      } else {
        setCameraError(
          'Could not open live camera on this browser. Use Snap Mobile Photo or Gallery Upload instead.'
        );
      }
    }
  };

  const closeLiveCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  };

  const runVisionAnalysis = async (source: File | string, bypassConsentCheck = false) => {
    if (!bypassConsentCheck && !hasOnlineConsent(settings, 'food')) {
      pendingPhotoSourceRef.current = source;
      setConsentOpen(true);
      return;
    }

    lastImageSourceRef.current = source;
    setScanError(null);
    setPendingEstimate(null);
    setAnalyzing(true);

    try {
      const { apiBase64, mimeType, previewDataUrl, thumbnailDataUrl } =
        await prepareMealImageAssets(source);
      setPreviewUrl(previewDataUrl);

      const res = await apiRequest<Record<string, unknown>>('/api/analyze-food', {
        method: 'POST',
        timeoutMs: 45_000,
        body: {
          imageBase64: apiBase64,
          mimeType,
          context: mealNote.trim() || undefined,
        },
      });

      if (!res.ok) {
        setScanError(res.detail || res.error || 'Food scan failed.');
        return;
      }

      const d = res.data;
      const confidence = Math.max(0, Math.min(1, Number(d.confidence ?? 0.6)));
      const rawItems = Array.isArray(d.items) ? d.items : [];
      const parsedItems: MealFoodItem[] = rawItems.map((it: Record<string, unknown>, idx: number) => {
        const portion = Math.max(5, Math.round(Number(it.portion_g) || 100));
        return {
          id: String(it.id || `item-${Date.now()}-${idx}`),
          name: String(it.name || `Food Item ${idx + 1}`).trim(),
          portionGrams: portion,
          baseGrams: portion,
          calories: Math.max(0, Math.round(Number(it.calories) || 0)),
          proteinG: Math.max(0, Number(Number(it.protein_g || 0).toFixed(1))),
          carbsG: Math.max(0, Number(Number(it.carbs_g || 0).toFixed(1))),
          fatsG: Math.max(0, Number(Number(it.fats_g || 0).toFixed(1))),
          sodiumMg: Math.max(0, Math.round(Number(it.sodium_mg) || 0)),
          addedSugarG: Math.max(0, Number(Number(it.sugar_g || 0).toFixed(1))),
          notes: typeof it.notes === 'string' ? it.notes.trim() : '',
        };
      });

      setPendingEstimate({
        name: String(d.name || 'Estimated Meal').trim(),
        portion_g: Math.max(5, Math.round(Number(d.portion_g) || 250)),
        calories: Math.max(0, Math.round(Number(d.calories) || 0)),
        protein_g: Math.max(0, Number(Number(d.protein_g || 0).toFixed(1))),
        carbs_g: Math.max(0, Number(Number(d.carbs_g || 0).toFixed(1))),
        fats_g: Math.max(0, Number(Number(d.fats_g || 0).toFixed(1))),
        sodium_mg: Math.max(0, Math.round(Number(d.sodium_mg) || 0)),
        sugar_g: Math.max(0, Number(Number(d.sugar_g || 0).toFixed(1))),
        confidence,
        notes: typeof d.notes === 'string' ? d.notes.trim() : '',
        photoThumbnail: thumbnailDataUrl,
        items: parsedItems,
      });
      showToast('AI estimate ready — review & edit before saving', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setScanError(`Food scan request failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveAiEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEstimate) return;
    const portion = Math.max(5, Math.round(Number(pendingEstimate.portion_g) || 200));
    const singleItem: MealFoodItem = {
      id: `ai-${Date.now()}`,
      name: pendingEstimate.name.trim() || 'Estimated Meal',
      portionGrams: portion,
      baseGrams: portion,
      calories: Math.max(0, Math.round(Number(pendingEstimate.calories) || 0)),
      proteinG: Math.max(0, Number(Number(pendingEstimate.protein_g || 0).toFixed(1))),
      carbsG: Math.max(0, Number(Number(pendingEstimate.carbs_g || 0).toFixed(1))),
      fatsG: Math.max(0, Number(Number(pendingEstimate.fats_g || 0).toFixed(1))),
      sodiumMg: Math.max(0, Math.round(Number(pendingEstimate.sodium_mg) || 0)),
      addedSugarG: Math.max(0, Number(Number(pendingEstimate.sugar_g || 0).toFixed(1))),
      notes: pendingEstimate.notes.trim(),
    };
    const debloat = computeDebloatImpact(singleItem.sodiumMg, singleItem.addedSugarG);
    const confLabel: MealScanEntry['confidence'] =
      pendingEstimate.confidence >= 0.78
        ? 'High'
        : pendingEstimate.confidence >= 0.55
        ? 'Medium'
        : 'Low';

    const newId = await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealTitle: singleItem.name,
      confidence: confLabel,
      items: [singleItem],
      totalCalories: singleItem.calories,
      totalProteinG: singleItem.proteinG,
      totalCarbsG: singleItem.carbsG,
      totalFatsG: singleItem.fatsG,
      totalSodiumMg: singleItem.sodiumMg,
      totalAddedSugarG: singleItem.addedSugarG,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: pendingEstimate.notes || debloat.detail,
      photoThumbnail: pendingEstimate.photoThumbnail,
      isManual: false,
    });

    setActiveMealId(newId);
    setPendingEstimate(null);
    setMealNote('');
    showToast(`Saved AI estimate: ${singleItem.name} (${singleItem.calories} kcal)`);
  };

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    closeLiveCamera();
    await runVisionAnalysis(dataUrl);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await runVisionAnalysis(file);
  };

  const handleAddWater = async (ml: number) => {
    const log = await getOrCreateDailyLog(todayKey);
    const nextMl = Math.max(0, (log.waterMl || 0) + ml);
    await db.dailyLogs.update(todayKey, {
      waterMl: nextMl,
      updatedAt: Date.now(),
    });
    showToast(`+${ml} ml logged (${(nextMl / 1000).toFixed(2)}L / 4.0L)`);
  };

  const handleAdjustItemWeight = async (
    meal: MealScanEntry,
    itemId: string,
    nextGrams: number
  ) => {
    const nextItems = meal.items.map((it) =>
      it.id === itemId ? scaleFoodItemWeight(it, nextGrams) : it
    );
    const sums = sumMealItems(nextItems);
    const debloat = computeDebloatImpact(sums.totalSodiumMg, sums.totalAddedSugarG);
    const updated: MealScanEntry = {
      ...meal,
      items: nextItems,
      ...sums,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
    };
    await updateMealScanEntry(updated);
  };

  const handleRemoveItem = async (meal: MealScanEntry, itemId: string) => {
    const nextItems = meal.items.filter((it) => it.id !== itemId);
    if (nextItems.length === 0) {
      await deleteMealScanEntry(meal);
      if (activeMealId === meal.id) setActiveMealId(null);
      showToast('Meal entry removed');
      return;
    }
    const sums = sumMealItems(nextItems);
    const debloat = computeDebloatImpact(sums.totalSodiumMg, sums.totalAddedSugarG);
    await updateMealScanEntry({
      ...meal,
      items: nextItems,
      ...sums,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
    });
    showToast('Updated meal items');
  };

  const handleSaveManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = manualName.trim() || 'Custom Meal Item';
    const grams = Math.max(5, Math.round(Number(manualGrams) || 150));
    const item: MealFoodItem = {
      id: `manual-${Date.now()}`,
      name,
      portionGrams: grams,
      baseGrams: grams,
      calories: Math.max(0, Math.round(Number(manualCalories) || 0)),
      proteinG: Math.max(0, Number(manualProtein) || 0),
      carbsG: Math.max(0, Number(manualCarbs) || 0),
      fatsG: Math.max(0, Number(manualFats) || 0),
      sodiumMg: Math.max(0, Math.round(Number(manualSodium) || 0)),
      addedSugarG: Math.max(0, Number(manualSugar) || 0),
      notes: 'Manual portion entry',
    };
    const sums = sumMealItems([item]);
    const debloat = computeDebloatImpact(sums.totalSodiumMg, sums.totalAddedSugarG);

    const newId = await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealTitle: name,
      confidence: 'High',
      items: [item],
      ...sums,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: debloat.detail,
      isManual: true,
    });

    setActiveMealId(newId);
    setManualName('');
    setManualOpen(false);
    showToast(`Logged ${name} (${sums.totalCalories} kcal)`);
  };

  const handleDeleteMeal = async (meal: MealScanEntry) => {
    await deleteMealScanEntry(meal);
    if (activeMealId === meal.id) setActiveMealId(null);
    showToast(`Removed ${meal.mealTitle}`);
  };

  const getDebloatBadgeClasses = (status: MealScanEntry['debloatStatus']) => {
    if (status === 'optimal') {
      return 'bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-[#34D399]';
    }
    if (status === 'moderate') {
      return 'bg-amber-500/15 border-amber-500/35 text-amber-700 dark:text-[#F6D56F]';
    }
    return 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300';
  };

  return (
    <div className="space-y-4">
      {/* Header + Goal Pace Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
            Multimodal Vision · Local Vault
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            AI Nutrition &amp; Calorie Scanner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plate gram estimation, macros &amp; facial-debloat sodium diagnostics
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 shrink-0">
          {([
            { id: 'cut', label: en.diet.loseFat },
            { id: 'maintain', label: en.diet.staySame },
            { id: 'lean_gain', label: en.diet.buildMuscle },
          ] as const).map((m) => {
            const locked = m.id === 'cut' && cutLocked;
            return (
              <button
                key={m.id}
                type="button"
                disabled={locked}
                title={
                  locked
                    ? lockReason === 'underweight'
                      ? 'Cut locked under BMI 18.5'
                      : en.diet.under18Lock
                    : undefined
                }
                onClick={() => handleSelectGoalMode(m.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap min-h-[36px] ${
                  locked
                    ? 'opacity-45 cursor-not-allowed text-slate-400'
                    : safeGoalMode === m.id
                    ? 'bg-white dark:bg-[#132018] text-slate-900 dark:text-[var(--accent)] shadow-sm border border-transparent dark:border-emerald-500/30'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {m.label}{locked ? ' (locked)' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {cutLocked && (
        <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-sky-700 dark:text-sky-300">
          {lockReason === 'underweight'
            ? 'Cut targets are hidden while BMI is below 18.5 — stay on Stay the same or Build muscle.'
            : isAgeUnknown(profile)
            ? en.diet.under18Lock
            : en.diet.under18Maintain}
        </div>
      )}

      {/* Top Vault: Glowing Calorie Ring + Macro Bars + 4L Debloat Hydration Quick-Tap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Daily Calorie Ring + Macronutrient Progress Card */}
        <section className="lg:col-span-7 ascend-card ascend-hero-glow p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="shrink-0">
              <CircularRing
                value={caloriePct}
                size={132}
                strokeWidth={11}
                color="var(--accent)"
                glow
              >
                <div className="text-center">
                  <span className="font-mono-num text-xl font-bold block leading-none">
                    {dailyTotals.calories}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-num block mt-1">
                    / {targets.calories} kcal
                  </span>
                </div>
              </CircularRing>
            </div>

            <div className="flex-1 w-full min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                    Daily Caloric Vault
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Auto-target ({profile.age}y · {profile.heightCm}cm · {profile.weightKg}kg)
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 font-mono-num text-xs font-bold text-[var(--accent)] shrink-0">
                  {caloriesRemaining} left
                </span>
              </div>

              {/* Protein, Carbs, Fats Horizontal Bars */}
              <div className="space-y-2.5">
                {[
                  {
                    label: 'Protein',
                    val: dailyTotals.proteinG,
                    target: targets.proteinG,
                    barClass: 'bg-emerald-500 dark:bg-[#34D399]',
                  },
                  {
                    label: 'Carbohydrates',
                    val: dailyTotals.carbsG,
                    target: targets.carbsG,
                    barClass: 'bg-amber-400 dark:bg-[#F6D56F]',
                  },
                  {
                    label: 'Fats',
                    val: dailyTotals.fatsG,
                    target: targets.fatsG,
                    barClass: 'bg-violet-400 dark:bg-[#B8A9F5]',
                  },
                ].map((macro) => {
                  const pct = Math.min(100, Math.round((macro.val / Math.max(1, macro.target)) * 100));
                  return (
                    <div key={macro.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{macro.label}</span>
                        <span className="font-mono-num text-[11px] text-slate-600 dark:text-slate-300">
                          <strong>{macro.val}g</strong> / {macro.target}g
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-black/50 overflow-hidden border border-slate-200/70 dark:border-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${macro.barClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Daily Cumulative Sodium & Sugar Debloat Status */}
          <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono-num">
                Sodium: <strong>{dailyTotals.sodiumMg}</strong>/{targets.sodiumLimitMg} mg
              </span>
              <span className="text-slate-300 dark:text-white/20">|</span>
              <span className="font-mono-num">
                Added Sugar: <strong>{dailyTotals.addedSugarG}</strong>/{targets.addedSugarLimitG} g
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold ${getDebloatBadgeClasses(
                dailyDebloat.status
              )}`}
            >
              {dailyDebloat.status === 'optimal'
                ? 'Optimal Debloat Balance'
                : dailyDebloat.status === 'moderate'
                ? 'Watch Sodium Load'
                : 'Retention Risk Today'}
            </span>
          </div>
        </section>

        {/* 4L Debloating Hydration Vault Right Next to Calorie Tracker */}
        <section className="lg:col-span-5 ascend-card p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                4.0L Debloat Hydration Vault
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono-num text-2xl font-bold">
                  {(dailyTotals.waterMl / 1000).toFixed(2)}L
                </span>
                <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                  / 4.00L ({waterPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Flushes extracellular sodium for sharp facial definition
              </p>
            </div>
            <span className="w-10 h-10 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5" />
            </span>
          </div>

          <div className="space-y-2">
            <div className="h-3 rounded-full bg-slate-200 dark:bg-black/50 overflow-hidden border border-slate-200/70 dark:border-emerald-500/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[var(--accent)] transition-all duration-500"
                style={{
                  width: `${waterPct}%`,
                  boxShadow: '0 0 14px var(--accent-glow)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
              <span>0L</span>
              <span>2.0L</span>
              <span>4.0L Target</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleAddWater(250)}
              className="py-3 px-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] font-mono-num text-xs font-bold flex items-center justify-center gap-1.5 min-h-[46px] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] active:scale-95 transition"
            >
              <Plus className="w-4 h-4" /> +250 ml
            </button>
            <button
              type="button"
              onClick={() => handleAddWater(500)}
              className="py-3 px-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] font-mono-num text-xs font-bold flex items-center justify-center gap-1.5 min-h-[46px] shadow-[0_0_20px_-6px_var(--accent-glow)] active:scale-95 transition"
            >
              <Plus className="w-4 h-4" /> +500 ml
            </button>
          </div>
        </section>
      </div>

      {/* Multimodal Food Scanner Capture Zone */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-[var(--accent)]" />
              Scan Meal Plate with Vision AI
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Identifies every food item, estimates gram weights, and flags facial-bloating sodium &amp; sugars
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualOpen(!manualOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[38px]"
          >
            <PenLine className="w-3.5 h-3.5 text-[var(--accent)]" />
            {manualOpen ? 'Close Manual Entry' : 'Manual Quick-Add'}
          </button>
        </div>

        {/* Optional Meal Context Note (Sauces / Oils / Portion hint) */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={mealNote}
            onChange={(e) => setMealNote(e.target.value)}
            placeholder="Optional context (e.g., cooked in 1 tbsp olive oil, soy sauce, whey shake)..."
            className="flex-1 px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-base sm:text-xs min-h-[44px] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Primary Capture Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={analyzing}
            onClick={openLiveCamera}
            className="py-3 px-4 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold flex items-center justify-center gap-2 min-h-[48px] shadow-[0_0_24px_-6px_var(--accent-glow)] disabled:opacity-60 active:scale-[0.98] transition"
          >
            <Camera className="w-4 h-4" />
            Live Camera Scanner
          </button>

          <button
            type="button"
            disabled={analyzing}
            onClick={() => nativeCameraInputRef.current?.click()}
            className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-emerald-500/25 text-xs font-semibold flex items-center justify-center gap-2 min-h-[48px] hover:border-[var(--accent)]/50 disabled:opacity-60 active:scale-[0.98] transition"
          >
            <Camera className="w-4 h-4 text-[var(--accent)]" />
            Snap Mobile Photo
          </button>

          <button
            type="button"
            disabled={analyzing}
            onClick={() => galleryInputRef.current?.click()}
            className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-emerald-500/25 text-xs font-semibold flex items-center justify-center gap-2 min-h-[48px] hover:border-[var(--accent)]/50 disabled:opacity-60 active:scale-[0.98] transition"
          >
            <ImagePlus className="w-4 h-4 text-[var(--accent)]" />
            Upload from Gallery
          </button>
        </div>

        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Analyzing Visual Preview */}
        {analyzing && previewUrl && (
          <div className="relative rounded-[24px] overflow-hidden border border-emerald-500/35 bg-black max-h-72 flex items-center justify-center">
            <img
              src={previewUrl}
              alt="Analyzing meal"
              className="w-full max-h-72 object-cover opacity-65"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/50 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/50 flex items-center justify-center shadow-[0_0_24px_var(--accent-glow)]">
                <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
              </div>
              <p className="font-display text-sm font-bold text-white">
                Analyzing Plate Geometry &amp; Nutrients...
              </p>
              <p className="text-[11px] text-emerald-300/90">
                Estimating gram portions, protein, sodium &amp; sugars (max 25s)
              </p>
            </div>
          </div>
        )}

        {/* Friendly API / Vision Error Banner with Retry + Manual Fallback */}
        {scanError && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/35 flex flex-col gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="font-semibold text-amber-800 dark:text-amber-200 leading-relaxed">
                {scanError}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lastImageSourceRef.current && (
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => lastImageSourceRef.current && runVisionAnalysis(lastImageSourceRef.current)}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                >
                  Retry Scan
                </button>
              )}
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="px-4 py-2 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/15 text-xs font-bold min-h-[44px]"
              >
                Use Manual Quick-Add
              </button>
            </div>
          </div>
        )}

        {/* Editable AI Estimate Review Form (before saving) */}
        {pendingEstimate && (
          <form
            onSubmit={handleSaveAiEstimate}
            className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/30 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {pendingEstimate.photoThumbnail && (
                  <img
                    src={pendingEstimate.photoThumbnail}
                    alt="Meal preview"
                    className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold uppercase tracking-wider">
                      AI estimate
                    </span>
                    <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-300">
                      {Math.round(pendingEstimate.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Edit any value below before saving to your daily log.
                  </p>
                </div>
              </div>
            </div>

            {pendingEstimate.confidence < 0.6 && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Low confidence estimate — double-check portion grams and calories before saving.</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Meal Name
                </label>
                <input
                  type="text"
                  required
                  value={pendingEstimate.name}
                  onChange={(e) => setPendingEstimate({ ...pendingEstimate, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Portion (g)
                </label>
                <input
                  type="number"
                  min={5}
                  value={pendingEstimate.portion_g}
                  onChange={(e) =>
                    setPendingEstimate({ ...pendingEstimate, portion_g: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  min={0}
                  value={pendingEstimate.calories}
                  onChange={(e) =>
                    setPendingEstimate({ ...pendingEstimate, calories: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={pendingEstimate.protein_g}
                  onChange={(e) =>
                    setPendingEstimate({ ...pendingEstimate, protein_g: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={pendingEstimate.carbs_g}
                  onChange={(e) =>
                    setPendingEstimate({ ...pendingEstimate, carbs_g: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Fats (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={pendingEstimate.fats_g}
                  onChange={(e) =>
                    setPendingEstimate({ ...pendingEstimate, fats_g: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Sodium (mg) / Sugar (g)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    min={0}
                    aria-label="Estimated sodium mg"
                    value={pendingEstimate.sodium_mg}
                    onChange={(e) =>
                      setPendingEstimate({ ...pendingEstimate, sodium_mg: Number(e.target.value) })
                    }
                    className="w-full px-2 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                  />
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    aria-label="Estimated sugar g"
                    value={pendingEstimate.sugar_g}
                    onChange={(e) =>
                      setPendingEstimate({ ...pendingEstimate, sugar_g: Number(e.target.value) })
                    }
                    className="w-full px-2 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/15 font-mono-num text-base sm:text-xs min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {pendingEstimate.notes && (
              <p className="text-[11px] text-slate-500 dark:text-slate-300">
                Note: {pendingEstimate.notes}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                Save AI Estimate
              </button>
              <button
                type="button"
                onClick={() => setPendingEstimate(null)}
                className="px-4 py-2.5 rounded-xl bg-white dark:bg-white/10 text-xs font-semibold min-h-[44px]"
              >
                Discard
              </button>
            </div>
          </form>
        )}

        {/* Manual Quick-Add Fallback Form */}
        {manualOpen && (
          <form
            onSubmit={handleSaveManualItem}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-emerald-500/20 space-y-3"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
              Manual Food Entry
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Meal / Food Name
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Chicken Breast & Jasmine Rice"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Portion (g)
                </label>
                <input
                  type="number"
                  min={5}
                  value={manualGrams}
                  onChange={(e) => setManualGrams(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  min={0}
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={manualProtein}
                  onChange={(e) => setManualProtein(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={manualCarbs}
                  onChange={(e) => setManualCarbs(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Fats (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={manualFats}
                  onChange={(e) => setManualFats(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Sodium (mg) / Sugar (g)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    min={0}
                    aria-label="Sodium mg"
                    value={manualSodium}
                    onChange={(e) => setManualSodium(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                  />
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    aria-label="Added sugar grams"
                    value={manualSugar}
                    onChange={(e) => setManualSugar(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              Log Food to Daily Vault
            </button>
          </form>
        )}
      </section>

      {/* Active Scanned Meal Breakdown Card + Portion Adjuster + Looksmax Debloat Diagnostics */}
      {activeMeal && (
        <section className="ascend-card p-5 space-y-4 border-emerald-500/25">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {activeMeal.photoThumbnail ? (
                <img
                  src={activeMeal.photoThumbnail}
                  alt={activeMeal.mealTitle}
                  className="w-16 h-16 rounded-2xl object-cover border border-emerald-500/30 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 flex items-center justify-center shrink-0">
                  <Utensils className="w-6 h-6 text-[var(--accent)]" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                    Active Meal Breakdown
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-semibold">
                    {activeMeal.confidence} Confidence
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold truncate mt-0.5">
                  {activeMeal.mealTitle}
                </h2>
                <p className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                  {activeMeal.totalCalories} kcal · P {activeMeal.totalProteinG}g · C{' '}
                  {activeMeal.totalCarbsG}g · F {activeMeal.totalFatsG}g
                </p>
              </div>
            </div>
          </div>

          {/* Looksmax / Facial Debloat Impact Banner */}
          <div
            className={`p-4 rounded-2xl border space-y-1.5 ${getDebloatBadgeClasses(
              activeMeal.debloatStatus
            )}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {activeMeal.debloatStatus === 'optimal' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-bold leading-snug">
                  {activeMeal.debloatHeadline}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono-num text-[11px] font-bold shrink-0">
                <span>Sodium: {activeMeal.totalSodiumMg} mg</span>
                <span>·</span>
                <span>Sugar: {activeMeal.totalAddedSugarG} g</span>
              </div>
            </div>
            {activeMeal.summaryNote && (
              <p className="text-[11px] opacity-90 leading-relaxed">{activeMeal.summaryNote}</p>
            )}
          </div>

          {/* Per-Item Breakdown & Real-Time Gram Portion Weight Adjuster */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Plate Items ({activeMeal.items.length}) — Adjust Portion Grams
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Auto-saved to Vault
              </span>
            </div>

            <div className="space-y-2.5">
              {activeMeal.items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/35 border border-slate-200 dark:border-white/10 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{item.name}</p>
                      <p className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                        {item.calories} kcal · P {item.proteinG}g · C {item.carbsG}g · F{' '}
                        {item.fatsG}g · Na {item.sodiumMg}mg
                      </p>
                      {item.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(activeMeal, item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 transition shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Portion Weight Adjuster (-10g / Slider / +10g) */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleAdjustItemWeight(activeMeal, item.id, item.portionGrams - 15)
                      }
                      aria-label="Decrease portion"
                      className="w-8 h-8 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 hover:border-[var(--accent)]/40"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="range"
                      min={15}
                      max={Math.max(400, item.baseGrams * 2)}
                      step={5}
                      value={item.portionGrams}
                      onChange={(e) =>
                        handleAdjustItemWeight(activeMeal, item.id, Number(e.target.value))
                      }
                      aria-label={`Adjust grams for ${item.name}`}
                      className="flex-1 accent-[var(--accent)] h-2 cursor-pointer"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        handleAdjustItemWeight(activeMeal, item.id, item.portionGrams + 15)
                      }
                      aria-label="Increase portion"
                      className="w-8 h-8 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 hover:border-[var(--accent)]/40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <span className="font-mono-num text-xs font-bold text-[var(--accent)] w-14 text-right shrink-0">
                      {item.portionGrams}g
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Today's Local Nutrition Timeline */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Flame className="w-4 h-4 text-[var(--accent)]" />
              Today&apos;s Nutrition Timeline ({todayMeals.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stored locally on your device · Tap any meal to tweak portion grams
            </p>
          </div>
          <span className="font-mono-num text-xs font-bold text-[var(--accent)]">
            {todayMeals.reduce((s, m) => s + m.totalCalories, 0)} kcal
          </span>
        </div>

        {todayMeals.length === 0 ? (
          <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
            <Sparkles className="w-6 h-6 text-[var(--accent)] mx-auto opacity-80" />
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              Snap or upload your first meal photo above to log exact macros, sodium, and facial debloating status.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {todayMeals.map((meal) => {
              const isExpanded = expandedTimelineId === meal.id;
              const isSelected = activeMeal?.id === meal.id;
              const timeStr = new Date(meal.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={meal.id}
                  className={`p-3.5 rounded-2xl border transition ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40'
                      : 'bg-slate-50 dark:bg-black/30 border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMealId(meal.id ?? null);
                        setExpandedTimelineId(isExpanded ? null : meal.id ?? null);
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      {meal.photoThumbnail ? (
                        <img
                          src={meal.photoThumbnail}
                          alt={meal.mealTitle}
                          className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <span className="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                          <Utensils className="w-4 h-4 text-[var(--accent)]" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{meal.mealTitle}</p>
                        <p className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {timeStr} · {meal.totalCalories} kcal · P {meal.totalProteinG}g · Na{' '}
                          {meal.totalSodiumMg}mg
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`hidden sm:inline-block px-2 py-0.5 rounded-lg border text-[10px] font-bold ${getDebloatBadgeClasses(
                          meal.debloatStatus
                        )}`}
                      >
                        {meal.debloatStatus === 'optimal'
                          ? 'Debloat OK'
                          : meal.debloatStatus === 'moderate'
                          ? 'Moderate'
                          : 'High Na'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTimelineId(isExpanded ? null : meal.id ?? null)
                        }
                        aria-label="Toggle meal items"
                        className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMeal(meal)}
                        aria-label="Delete meal"
                        className="p-1.5 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-white/10 text-xs space-y-1.5">
                      {meal.items.map((it) => (
                        <div key={it.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {it.name} ({it.portionGrams}g)
                          </span>
                          <span className="font-mono-num text-slate-500 dark:text-slate-300 shrink-0">
                            {it.calories} kcal · {it.proteinG}g P
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Camera Viewfinder Modal */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLiveCamera();
          }}
        >
          <div className="ascend-card max-w-md w-full p-4 space-y-3 border-emerald-500/30">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--accent)]" />
                Live Meal Camera
              </h3>
              <button
                type="button"
                onClick={closeLiveCamera}
                aria-label="Close camera"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraError ? (
              <div className="py-8 px-4 text-center space-y-3">
                <AlertTriangle className="w-7 h-7 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeLiveCamera();
                      nativeCameraInputRef.current?.click();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                  >
                    Snap Mobile Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeLiveCamera();
                      galleryInputRef.current?.click();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white/10 text-xs font-semibold min-h-[44px]"
                  >
                    Upload from Gallery
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-emerald-500/30">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-4 rounded-2xl border border-dashed border-emerald-400/45 pointer-events-none" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeLiveCamera}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-xs font-semibold min-h-[46px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    className="flex-2 py-3 px-6 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[46px]"
                  >
                    Capture &amp; Analyze Plate
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <OnlineConsentModal
        open={consentOpen}
        featureName="AI Food Scan"
        settings={settings}
        onAccept={() => {
          setConsentOpen(false);
          const src = pendingPhotoSourceRef.current;
          pendingPhotoSourceRef.current = null;
          if (src) {
            runVisionAnalysis(src, true);
          }
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingPhotoSourceRef.current = null;
          setScanError('AI meal scan stayed offline. Use Manual Quick-Add instead.');
        }}
      />
    </div>
  );
};
