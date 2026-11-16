import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Droplets,
  Flame,
  HelpCircle,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  Repeat2,
  ScanLine,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from 'lucide-react';
import {
  db,
  deleteMealScanEntry,
  getOrCreateDailyLog,
  isAboutMeItemConfirmed,
  isAgeUnknown,
  isUnder18OrGrowing,
  logSameAsUsualMeal,
  repeatYesterdaysMeals,
  saveAndVerifyProfile,
  saveMealScanEntry,
} from '../db/database';
import { MEAL_LIBRARY, evaluateMealFitForToday, type LibraryMealItem } from '../data/mealLibrary';
import { formatDisplayNumber } from '../i18n/arabicHints';
import { en, getMealTypeByHour } from '../i18n/en';
import { addDays, toLocalDateKey } from '../lib/date';
import { apiRequest, hasOnlineConsent } from '../lib/api';
import {
  computeDailyNutritionTargets,
  computeDebloatImpact,
  evaluateWeeklyWeightAdjustment,
  prepareMealImageAssets,
  resolveSafeDietGoal,
} from '../lib/nutrition';
import { calculateMifflinStJeor } from '../lib/fitness';
import { OnlineConsentModal } from '../components/modals/OnlineConsentModal';
import { CircularRing } from '../components/ui/ProgressRings';
import { EmptyState } from '../components/ui/Skeletons';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  DietGoalMode,
  MealFoodItem,
  MealScanEntry,
  MealType,
  UserProfile,
} from '../types';

interface FoodScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  dailyLogs: DailyLog[];
  mealScans: MealScanEntry[];
  bodyMetrics?: BodyMetricEntry[];
  initialMealType?: MealType;
  initialMode?: 'timeline' | 'scan' | 'quick';
  initialPrefillNote?: string;
  initialSharedFile?: File | null;
  onConsumeSharedInput?: () => void;
  onOpenNutritionVault: () => void;
  onOpenDiet?: () => void;
  onOpenCoach?: () => void;
}

interface PendingFoodEstimate {
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
}

interface EditableLibraryMeal {
  id: string;
  title: string;
  slot: MealType;
  baseGrams: number;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  sodiumMg: number;
  addedSugarG: number;
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function resolveMealSlot(entry: MealScanEntry): MealType {
  if (entry.mealType) return entry.mealType;
  return getMealTypeByHour(new Date(entry.timestamp));
}

export const FoodScreen: React.FC<FoodScreenProps> = ({
  profile,
  settings,
  dailyLogs,
  mealScans,
  bodyMetrics = [],
  initialMealType,
  initialMode,
  initialPrefillNote,
  initialSharedFile,
  onConsumeSharedInput,
  onOpenNutritionVault,
  onOpenDiet,
  onOpenCoach,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const hideCut = isUnder18OrGrowing(profile);
  const ageUnknown = isAgeUnknown(profile);

  const { goal: activeGoal, cutLocked, lockReason } = useMemo(
    () => resolveSafeDietGoal(profile),
    [profile]
  );

  const localFoodsConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'location_foods');
  const eatingPatternConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'eating_pattern');
  const trainingCampConfirmed = isAboutMeItemConfirmed(profile.aboutMe, 'training_camp');
  const dayMode = settings.dayModeByDate?.[todayKey] ?? 'gym';
  const arabicDigits = Boolean(settings.arabicIndicDigits);

  const [selectedSlot, setSelectedSlot] = useState<MealType>(() => initialMealType ?? getMealTypeByHour());
  const [scanPanelOpen, setScanPanelOpen] = useState(initialMode === 'scan');
  const [quickPanelOpen, setQuickPanelOpen] = useState(initialMode === 'quick');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [showTargetMath, setShowTargetMath] = useState(false);

  // "What should I eat?" ~60-meal library filter & edit state
  const [mealSearch, setMealSearch] = useState('');
  const [staplesOnly, setStaplesOnly] = useState(() => localFoodsConfirmed);
  const [filterByCurrentSlot, setFilterByCurrentSlot] = useState(true);
  const [editingIdea, setEditingIdea] = useState<EditableLibraryMeal | null>(null);

  useEffect(() => {
    if (localFoodsConfirmed) {
      setStaplesOnly(true);
    }
  }, [localFoodsConfirmed]);

  // Vision Scan State
  const [mealNote, setMealNote] = useState(initialPrefillNote ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<PendingFoodEstimate | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingPhotoSourceRef = useRef<File | string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  // Quick Add State (remembers last submitted values)
  const [quickName, setQuickName] = useState('');
  const [quickCalories, setQuickCalories] = useState(() =>
    String(settings.quickMealLastInputs?.calories ?? '450')
  );
  const [quickProtein, setQuickProtein] = useState(() =>
    String(settings.quickMealLastInputs?.protein ?? '35')
  );
  const [quickSodium, setQuickSodium] = useState(() =>
    String(settings.quickMealLastInputs?.sodium ?? '450')
  );

  useEffect(() => {
    if (initialMealType) setSelectedSlot(initialMealType);
  }, [initialMealType]);

  useEffect(() => {
    if (initialMode === 'scan') {
      setScanPanelOpen(true);
      setQuickPanelOpen(false);
    } else if (initialMode === 'quick') {
      setQuickPanelOpen(true);
      setScanPanelOpen(false);
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialPrefillNote) {
      setMealNote(initialPrefillNote);
    }
  }, [initialPrefillNote]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => stopCameraStream(), []);

  const targets = useMemo(
    () => computeDailyNutritionTargets(profile, activeGoal),
    [profile, activeGoal]
  );

  const mifflinMath = useMemo(
    () =>
      calculateMifflinStJeor({
        sex: profile.sex,
        weightKg: profile.weightKg || 74,
        heightCm: profile.heightCm || 178,
        age: profile.age || 24,
        activityLevel: profile.activityLevel || 'moderate',
        goalMode: activeGoal,
      }),
    [profile, activeGoal]
  );

  const calTarget = cutLocked ? targets.calories : profile.calorieGoal || targets.calories;
  const proteinTarget = profile.proteinTargetG || targets.proteinG;
  const waterTarget = profile.waterTargetMl || targets.debloatWaterMl;

  const todayLog = useMemo(() => dailyLogs.find((l) => l.date === todayKey), [dailyLogs, todayKey]);
  const todayMeals = useMemo(
    () =>
      mealScans
        .filter((m) => m.date === todayKey)
        .sort((a, b) => a.timestamp - b.timestamp),
    [mealScans, todayKey]
  );

  const totals = useMemo(() => {
    const mealCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const mealPro = todayMeals.reduce((s, m) => s + m.totalProteinG, 0);
    const mealSodium = todayMeals.reduce((s, m) => s + m.totalSodiumMg, 0);
    const cal = Math.max(mealCal, todayLog?.calories ?? 0);
    const pro = Number(Math.max(mealPro, todayLog?.proteinG ?? 0).toFixed(1));
    return {
      calories: cal,
      proteinG: pro,
      sodiumMg: mealSodium,
      waterMl: todayLog?.waterMl ?? 0,
    };
  }, [todayMeals, todayLog]);

  const caloriesLeft = Math.max(0, calTarget - totals.calories);
  const caloriePct = Math.min(100, Math.round((totals.calories / Math.max(1, calTarget)) * 100));
  const proteinPct = Math.min(100, Math.round((totals.proteinG / Math.max(1, proteinTarget)) * 100));
  const waterPct = Math.min(100, Math.round((totals.waterMl / Math.max(500, waterTarget)) * 100));

  const weeklyAdjust = useMemo(
    () => evaluateWeeklyWeightAdjustment(profile, bodyMetrics, todayKey),
    [profile, bodyMetrics, todayKey]
  );

  // Real Weight, Waist & Calorie 14-day Trend Data
  const trendSummary = useMemo(() => {
    const sortedMetrics = [...bodyMetrics]
      .filter((m) => m.weightKg > 20)
      .sort((a, b) => a.date.localeCompare(b.date));
    const recentWeights = sortedMetrics.slice(-14);
    const latestWeight = sortedMetrics.at(-1)?.weightKg ?? null;
    const sevenDayStart = addDays(todayKey, -6);
    const last7Weights = sortedMetrics.filter((m) => m.date >= sevenDayStart && m.date <= todayKey);
    const sevenDayAvg = last7Weights.length
      ? Number((last7Weights.reduce((s, m) => s + m.weightKg, 0) / last7Weights.length).toFixed(1))
      : null;

    const waistEntries = sortedMetrics.filter((m) => typeof m.waistCm === 'number' && (m.waistCm ?? 0) > 30);
    const latestWaist = waistEntries.at(-1)?.waistCm ?? null;
    const firstWaist = waistEntries.length >= 2 ? waistEntries[0].waistCm : null;
    const waistDelta =
      latestWaist !== null && firstWaist !== null
        ? Number((latestWaist - firstWaist).toFixed(1))
        : null;

    // Daily calories for last 7 days from real mealScans or dailyLogs
    const last7Days: Array<{ date: string; calories: number }> = [];
    for (let i = -6; i <= 0; i++) {
      const dt = addDays(todayKey, i);
      const dayMealCal = mealScans
        .filter((m) => m.date === dt)
        .reduce((s, m) => s + m.totalCalories, 0);
      const dayLogCal = dailyLogs.find((l) => l.date === dt)?.calories ?? 0;
      last7Days.push({ date: dt, calories: Math.max(dayMealCal, dayLogCal) });
    }
    const loggedCalDays = last7Days.filter((d) => d.calories > 0);
    const avg7dCal = loggedCalDays.length
      ? Math.round(loggedCalDays.reduce((s, d) => s + d.calories, 0) / loggedCalDays.length)
      : null;

    return {
      recentWeights,
      latestWeight,
      sevenDayAvg,
      latestWaist,
      waistDelta,
      last7Days,
      avg7dCal,
      loggedCalCount: loggedCalDays.length,
    };
  }, [bodyMetrics, mealScans, dailyLogs, todayKey]);

  const mealsBySlot = useMemo(() => {
    const map: Record<MealType, MealScanEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const m of todayMeals) {
      map[resolveMealSlot(m)].push(m);
    }
    return map;
  }, [todayMeals]);

  const mealSuggestions = useMemo(() => {
    const proteinLeft = Math.max(0, Math.round(proteinTarget - totals.proteinG));
    const calBudget = caloriesLeft > 120 ? caloriesLeft : Math.round(calTarget * 0.35);
    const q = mealSearch.trim().toLowerCase();

    const matchesFilter = (item: LibraryMealItem) => {
      if (filterByCurrentSlot && item.slot !== selectedSlot) return false;
      if (staplesOnly && !item.isStaple) return false;
      if (q) {
        return (
          item.title.toLowerCase().includes(q) ||
          item.why.toLowerCase().includes(q)
        );
      }
      return true;
    };

    const pool = MEAL_LIBRARY.filter(matchesFilter);

    // Smart score: reward closing protein gap & staying near remaining kcal without excess sodium
    const scored = [...pool].sort((a, b) => {
      const scoreItem = (it: LibraryMealItem) => {
        const proteinMatch = proteinLeft > 0 ? Math.min(proteinLeft, it.proteinG) * 2.2 : it.proteinG;
        const calDiffPenalty = Math.abs(it.calories - calBudget) * 0.06;
        const lowSodiumBonus = it.sodiumMg <= 450 ? 10 : 0;
        const stapleBonus = it.isStaple ? 4 : 0;
        return proteinMatch - calDiffPenalty + lowSodiumBonus + stapleBonus;
      };
      return scoreItem(b) - scoreItem(a);
    });

    return {
      proteinLeft,
      calLeft: caloriesLeft,
      topPicks: scored.slice(0, 3),
      allMatching: scored,
    };
  }, [
    proteinTarget,
    totals.proteinG,
    caloriesLeft,
    calTarget,
    selectedSlot,
    filterByCurrentSlot,
    staplesOnly,
    mealSearch,
  ]);

  const handleSelectDietGoal = async (nextGoal: DietGoalMode) => {
    const resolved = resolveSafeDietGoal(profile, nextGoal);
    if (nextGoal === 'cut' && resolved.cutLocked) {
      showToast(
        resolved.lockReason === 'underweight'
          ? 'Lose fat is locked while BMI is under 18.5.'
          : ageUnknown
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
    const label =
      resolved.goal === 'cut'
        ? en.diet.loseFat
        : resolved.goal === 'lean_gain'
        ? en.diet.buildMuscle
        : en.diet.staySame;
    showToast(`Goal set: ${label} (${nextTargets.calories} kcal · ${nextTargets.proteinG}g protein)`);
  };

  const handleApplyWeeklyAdjustment = async () => {
    if (weeklyAdjust.suggestedCalorieGoal === null || weeklyAdjust.deltaCalories === 0) return;
    await saveAndVerifyProfile({
      ...profile,
      calorieGoal: weeklyAdjust.suggestedCalorieGoal,
    });
    showToast(`Daily calorie target updated to ${weeklyAdjust.suggestedCalorieGoal} kcal`);
  };

  const handleAddWater = async (ml: number) => {
    const log = await getOrCreateDailyLog(todayKey);
    await db.dailyLogs.update(todayKey, {
      waterMl: Math.max(0, (log.waterMl || 0) + ml),
      updatedAt: Date.now(),
    });
    showToast(`+${ml} ml water logged`);
  };

  const handleRepeatYesterday = async () => {
    const count = await repeatYesterdaysMeals(todayKey);
    if (count === 0) {
      showToast('No meals logged yesterday to copy.', 'info');
    } else {
      showToast(`Copied ${count} meal${count === 1 ? '' : 's'} from yesterday`);
    }
  };

  const handleSameAsUsual = async () => {
    const logged = await logSameAsUsualMeal(todayKey, selectedSlot);
    if (!logged) {
      showToast(`Log your first ${en.meals[selectedSlot].toLowerCase()} meal to unlock 1-tap Same as usual.`, 'info');
    } else {
      showToast(`Added "${logged.mealTitle}" (${logged.totalCalories} kcal)`);
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickName.trim() || `${en.meals[selectedSlot]} meal`;
    const kcal = Math.max(0, Math.round(Number(quickCalories) || 0));
    const pro = Math.max(0, Number(Number(quickProtein || 0).toFixed(1)));
    const sod = Math.max(0, Math.round(Number(quickSodium) || 0));
    const item: MealFoodItem = {
      id: `quick-${Date.now()}`,
      name,
      portionGrams: 250,
      baseGrams: 250,
      calories: kcal,
      proteinG: pro,
      carbsG: 0,
      fatsG: 0,
      sodiumMg: sod,
      addedSugarG: 0,
    };
    const debloat = computeDebloatImpact(sod, 0);
    await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealType: selectedSlot,
      mealTitle: name,
      confidence: 'High',
      items: [item],
      totalCalories: kcal,
      totalProteinG: pro,
      totalCarbsG: 0,
      totalFatsG: 0,
      totalSodiumMg: sod,
      totalAddedSugarG: 0,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: `${en.meals[selectedSlot]} · Quick add`,
      isManual: true,
    });
    await db.settings.update('app', {
      quickMealLastInputs: {
        name,
        calories: String(kcal),
        protein: String(pro),
        sodium: String(sod),
      },
    });
    setQuickName('');
    setQuickPanelOpen(false);
    showToast(`Added "${name}" to ${en.meals[selectedSlot]}`);
  };

  const handleLogLibraryMeal = async (meal: {
    title: string;
    slot: MealType;
    grams: number;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
    sodiumMg: number;
    addedSugarG: number;
  }, forcedSlot?: MealType) => {
    const targetSlot = forcedSlot ?? (filterByCurrentSlot ? selectedSlot : meal.slot);
    const item: MealFoodItem = {
      id: `lib-${Date.now()}`,
      name: meal.title,
      portionGrams: Math.max(20, Math.round(meal.grams)),
      baseGrams: Math.max(20, Math.round(meal.grams)),
      calories: Math.max(0, Math.round(meal.calories)),
      proteinG: Math.max(0, Number(meal.proteinG.toFixed(1))),
      carbsG: Math.max(0, Number(meal.carbsG.toFixed(1))),
      fatsG: Math.max(0, Number(meal.fatsG.toFixed(1))),
      sodiumMg: Math.max(0, Math.round(meal.sodiumMg)),
      addedSugarG: Math.max(0, Number(meal.addedSugarG.toFixed(1))),
    };
    const debloat = computeDebloatImpact(item.sodiumMg, item.addedSugarG);
    await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealType: targetSlot,
      mealTitle: item.name,
      confidence: 'Medium',
      items: [item],
      totalCalories: item.calories,
      totalProteinG: item.proteinG,
      totalCarbsG: item.carbsG,
      totalFatsG: item.fatsG,
      totalSodiumMg: item.sodiumMg,
      totalAddedSugarG: item.addedSugarG,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: `${en.meals[targetSlot]} · Meal library estimate`,
      isManual: true,
    });
    setEditingIdea(null);
    setIdeasOpen(false);
    showToast(`Logged "${item.name}" to ${en.meals[targetSlot]}`);
  };

  const quickEgyptianBreakfasts = useMemo(
    () =>
      MEAL_LIBRARY.filter((m) => m.id === 'eg-areesh-pita' || m.id === 'eg-foul-eggs'),
    []
  );

  const startEditIdea = (item: LibraryMealItem) => {
    setEditingIdea({
      id: item.id,
      title: item.title,
      slot: item.slot,
      baseGrams: item.grams,
      grams: item.grams,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatsG: item.fatsG,
      sodiumMg: item.sodiumMg,
      addedSugarG: item.addedSugarG,
    });
  };

  const updateEditingIdeaGrams = (nextGrams: number) => {
    if (!editingIdea) return;
    const clamped = Math.max(20, Math.min(2000, Math.round(nextGrams || 0)));
    const factor = clamped / Math.max(1, editingIdea.grams);
    setEditingIdea({
      ...editingIdea,
      grams: clamped,
      calories: Math.round(editingIdea.calories * factor),
      proteinG: Number((editingIdea.proteinG * factor).toFixed(1)),
      carbsG: Number((editingIdea.carbsG * factor).toFixed(1)),
      fatsG: Number((editingIdea.fatsG * factor).toFixed(1)),
      sodiumMg: Math.round(editingIdea.sodiumMg * factor),
      addedSugarG: Number((editingIdea.addedSugarG * factor).toFixed(1)),
    });
  };

  const openLiveCamera = async () => {
    setCameraError(null);
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera unsupported here. Use Photo or Gallery below.');
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
    } catch {
      setCameraError('Camera access blocked or unavailable. Use Photo or Gallery below.');
    }
  };

  const closeLiveCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  };

  const runVisionScan = async (source: File | string, bypassConsentCheck = false) => {
    if (!bypassConsentCheck && !hasOnlineConsent(settings, 'food')) {
      pendingPhotoSourceRef.current = source;
      setConsentOpen(true);
      return;
    }

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
          context: mealNote.trim() || `${en.meals[selectedSlot]} meal`,
        },
      });

      if (!res.ok) {
        setScanError(res.detail || res.error || 'Food scan failed.');
        return;
      }

      const d = res.data;
      setPendingEstimate({
        name: String(d.name || 'Estimated Meal').trim(),
        portion_g: Math.max(5, Math.round(Number(d.portion_g) || 250)),
        calories: Math.max(0, Math.round(Number(d.calories) || 0)),
        protein_g: Math.max(0, Number(Number(d.protein_g || 0).toFixed(1))),
        carbs_g: Math.max(0, Number(Number(d.carbs_g || 0).toFixed(1))),
        fats_g: Math.max(0, Number(Number(d.fats_g || 0).toFixed(1))),
        sodium_mg: Math.max(0, Math.round(Number(d.sodium_mg) || 0)),
        sugar_g: Math.max(0, Number(Number(d.sugar_g || 0).toFixed(1))),
        confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 0.65))),
        notes: typeof d.notes === 'string' ? d.notes.trim() : '',
        photoThumbnail: thumbnailDataUrl,
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Food scan failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!initialSharedFile) return;
    setScanPanelOpen(true);
    setQuickPanelOpen(false);
    onConsumeSharedInput?.();
    runVisionScan(initialSharedFile);
  }, [initialSharedFile]);

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    closeLiveCamera();
    await runVisionScan(dataUrl);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await runVisionScan(file);
  };

  const handleSaveScanEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEstimate) return;
    const item: MealFoodItem = {
      id: `scan-${Date.now()}`,
      name: pendingEstimate.name.trim() || 'Scanned meal',
      portionGrams: pendingEstimate.portion_g,
      baseGrams: pendingEstimate.portion_g,
      calories: Math.max(0, Math.round(pendingEstimate.calories)),
      proteinG: Math.max(0, Number(pendingEstimate.protein_g.toFixed(1))),
      carbsG: Math.max(0, Number(pendingEstimate.carbs_g.toFixed(1))),
      fatsG: Math.max(0, Number(pendingEstimate.fats_g.toFixed(1))),
      sodiumMg: Math.max(0, Math.round(pendingEstimate.sodium_mg)),
      addedSugarG: Math.max(0, Number(pendingEstimate.sugar_g.toFixed(1))),
      notes: pendingEstimate.notes,
    };
    const debloat = computeDebloatImpact(item.sodiumMg, item.addedSugarG);
    await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealType: selectedSlot,
      mealTitle: item.name,
      confidence: pendingEstimate.confidence >= 0.78 ? 'High' : pendingEstimate.confidence >= 0.55 ? 'Medium' : 'Low',
      items: [item],
      totalCalories: item.calories,
      totalProteinG: item.proteinG,
      totalCarbsG: item.carbsG,
      totalFatsG: item.fatsG,
      totalSodiumMg: item.sodiumMg,
      totalAddedSugarG: item.addedSugarG,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: pendingEstimate.notes || `${en.meals[selectedSlot]} · AI Plate Scan`,
      photoThumbnail: pendingEstimate.photoThumbnail,
      isManual: false,
    });
    setPendingEstimate(null);
    setPreviewUrl(null);
    setMealNote('');
    setScanPanelOpen(false);
    showToast(`Saved "${item.name}" to ${en.meals[selectedSlot]}`);
  };

  return (
    <div className="space-y-4">
      {hideCut && (
        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-start gap-2.5 text-xs">
          <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{en.safety.under18Headline}</p>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5">{en.safety.under18Body}</p>
          </div>
        </div>
      )}

      {/* Top Rings: Calories + Protein + Water + Unified Diet Goal */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold">Food &amp; Hydration</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hideCut ? 'Daily fuel & protein tracker' : 'Calories, protein & debloat balance'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenCoach && (
              <button
                type="button"
                onClick={onOpenCoach}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[40px]"
              >
                <MessageSquareText className="w-3.5 h-3.5" /> Ask
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNutritionVault}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              Full vault <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* My Goal Picker */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {en.diet.goalTitle}
            </span>
            <button
              type="button"
              onClick={() => setShowTargetMath((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[var(--accent)] min-h-[32px]"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {showTargetMath ? 'Hide math' : 'How targets work'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'cut', label: en.diet.loseFat },
              { id: 'maintain', label: en.diet.staySame },
              { id: 'lean_gain', label: en.diet.buildMuscle },
            ] as const).map((option) => {
              const locked = option.id === 'cut' && cutLocked;
              const active = activeGoal === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={locked}
                  onClick={() => handleSelectDietGoal(option.id)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold min-h-[40px] flex items-center justify-center gap-1 transition ${
                    locked
                      ? 'bg-slate-100 dark:bg-white/[0.02] text-slate-400 border border-slate-200/60 dark:border-white/5 cursor-not-allowed'
                      : active
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                      : 'bg-white dark:bg-white/[0.05] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {locked && <Lock className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
          {cutLocked && (
            <p className="text-[11px] text-sky-700 dark:text-sky-300">
              {lockReason === 'underweight'
                ? 'Lose fat is locked while BMI is under 18.5.'
                : ageUnknown
                ? en.diet.under18Lock
                : en.diet.under18Maintain}
            </p>
          )}
          {showTargetMath && (
            <div className="p-2.5 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-mono-num">
                BMR: <strong>{mifflinMath.bmr}</strong> kcal · TDEE: <strong>{mifflinMath.tdee}</strong> kcal · Safe floor: <strong>{mifflinMath.safeFloor}</strong> kcal
              </p>
              <p>{mifflinMath.formulaLabel} (rough estimate — adjust from your 2-week weight trend below).</p>
            </div>
          )}
        </div>

        {/* Daily Nutrition Context: Day Mode + Confirmed About Me */}
        <div className="p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-[var(--accent)]">
              {dayMode === 'sparring'
                ? 'Sparring day fuel'
                : dayMode === 'mma'
                ? 'MMA conditioning fuel'
                : dayMode === 'rest'
                ? 'Rest day fuel'
                : 'Gym day fuel'}
            </span>
            {trainingCampConfirmed && profile.aboutMe?.weightClassKg && (
              <span className="font-mono-num text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                Class {formatDisplayNumber(profile.aboutMe.weightClassKg, arabicDigits)} kg
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {dayMode === 'sparring' || dayMode === 'mma'
              ? 'Prioritize pre-session carbs, balanced protein across meals, and steady water after training.'
              : dayMode === 'rest'
              ? 'Keep protein steady, favor whole home meals, and keep salty snacks gentle for next-morning recovery.'
              : 'Spread protein across breakfast, lunch, and dinner instead of loading everything late.'}
            {trainingCampConfirmed
              ? ' Safe fight-camp rule: never use dehydration or sauna cuts — check weight changes with your coach and doctor.'
              : ''}
          </p>
          {eatingPatternConfirmed && mealsBySlot.breakfast.length === 0 && (
            <div className="pt-2 border-t border-[var(--accent)]/20 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                No breakfast logged yet — add a quick protein base to prevent a heavy late lunch:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickEgyptianBreakfasts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleLogLibraryMeal(item, 'breakfast')}
                    className="px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-bold min-h-[34px]"
                  >
                    + {item.id === 'eg-areesh-pita' ? 'Areesh & Pita (29g)' : 'Foul & 2 Eggs (27g)'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot('breakfast');
                    setFilterByCurrentSlot(true);
                    setStaplesOnly(true);
                    setIdeasOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-white/10 text-[11px] font-semibold min-h-[34px]"
                >
                  More breakfast ideas
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Calories Ring */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3.5">
            <CircularRing value={caloriePct} size={68} strokeWidth={7} color="var(--accent)">
              <span className="font-mono-num text-xs font-bold">
                {formatDisplayNumber(`${caloriePct}%`, arabicDigits)}
              </span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Calories</p>
              <p className="font-mono-num text-lg font-bold">
                {formatDisplayNumber(totals.calories, arabicDigits)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatDisplayNumber(calTarget, arabicDigits)}
                </span>
              </p>
              <p className="text-xs font-mono-num text-[var(--accent)]">
                {hideCut
                  ? 'Steady fuel target'
                  : `${formatDisplayNumber(caloriesLeft, arabicDigits)} kcal left`}
              </p>
            </div>
          </div>

          {/* Protein Ring */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3.5">
            <CircularRing value={proteinPct} size={68} strokeWidth={7} color="#10B981">
              <span className="font-mono-num text-xs font-bold">
                {formatDisplayNumber(`${proteinPct}%`, arabicDigits)}
              </span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Protein</p>
              <p className="font-mono-num text-lg font-bold">
                {formatDisplayNumber(`${totals.proteinG}g`, arabicDigits)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatDisplayNumber(`${proteinTarget}g`, arabicDigits)}
                </span>
              </p>
              <p className="text-xs font-mono-num text-emerald-500">
                {formatDisplayNumber(`${Math.max(0, Math.round(proteinTarget - totals.proteinG))}g left`, arabicDigits)}
              </p>
            </div>
          </div>

          {/* Water Tracker */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                <Droplets className="w-4 h-4" /> Water
              </span>
              <span className="font-mono-num text-xs font-bold">
                {formatDisplayNumber((totals.waterMl / 1000).toFixed(2), arabicDigits)}L /{' '}
                {formatDisplayNumber((waterTarget / 1000).toFixed(1), arabicDigits)}L
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${waterPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[250, 500].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => handleAddWater(ml)}
                  className="py-1.5 rounded-xl bg-sky-500/12 text-sky-400 font-mono-num text-xs font-bold min-h-[38px]"
                >
                  +{formatDisplayNumber(ml, arabicDigits)}ml
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Primary Actions: Scan meal · Quick add · Diet · Same as usual · Repeat yesterday · What should I eat? */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => {
              setScanPanelOpen((v) => !v);
              setQuickPanelOpen(false);
            }}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            <ScanLine className="w-4 h-4" /> Scan meal
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickPanelOpen((v) => !v);
              setScanPanelOpen(false);
            }}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> Quick add
          </button>
          {onOpenDiet && (
            <button
              type="button"
              onClick={onOpenDiet}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold min-h-[44px]"
            >
              <Flame className="w-4 h-4" /> Diet
            </button>
          )}
          <button
            type="button"
            onClick={handleSameAsUsual}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
          >
            <Check className="w-4 h-4 text-[var(--accent)]" /> Same as usual
          </button>
          <button
            type="button"
            onClick={handleRepeatYesterday}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
          >
            <Repeat2 className="w-4 h-4" /> Repeat yesterday
          </button>
          <button
            type="button"
            onClick={() => setIdeasOpen((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" /> What to eat?
          </button>
        </div>

        {/* Meal-Time Selector */}
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.04]">
          {MEAL_ORDER.map((slot) => {
            const active = selectedSlot === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={`py-2 px-1 rounded-xl text-xs font-semibold min-h-[40px] transition ${
                  active
                    ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {en.meals[slot]}
              </button>
            );
          })}
        </div>
      </section>

      {/* What should I eat? (~60-meal local library with Egyptian staples + customizable estimates) */}
      {ideasOpen && (
        <section className="ascend-card p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base font-bold">
                  What should I eat?
                </h2>
                <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[10px] font-bold uppercase tracking-wider">
                  Estimate · {MEAL_LIBRARY.length} meals
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Left today: <strong>{mealSuggestions.proteinLeft}g protein</strong>
                {!hideCut ? ` · ${mealSuggestions.calLeft} kcal left` : ''} · Rough estimates, editable before saving.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIdeasOpen(false)}
              aria-label="Close meal suggestions"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={mealSearch}
                onChange={(e) => setMealSearch(e.target.value)}
                placeholder="Search chicken, foul, eggs, salmon, dates..."
                aria-label="Search meal library"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base sm:text-xs min-h-[42px]"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setFilterByCurrentSlot((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[42px] border transition ${
                  filterByCurrentSlot
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                }`}
              >
                {filterByCurrentSlot ? en.meals[selectedSlot] : 'All meals'}
              </button>
              <button
                type="button"
                onClick={() => setStaplesOnly((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[42px] border transition ${
                  staplesOnly
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300'
                }`}
              >
                Egyptian &amp; staples
              </button>
            </div>
          </div>

          {/* Edit Estimate Panel */}
          {editingIdea && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogLibraryMeal(editingIdea);
              }}
              className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--accent)]">
                  Customize estimate before logging
                </p>
                <button
                  type="button"
                  onClick={() => setEditingIdea(null)}
                  aria-label="Cancel meal edit"
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={editingIdea.title}
                onChange={(e) => setEditingIdea({ ...editingIdea, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-base sm:text-xs font-semibold min-h-[40px]"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Grams (auto-scales)</label>
                  <input
                    type="number"
                    min={20}
                    value={editingIdea.grams}
                    onChange={(e) => updateEditingIdeaGrams(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num text-base sm:text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Calories (est.)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingIdea.calories}
                    onChange={(e) => setEditingIdea({ ...editingIdea, calories: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num text-base sm:text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Protein g</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={editingIdea.proteinG}
                    onChange={(e) => setEditingIdea({ ...editingIdea, proteinG: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num text-base sm:text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Sodium mg</label>
                  <input
                    type="number"
                    min={0}
                    value={editingIdea.sodiumMg}
                    onChange={(e) => setEditingIdea({ ...editingIdea, sodiumMg: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] font-mono-num text-base sm:text-xs min-h-[40px]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px]"
              >
                Save estimate to {en.meals[filterByCurrentSlot ? selectedSlot : editingIdea.slot]}
              </button>
            </form>
          )}

          {/* Matching Library List */}
          {mealSuggestions.allMatching.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
              No meals match "{mealSearch}". Try clearing the filter or search term.
            </p>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {mealSuggestions.allMatching.map((pick, idx) => {
                const fitTag = !hideCut
                  ? evaluateMealFitForToday(pick.calories, caloriesLeft)
                  : null;
                return (
                  <div
                    key={pick.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex items-start gap-2.5">
                      <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden="true">
                        {pick.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold">{pick.title}</p>
                          {idx < 3 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold">
                              Best match
                            </span>
                          )}
                          {pick.isStaple && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                              Staple
                            </span>
                          )}
                          {pick.isStreetFood && (
                            <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] font-bold">
                              Street food
                            </span>
                          )}
                          {fitTag && (
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                fitTag === 'Fits today'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                  : fitTag === 'Split or swap lighter'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Fits today? {fitTag}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono-num text-[var(--accent)] mt-0.5">
                          {pick.calorieRange ? `${pick.calorieRange} kcal` : `~${pick.calories} kcal`} ·{' '}
                          {pick.proteinG}g protein · {pick.grams}g · {pick.prepMin}m ·{' '}
                          <span className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                            {en.streetFood.estimateBadge}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{pick.why}</p>
                        {pick.lighterSwap && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-300 mt-0.5">
                            <strong>{en.streetFood.swapLabel}:</strong> {pick.lighterSwap}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditIdea(pick)}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[44px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogLibraryMeal(pick)}
                        className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                      >
                        + Log
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* AI Scan Meal Panel */}
      {scanPanelOpen && (
        <section className="ascend-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">
                Scan meal for {en.meals[selectedSlot]}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Uses plate photo AI to estimate calories, protein, sodium, and sugar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScanPanelOpen(false)}
              aria-label="Close meal scanner"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            value={mealNote}
            onChange={(e) => setMealNote(e.target.value)}
            placeholder="Optional context (e.g., 200g chicken, rice, little sauce)"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={openLiveCamera}
              disabled={analyzing}
              className="py-2.5 px-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <Camera className="w-4 h-4" /> Live Camera
            </button>
            <button
              type="button"
              onClick={() => nativeCameraRef.current?.click()}
              disabled={analyzing}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <Camera className="w-4 h-4" /> Snap Mobile Photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={analyzing}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <ImagePlus className="w-4 h-4" /> Upload Photo
            </button>
          </div>

          <input
            ref={nativeCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilePick}
            className="hidden"
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={handleFilePick}
            className="hidden"
          />

          {analyzing && (
            <div className="p-4 rounded-2xl bg-[var(--accent-soft)] flex items-center gap-3 text-xs font-semibold text-[var(--accent)]">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Analyzing your meal photo...
            </div>
          )}

          {scanError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-xs text-rose-500 space-y-2">
              <p>{scanError}</p>
              <button
                type="button"
                onClick={() => {
                  setScanPanelOpen(false);
                  setQuickPanelOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-semibold"
              >
                Use Quick add instead
              </button>
            </div>
          )}

          {pendingEstimate && (
            <form onSubmit={handleSaveScanEstimate} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-3">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Scanned meal preview"
                  className="w-28 h-28 rounded-2xl object-cover border border-slate-200 dark:border-white/15"
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={pendingEstimate.name}
                  onChange={(e) => setPendingEstimate({ ...pendingEstimate, name: e.target.value })}
                  className="sm:col-span-3 px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-base font-semibold min-h-[44px]"
                />
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Calories</label>
                  <input
                    type="number"
                    value={pendingEstimate.calories}
                    onChange={(e) =>
                      setPendingEstimate({ ...pendingEstimate, calories: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Protein (g)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={pendingEstimate.protein_g}
                    onChange={(e) =>
                      setPendingEstimate({ ...pendingEstimate, protein_g: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Sodium (mg)</label>
                  <input
                    type="number"
                    value={pendingEstimate.sodium_mg}
                    onChange={(e) =>
                      setPendingEstimate({ ...pendingEstimate, sodium_mg: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-mono-num text-base min-h-[44px]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px] inline-flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Save to {en.meals[selectedSlot]}
              </button>
            </form>
          )}
        </section>
      )}

      {/* Quick Add Meal Form */}
      {quickPanelOpen && (
        <form onSubmit={handleQuickAddSubmit} className="ascend-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">
              Quick add to {en.meals[selectedSlot]}
            </h2>
            <button
              type="button"
              onClick={() => setQuickPanelOpen(false)}
              aria-label="Close quick add"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {settings.quickMealLastInputs?.name && !quickName && (
            <button
              type="button"
              onClick={() => {
                setQuickName(settings.quickMealLastInputs?.name ?? '');
                setQuickCalories(String(settings.quickMealLastInputs?.calories ?? '450'));
                setQuickProtein(String(settings.quickMealLastInputs?.protein ?? '35'));
                setQuickSodium(String(settings.quickMealLastInputs?.sodium ?? '450'));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[36px]"
            >
              <Repeat2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              Fill last: {settings.quickMealLastInputs.name} ({settings.quickMealLastInputs.calories} kcal)
            </button>
          )}
          <input
            type="text"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="Meal name (e.g., Chicken bowl & rice)"
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Calories</label>
              <input
                type="number"
                min={0}
                value={quickCalories}
                onChange={(e) => setQuickCalories(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Protein (g)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={quickProtein}
                onChange={(e) => setQuickProtein(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Sodium (mg)</label>
              <input
                type="number"
                min={0}
                value={quickSodium}
                onChange={(e) => setQuickSodium(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base min-h-[44px]"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[44px]"
          >
            Save to {en.meals[selectedSlot]}
          </button>
        </form>
      )}

      {/* Today's Timeline: Breakfast · Lunch · Dinner · Snacks */}
      <section className="space-y-3">
        {todayMeals.length === 0 && !scanPanelOpen && !quickPanelOpen && (
          <EmptyState
            icon={<Utensils className="w-6 h-6" />}
            title="No meals logged today yet"
            message="Tap Scan meal for camera AI or Quick add to log your first meal."
            actionLabel="Quick add meal"
            onAction={() => setQuickPanelOpen(true)}
          />
        )}

        {MEAL_ORDER.map((slot) => {
          const items = mealsBySlot[slot];
          const slotCal = items.reduce((s, m) => s + m.totalCalories, 0);
          const slotPro = items.reduce((s, m) => s + m.totalProteinG, 0);
          return (
            <div key={slot} className="ascend-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">{en.meals[slot]}</h2>
                  <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                    {items.length === 0
                      ? 'Nothing logged yet'
                      : `${slotCal} kcal · ${slotPro.toFixed(0)}g protein`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setQuickPanelOpen(true);
                    setScanPanelOpen(false);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] text-xs font-bold min-h-[40px]"
                >
                  + Add
                </button>
              </div>

              {items.length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-white/10">
                  {items.map((meal) => (
                    <div key={meal.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {meal.photoThumbnail && (
                          <img
                            src={meal.photoThumbnail}
                            alt={meal.mealTitle}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-white/10"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{meal.mealTitle}</p>
                          <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                            {meal.totalCalories} kcal · {meal.totalProteinG}g protein
                            {meal.totalSodiumMg > 0 ? ` · ${meal.totalSodiumMg}mg Na` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMealScanEntry(meal)}
                        aria-label={`Remove ${meal.mealTitle}`}
                        className="p-2 text-slate-400 hover:text-rose-500 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Weekly Auto-Adjust + Weight/Waist/Calorie Trends */}
      <section className="ascend-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="font-display text-base font-bold">Weekly Check &amp; Trends</h2>
          </div>
          <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[10px] font-bold uppercase tracking-wider">
            Estimate
          </span>
        </div>

        {/* 7-day rolling averages + smart auto-adjust */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
          <p className="text-xs font-bold">{weeklyAdjust.headline}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {weeklyAdjust.detail}
          </p>
          {weeklyAdjust.week1AvgKg !== null && weeklyAdjust.week2AvgKg !== null && (
            <p className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
              Prior 7d avg: <strong>{weeklyAdjust.week1AvgKg} kg</strong> · This 7d avg:{' '}
              <strong>{weeklyAdjust.week2AvgKg} kg</strong>
            </p>
          )}
          {(weeklyAdjust.status === 'nudge_down' || weeklyAdjust.status === 'nudge_up') &&
            weeklyAdjust.suggestedCalorieGoal !== null && (
              <button
                type="button"
                onClick={handleApplyWeeklyAdjustment}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
              >
                <Check className="w-3.5 h-3.5" /> Apply {weeklyAdjust.deltaCalories > 0 ? `+${weeklyAdjust.deltaCalories}` : weeklyAdjust.deltaCalories} kcal tweak ({weeklyAdjust.suggestedCalorieGoal} kcal)
              </button>
            )}
        </div>

        {/* Weight, Waist & 7-Day Calorie Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">7-day weight avg</p>
            <p className="font-mono-num text-base font-bold mt-0.5">
              {trendSummary.sevenDayAvg !== null
                ? `${trendSummary.sevenDayAvg} kg`
                : trendSummary.latestWeight !== null
                ? `${trendSummary.latestWeight} kg`
                : 'Not logged'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {trendSummary.recentWeights.length > 0
                ? `${trendSummary.recentWeights.length} recent logs`
                : 'Tap + → Weight to log'}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Waist trend</p>
            <p className="font-mono-num text-base font-bold mt-0.5">
              {trendSummary.latestWaist !== null ? `${trendSummary.latestWaist} cm` : 'Not logged'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {trendSummary.waistDelta !== null
                ? `${trendSummary.waistDelta > 0 ? '+' : ''}${trendSummary.waistDelta} cm vs first log`
                : 'Log waist in Health → Body'}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">7-day calorie avg</p>
            <p className="font-mono-num text-base font-bold mt-0.5">
              {trendSummary.avg7dCal !== null ? `${trendSummary.avg7dCal} kcal` : 'No meal days'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {trendSummary.loggedCalCount}/7 days logged vs {calTarget} goal
            </p>
          </div>
        </div>

        {/* 7-day Calorie Mini Bars */}
        {trendSummary.loggedCalCount > 0 && (
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {trendSummary.last7Days.map((day) => {
              const ratio = Math.min(1.2, day.calories / Math.max(1, calTarget));
              const barPct = Math.round((ratio / 1.2) * 100);
              return (
                <div key={day.date} className="flex flex-col items-center gap-1">
                  <div className="w-full h-14 rounded-lg bg-slate-100 dark:bg-white/5 flex items-end overflow-hidden p-0.5">
                    <div
                      className={`w-full rounded-md transition-all ${
                        day.calories === 0
                          ? 'bg-transparent'
                          : day.calories <= calTarget + 120
                          ? 'bg-[var(--accent)]'
                          : 'bg-amber-400'
                      }`}
                      style={{ height: `${Math.max(day.calories > 0 ? 12 : 0, barPct)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono-num text-slate-400">
                    {day.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Camera Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="ascend-card max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Capture Meal Photo</h3>
              <button
                type="button"
                onClick={closeLiveCamera}
                aria-label="Close camera"
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {cameraError ? (
              <p className="text-xs text-rose-500 py-4 text-center">{cameraError}</p>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full rounded-2xl bg-black aspect-[4/3] object-cover"
                />
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  className="w-full py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
                >
                  Snap &amp; Analyze
                </button>
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
            runVisionScan(src, true);
          }
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingPhotoSourceRef.current = null;
          setScanError('AI meal scan stayed offline. Use Quick add or What should I eat? instead.');
        }}
      />
    </div>
  );
};
