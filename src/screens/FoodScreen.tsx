import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronRight,
  Droplets,
  Flame,
  HelpCircle,
  ImagePlus,
  ListFilter,
  Loader2,
  Lock,
  MessageSquareText,
  Mic,
  MicOff,
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
  applyFollowUpChip,
  draftItemToMealFoodItem,
  getMissingProteinHelp,
  roundKcal,
  roundProtein,
} from '../lib/foodChatParser';
import { detectUserPatterns } from '../lib/patterns';
import {
  computeDailyNutritionTargets,
  computeDebloatImpact,
  evaluateWeeklyWeightAdjustment,
  prepareMealImageAssets,
  resolveSafeDietGoal,
} from '../lib/nutrition';
import { calculateMifflinStJeor } from '../lib/fitness';
import { FoodFinderModal } from '../components/food/FoodFinderModal';
import { FoodResultCard } from '../components/food/FoodResultCard';
import { TellMeFoodBox } from '../components/food/TellMeFoodBox';
import type { DraftFoodItem, FollowUpChip, FollowUpQuestion } from '../components/food/foodChatTypes';
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
  MealFullness,
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

interface EditableLibraryMeal {
  id: string;
  title: string;
  slot: MealType;
  baseCalories: number;
  baseProteinG: number;
  baseCarbsG: number;
  baseFatsG: number;
  baseSodiumMg: number;
  baseSugarG: number;
  baseGrams: number;
  portionScale: number;
  portionLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  sodiumMg: number;
  addedSugarG: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtorLike = new () => SpeechRecognitionInstanceLike;

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const PORTION_SCALE_OPTIONS = [
  { label: 'Half', scale: 0.5 },
  { label: 'Small', scale: 0.75 },
  { label: 'Normal', scale: 1 },
  { label: 'Big', scale: 1.4 },
];

const FULLNESS_BADGE: Record<MealFullness, string> = {
  still_hungry: 'Still hungry',
  good: 'Good fullness',
  very_full: 'Very full',
};

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

  const tellMeSectionRef = useRef<HTMLDivElement | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<MealType>(() => initialMealType ?? getMealTypeByHour());
  const [scanPanelOpen, setScanPanelOpen] = useState(initialMode === 'scan');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [proteinHelpOpen, setProteinHelpOpen] = useState(false);
  const [showTargetMath, setShowTargetMath] = useState(false);
  const [photoFinderOpen, setPhotoFinderOpen] = useState(false);
  const [photoSwapTargetId, setPhotoSwapTargetId] = useState<string | null>(null);

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

  // Vision Scan State (converted into conversational cards, zero grams-first form)
  const [mealNote, setMealNote] = useState(initialPrefillNote ?? '');
  const [photoVoiceListening, setPhotoVoiceListening] = useState(false);
  const photoSpeechRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [photoDraftItems, setPhotoDraftItems] = useState<DraftFoodItem[]>([]);
  const [photoThumbnail, setPhotoThumbnail] = useState('');
  const [photoSummaryNote, setPhotoSummaryNote] = useState('');
  const [photoClarifyQuestion, setPhotoClarifyQuestion] = useState<FollowUpQuestion | null>(null);
  const [lastPhotoSaved, setLastPhotoSaved] = useState<{
    id: number;
    title: string;
    fullness?: MealFullness;
  } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingPhotoSourceRef = useRef<File | string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialMealType) setSelectedSlot(initialMealType);
  }, [initialMealType]);

  useEffect(() => {
    if (initialMode === 'scan') {
      setScanPanelOpen(true);
    } else if (initialMode === 'quick') {
      setScanPanelOpen(false);
      window.setTimeout(() => {
        tellMeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
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

  useEffect(() => {
    return () => {
      stopCameraStream();
      try {
        photoSpeechRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

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

  const showProteinFeedback = useMemo(() => {
    if (hideCut || ageUnknown) return false;
    return Boolean(profile.ageExplicitlySet && profile.dietGoal && proteinTarget > 0);
  }, [hideCut, ageUnknown, profile.ageExplicitlySet, profile.dietGoal, proteinTarget]);

  const missingProteinHelp = useMemo(
    () => getMissingProteinHelp(proteinTarget - totals.proteinG, selectedSlot),
    [proteinTarget, totals.proteinG, selectedSlot]
  );

  const foodPatterns = useMemo(() => {
    const res = detectUserPatterns({
      todayKey,
      profile,
      dailyLogs,
      mealScans,
      workouts: [],
      bodyMetrics,
      tasks: [],
      completions: [],
      maxCards: 2,
    });
    return {
      ...res,
      cards: res.cards.filter(
        (c) =>
          c.id === 'meal-fullness' ||
          c.id === 'breakfast-gap' ||
          c.id === 'big-lunch' ||
          c.id === 'weight-trend-honesty'
      ),
    };
  }, [todayKey, profile, dailyLogs, mealScans, bodyMetrics]);

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
      showToast(`Added "${logged.mealTitle}" (about ${roundKcal(logged.totalCalories)} kcal)`);
    }
  };

  const handleLogLibraryMeal = async (meal: {
    title: string;
    slot: MealType;
    grams: number;
    portionLabel?: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
    sodiumMg: number;
    addedSugarG: number;
  }, forcedSlot?: MealType) => {
    const targetSlot = forcedSlot ?? (filterByCurrentSlot ? selectedSlot : meal.slot);
    const roundedKcal = roundKcal(meal.calories);
    const roundedPro = roundProtein(meal.proteinG);
    const item: MealFoodItem = {
      id: `lib-${Date.now()}`,
      name: meal.title,
      portionLabel: meal.portionLabel || '1 serving',
      portionGrams: Math.max(20, Math.round(meal.grams)),
      baseGrams: Math.max(20, Math.round(meal.grams)),
      calories: roundedKcal,
      proteinG: roundedPro,
      carbsG: Math.max(0, Math.round(meal.carbsG)),
      fatsG: Math.max(0, Math.round(meal.fatsG)),
      sodiumMg: Math.max(0, Math.round(meal.sodiumMg)),
      addedSugarG: Math.max(0, Math.round(meal.addedSugarG)),
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
      baseCalories: item.calories,
      baseProteinG: item.proteinG,
      baseCarbsG: item.carbsG,
      baseFatsG: item.fatsG,
      baseSodiumMg: item.sodiumMg,
      baseSugarG: item.addedSugarG,
      baseGrams: item.grams,
      portionScale: 1,
      portionLabel: 'Normal portion',
      calories: roundKcal(item.calories),
      proteinG: roundProtein(item.proteinG),
      carbsG: Math.round(item.carbsG),
      fatsG: Math.round(item.fatsG),
      sodiumMg: Math.round(item.sodiumMg),
      addedSugarG: Math.round(item.addedSugarG),
    });
  };

  const updateEditingIdeaPortion = (scale: number, label: string) => {
    if (!editingIdea) return;
    setEditingIdea({
      ...editingIdea,
      portionScale: scale,
      portionLabel: `${label} portion`,
      calories: roundKcal(editingIdea.baseCalories * scale),
      proteinG: roundProtein(editingIdea.baseProteinG * scale),
      carbsG: Math.round(editingIdea.baseCarbsG * scale),
      fatsG: Math.round(editingIdea.baseFatsG * scale),
      sodiumMg: Math.round(editingIdea.baseSodiumMg * scale),
      addedSugarG: Math.round(editingIdea.baseSugarG * scale),
    });
  };

  const startPhotoVoiceNote = () => {
    if (photoVoiceListening && photoSpeechRef.current) {
      photoSpeechRef.current.stop();
      setPhotoVoiceListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtorLike;
      webkitSpeechRecognition?: SpeechRecognitionCtorLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      showToast('Voice typing not supported on this browser — type a quick note instead.', 'info');
      return;
    }
    try {
      const rec = new Ctor();
      photoSpeechRef.current = rec;
      rec.lang = /[\u0600-\u06FF]/.test(mealNote) ? 'ar-EG' : 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      setPhotoVoiceListening(true);
      rec.onresult = (event) => {
        let joined = '';
        for (let i = 0; i < event.results.length; i++) {
          joined += `${event.results[i][0].transcript} `;
        }
        setMealNote(joined.trim());
      };
      rec.onerror = () => setPhotoVoiceListening(false);
      rec.onend = () => setPhotoVoiceListening(false);
      rec.start();
    } catch {
      setPhotoVoiceListening(false);
    }
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
    setPhotoDraftItems([]);
    setPhotoClarifyQuestion(null);
    setLastPhotoSaved(null);
    setAnalyzing(true);

    try {
      const { apiBase64, mimeType, previewDataUrl, thumbnailDataUrl } =
        await prepareMealImageAssets(source);
      setPreviewUrl(previewDataUrl);
      setPhotoThumbnail(thumbnailDataUrl);

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
      const confScore = Math.max(0, Math.min(1, Number(d.confidence ?? 0.65)));
      const confLabel: DraftFoodItem['confidence'] =
        confScore >= 0.78 ? 'High' : confScore >= 0.55 ? 'Medium' : 'Low';
      const overallName = String(d.name || 'Estimated meal').trim();
      const rawItems = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : [];

      const sourceItems =
        rawItems.length > 0
          ? rawItems
          : [
              {
                name: overallName,
                calories: d.calories,
                protein_g: d.protein_g,
                carbs_g: d.carbs_g,
                fats_g: d.fats_g,
                sodium_mg: d.sodium_mg,
                sugar_g: d.sugar_g,
                notes: d.notes,
              },
            ];

      const drafts: DraftFoodItem[] = sourceItems.map((it, idx) => {
        const itemName = String(it.name || overallName).trim();
        const kcal = roundKcal(Number(it.calories) || 0);
        const proteinG = roundProtein(Number(it.protein_g) || 0);
        const sodiumMg = Math.max(0, Math.round(Number(it.sodium_mg) || 280));
        const carbsG = Math.max(0, Math.round(Number(it.carbs_g) || 0));
        const fatsG = Math.max(0, Math.round(Number(it.fats_g) || 0));
        const sugarG = Math.max(0, Math.round(Number(it.sugar_g) || 0));
        const isMixed =
          confScore < 0.75 ||
          /kushari|koshari|shawarma|pasta|rice|stew|tagine|molokhia|pizza|burger|mahshi|kofta|plate|combo|sauce|fried/i.test(
            itemName
          );
        return {
          id: `photo-${Date.now()}-${idx}`,
          name: itemName,
          nameAr: '',
          icon: '🍽️',
          category: 'Egyptian home food',
          portionLabel: rawItems.length > 1 ? 'normal portion' : '1 plate (estimate)',
          quantity: 1,
          unit: 'plate',
          baseKcal: kcal,
          baseProteinG: proteinG,
          baseSodiumMg: sodiumMg,
          baseCarbsG: carbsG,
          baseFatsG: fatsG,
          baseAddedSugarG: sugarG,
          extraKcal: 0,
          extraProteinG: 0,
          kcal,
          kcalMin: isMixed ? roundKcal(kcal * 0.82) : undefined,
          kcalMax: isMixed ? roundKcal(kcal * 1.2) : undefined,
          proteinG,
          sodiumMg,
          confidence: confLabel,
          isMixedOrStreet: isMixed,
          isDrink: false,
          followUpKind: 'hand_plate',
          questionsQueue: [],
          needsQuestion: false,
          source: 'photo',
        };
      });

      setPhotoDraftItems(drafts);
      setPhotoSummaryNote(typeof d.notes === 'string' ? d.notes.trim() : '');

      const hasRicePasta = /rice|pasta|macaroni|koshari|kushari|roz|noodles/i.test(overallName);
      if (hasRicePasta) {
        setPhotoClarifyQuestion({
          step: 1,
          maxSteps: 1,
          text: 'About how big was the rice/pasta side?',
          chips: [
            { id: 'photo-half', label: 'Small / half plate', value: 'small plate', qtyMultiplier: 0.75 },
            { id: 'photo-norm', label: 'Normal plate', value: 'normal plate', qtyMultiplier: 1 },
            { id: 'photo-big', label: 'Big full plate', value: 'big plate', qtyMultiplier: 1.35 },
            { id: 'photo-unk', label: "I don't know / usual", value: 'average portion', qtyMultiplier: 1, isUnknown: true },
          ],
        });
      } else if (confScore < 0.78 || drafts.some((dr) => dr.isMixedOrStreet)) {
        setPhotoClarifyQuestion({
          step: 1,
          maxSteps: 1,
          text: 'How much oil or sauce was used?',
          chips: [
            {
              id: 'sauce-light',
              label: 'Light / grilled dry',
              value: 'light oil/sauce',
              qtyMultiplier: 1,
              extraKcal: -60,
              isDrinkAddonStep: true,
            },
            { id: 'sauce-norm', label: 'Normal', value: 'normal sauce', qtyMultiplier: 1 },
            {
              id: 'sauce-heavy',
              label: 'Extra sauce / fried',
              value: 'extra sauce / fried',
              qtyMultiplier: 1,
              extraKcal: 110,
              isDrinkAddonStep: true,
            },
            { id: 'sauce-unk', label: "I don't know / usual", value: 'average portion', qtyMultiplier: 1, isUnknown: true },
          ],
        });
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Food scan failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!initialSharedFile) return;
    setScanPanelOpen(true);
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

  const handlePhotoClarifyChip = (chip: FollowUpChip) => {
    setPhotoDraftItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== 0) return item;
        if (chip.extraKcal && chip.extraKcal !== 0) {
          const nextKcal = roundKcal(Math.max(20, item.kcal + chip.extraKcal));
          return {
            ...item,
            portionLabel: chip.value,
            kcal: nextKcal,
            kcalMin: item.isMixedOrStreet ? roundKcal(nextKcal * 0.82) : undefined,
            kcalMax: item.isMixedOrStreet ? roundKcal(nextKcal * 1.2) : undefined,
          };
        }
        return applyFollowUpChip(item, chip);
      })
    );
    setPhotoClarifyQuestion(null);
  };

  const handleSavePhotoDrafts = async () => {
    if (photoDraftItems.length === 0) return;
    const foodItems = photoDraftItems.map(draftItemToMealFoodItem);
    const totalCal = roundKcal(foodItems.reduce((s, it) => s + it.calories, 0));
    const totalPro = roundProtein(foodItems.reduce((s, it) => s + it.proteinG, 0));
    const totalCarbs = Math.round(foodItems.reduce((s, it) => s + it.carbsG, 0));
    const totalFats = Math.round(foodItems.reduce((s, it) => s + it.fatsG, 0));
    const totalSod = Math.round(foodItems.reduce((s, it) => s + it.sodiumMg, 0));
    const totalSug = Math.round(foodItems.reduce((s, it) => s + it.addedSugarG, 0));
    const title = photoDraftItems.map((d) => d.name).join(' + ').slice(0, 80);
    const debloat = computeDebloatImpact(totalSod, totalSug);
    const conf = photoDraftItems[0]?.confidence ?? 'Medium';

    const entryId = await saveMealScanEntry({
      date: todayKey,
      timestamp: Date.now(),
      mealType: selectedSlot,
      mealTitle: title,
      confidence: conf,
      items: foodItems,
      totalCalories: totalCal,
      totalProteinG: totalPro,
      totalCarbsG: totalCarbs,
      totalFatsG: totalFats,
      totalSodiumMg: totalSod,
      totalAddedSugarG: totalSug,
      debloatStatus: debloat.status,
      debloatHeadline: debloat.headline,
      summaryNote: photoSummaryNote || `${en.meals[selectedSlot]} · Photo estimate`,
      photoThumbnail: photoThumbnail || undefined,
      isManual: false,
    });

    setLastPhotoSaved({ id: entryId, title });
    setPhotoDraftItems([]);
    setPhotoClarifyQuestion(null);
    setPreviewUrl(null);
    setPhotoThumbnail('');
    setMealNote('');
    setScanPanelOpen(false);
    showToast(`Saved "${title}" to ${en.meals[selectedSlot]}`);
  };

  const handleSetMealFullness = async (mealId: number | undefined, fullness: MealFullness) => {
    if (!mealId) return;
    await db.mealScans.update(mealId, { fullness });
    if (lastPhotoSaved && lastPhotoSaved.id === mealId) {
      setLastPhotoSaved({ ...lastPhotoSaved, fullness });
    }
    showToast(`Saved fullness: ${FULLNESS_BADGE[fullness]}`);
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
              {showTargetMath ? 'Hide details' : "What's this?"}
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
              <p>Calories (kcal) measure daily food energy. Protein helps muscles repair and keeps you full.</p>
              <p className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400">
                Behind the math — BMR: <strong>{mifflinMath.bmr}</strong> kcal · TDEE: <strong>{mifflinMath.tdee}</strong> kcal · Safe floor: <strong>{mifflinMath.safeFloor}</strong> kcal ({mifflinMath.formulaLabel}).
              </p>
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
                    + {item.id === 'eg-areesh-pita' ? 'Areesh & Pita (~29g)' : 'Ful & 2 Eggs (~27g)'}
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
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1.5">
            <div className="flex items-center gap-3.5">
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Steady daily fuel without heavy afternoon swings.
            </p>
          </div>

          {/* Protein Ring */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1.5">
            <div className="flex items-center gap-3.5">
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Helps muscles recover after training and keeps you fuller.
            </p>
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Helps flush extra salt and keeps morning energy steady.
            </p>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => setScanPanelOpen((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            <ScanLine className="w-4 h-4" /> Scan meal
          </button>
          <button
            type="button"
            onClick={() => setProteinHelpOpen((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold min-h-[44px]"
          >
            <HelpCircle className="w-4 h-4" /> Missing protein?
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

      {/* Main Easy Logger: "Tell me what you ate" (Speak / Type / Pick from list) */}
      <div ref={tellMeSectionRef}>
        <TellMeFoodBox
          profile={profile}
          settings={settings}
          mealScans={mealScans}
          selectedSlot={selectedSlot}
          onChangeSlot={setSelectedSlot}
          onOpenCamera={() => {
            setScanPanelOpen(true);
          }}
        />
      </div>

      {/* Smart Help: "How much protein am I missing?" */}
      {proteinHelpOpen && (
        <section className="ascend-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">
                {hideCut ? 'Easy protein ideas' : 'How much protein am I missing?'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {hideCut
                  ? 'Two simple high-protein Egyptian options to support growth and training.'
                  : missingProteinHelp.headline}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setProteinHelpOpen(false)}
              aria-label="Close protein help"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {missingProteinHelp.options.map((opt) => (
              <div
                key={opt.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xl leading-none shrink-0" aria-hidden="true">
                    {opt.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{opt.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.subtitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleLogLibraryMeal({
                      title: opt.title,
                      slot: opt.slot,
                      grams: 220,
                      portionLabel: '1 serving',
                      calories: opt.kcal,
                      proteinG: opt.proteinG,
                      carbsG: 18,
                      fatsG: 6,
                      sodiumMg: opt.sodiumMg,
                      addedSugarG: 2,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px] shrink-0"
                >
                  + Log
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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

          {/* Edit Portion Panel (Everyday portion chips, zero grams form) */}
          {editingIdea && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogLibraryMeal({
                  ...editingIdea,
                  grams: Math.round(editingIdea.baseGrams * editingIdea.portionScale),
                });
              }}
              className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[var(--accent)]">
                    Adjust everyday size before saving
                  </p>
                  <p className="text-[11px] font-mono-num text-slate-600 dark:text-slate-300 mt-0.5">
                    about {editingIdea.calories} kcal · {editingIdea.proteinG} g protein · Estimate
                  </p>
                </div>
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
              <div className="flex flex-wrap gap-1.5">
                {PORTION_SCALE_OPTIONS.map((opt) => {
                  const active = Math.abs(editingIdea.portionScale - opt.scale) < 0.05;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => updateEditingIdeaPortion(opt.scale, opt.label)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[38px] transition ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
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
                          {pick.calorieRange ? `${pick.calorieRange} kcal` : `~${roundKcal(pick.calories)} kcal`} ·{' '}
                          {roundProtein(pick.proteinG)}g protein ·{' '}
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
                        Size
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

      {/* AI Photo Scan Panel (Conversational cards + mic voice-note + 1 clarifying question) */}
      {scanPanelOpen && (
        <section className="ascend-card p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">
                Photo meal estimate for {en.meals[selectedSlot]}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Snap a plate and optionally speak or add a quick note. Photos are not stored.
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

          <div className="flex gap-2">
            <input
              type="text"
              value={mealNote}
              onChange={(e) => setMealNote(e.target.value)}
              placeholder='Optional context (e.g., "my usual lunch, light oil")'
              aria-label="Optional meal photo context note"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base min-h-[44px]"
            />
            <button
              type="button"
              onClick={startPhotoVoiceNote}
              aria-label={photoVoiceListening ? 'Stop voice note' : 'Speak meal photo note'}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 min-h-[44px] shrink-0 transition ${
                photoVoiceListening
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
              }`}
            >
              {photoVoiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[var(--accent)]" />}
              <span className="hidden sm:inline">{photoVoiceListening ? 'Listening' : 'Voice note'}</span>
            </button>
          </div>

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
              Looking at your meal photo...
            </div>
          )}

          {scanError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-xs text-rose-500 space-y-2">
              <p>{scanError}</p>
              <button
                type="button"
                onClick={() => {
                  setScanPanelOpen(false);
                  tellMeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-semibold"
              >
                Tell me what you ate instead
              </button>
            </div>
          )}

          {photoDraftItems.length > 0 && (
            <div className="space-y-3 pt-1">
              {previewUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Scanned meal preview"
                    className="w-20 h-20 rounded-2xl object-cover border border-slate-200 dark:border-white/15 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      Detected {photoDraftItems.length} {photoDraftItems.length === 1 ? 'item' : 'items'}
                    </p>
                    {photoSummaryNote && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {photoSummaryNote}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {photoClarifyQuestion && (
                <div className="p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--accent)]">
                      {photoClarifyQuestion.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhotoClarifyQuestion(null)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    >
                      Skip
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {photoClarifyQuestion.chips.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => handlePhotoClarifyChip(chip)}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/15 text-xs font-semibold min-h-[36px] hover:border-[var(--accent)] transition"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {photoDraftItems.map((item) => (
                  <FoodResultCard
                    key={item.id}
                    item={item}
                    showProteinFeedback={showProteinFeedback}
                    arabicDigits={arabicDigits}
                    onUpdateItem={(updated) =>
                      setPhotoDraftItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
                    }
                    onSwapItem={(target) => {
                      setPhotoSwapTargetId(target.id);
                      setPhotoFinderOpen(true);
                    }}
                    onRemoveItem={(id) =>
                      setPhotoDraftItems((prev) => prev.filter((it) => it.id !== id))
                    }
                  />
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-white/10">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-mono-num font-bold text-slate-900 dark:text-white">
                    Total:{' '}
                    {formatDisplayNumber(
                      roundKcal(photoDraftItems.reduce((s, d) => s + d.kcal, 0)),
                      arabicDigits
                    )}{' '}
                    kcal ·{' '}
                    {formatDisplayNumber(
                      roundProtein(photoDraftItems.reduce((s, d) => s + d.proteinG, 0)),
                      arabicDigits
                    )}
                    g protein
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Estimate. Edit portion if it looks off.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoSwapTargetId(null);
                      setPhotoFinderOpen(true);
                    }}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[42px] inline-flex items-center gap-1"
                  >
                    <ListFilter className="w-3.5 h-3.5" /> + Add item
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePhotoDrafts}
                    className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px] inline-flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Save to {en.meals[selectedSlot]}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Post-save 1-tap optional fullness prompt after photo save */}
      {lastPhotoSaved && !lastPhotoSaved.fullness && (
        <section className="ascend-card p-3.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Saved "{lastPhotoSaved.title}". How did that meal leave you feeling? (optional)
          </p>
          <div className="flex items-center gap-1.5">
            {([
              { id: 'still_hungry', label: 'Still hungry' },
              { id: 'good', label: 'Good' },
              { id: 'very_full', label: 'Very full' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetMealFullness(lastPhotoSaved.id, opt.id)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px] hover:border-[var(--accent)]"
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLastPhotoSaved(null)}
              aria-label="Dismiss fullness check"
              className="p-1.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Real Weekly Food Pattern Cards */}
      {(foodPatterns.cards.length > 0 || foodPatterns.insufficientSummary) && (
        <section className="ascend-card p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" /> Your Eating Patterns
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">From your logs</span>
          </div>
          {foodPatterns.cards.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {foodPatterns.insufficientSummary ||
                'Log meals and tap how full you feel for a few days to spot weekly patterns.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {foodPatterns.cards.map((card) => (
                <div
                  key={card.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-1"
                >
                  <p className="text-xs font-bold text-[var(--accent)]">{card.title}</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{card.headline}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {card.suggestion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Today's Timeline: Breakfast · Lunch · Dinner · Snacks */}
      <section className="space-y-3">
        {todayMeals.length === 0 && !scanPanelOpen && (
          <EmptyState
            icon={<Utensils className="w-6 h-6" />}
            title="No meals logged today yet"
            message='Speak or type what you ate above, or tap Scan meal for a quick plate photo.'
            actionLabel="Tell me what you ate"
            onAction={() => {
              tellMeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        )}

        {MEAL_ORDER.map((slot) => {
          const items = mealsBySlot[slot];
          const slotCal = roundKcal(items.reduce((s, m) => s + m.totalCalories, 0));
          const slotPro = roundProtein(items.reduce((s, m) => s + m.totalProteinG, 0));
          return (
            <div key={slot} className="ascend-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">{en.meals[slot]}</h2>
                  <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                    {items.length === 0
                      ? 'Nothing logged yet'
                      : `about ${slotCal} kcal · ${slotPro}g protein`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    tellMeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] text-xs font-bold min-h-[40px]"
                >
                  + Add
                </button>
              </div>

              {items.length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-white/10">
                  {items.map((meal) => (
                    <div key={meal.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {meal.photoThumbnail && (
                          <img
                            src={meal.photoThumbnail}
                            alt={meal.mealTitle}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-white/10"
                          />
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold truncate">{meal.mealTitle}</p>
                          <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                            about {roundKcal(meal.totalCalories)} kcal · {roundProtein(meal.totalProteinG)}g protein
                            {meal.items[0]?.portionLabel ? ` · ${meal.items[0].portionLabel}` : ''}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {meal.fullness ? (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/10 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                {FULLNESS_BADGE[meal.fullness]}
                              </span>
                            ) : (
                              <>
                                {([
                                  { id: 'still_hungry', label: 'Still hungry' },
                                  { id: 'good', label: 'Good' },
                                  { id: 'very_full', label: 'Very full' },
                                ] as const).map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => handleSetMealFullness(meal.id, f.id)}
                                    className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)] text-[10px] font-medium text-slate-500 dark:text-slate-400"
                                  >
                                    {f.label}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
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

      <FoodFinderModal
        open={photoFinderOpen}
        currentSlot={selectedSlot}
        settings={settings}
        mealScans={mealScans}
        initialSearch={
          photoSwapTargetId
            ? photoDraftItems.find((d) => d.id === photoSwapTargetId)?.name ?? ''
            : ''
        }
        swapTargetName={
          photoSwapTargetId
            ? photoDraftItems.find((d) => d.id === photoSwapTargetId)?.name
            : undefined
        }
        onClose={() => {
          setPhotoFinderOpen(false);
          setPhotoSwapTargetId(null);
        }}
        onSelectDraft={(draft) => {
          if (photoSwapTargetId) {
            setPhotoDraftItems((prev) =>
              prev.map((d) => (d.id === photoSwapTargetId ? draft : d))
            );
          } else {
            setPhotoDraftItems((prev) => [...prev, draft]);
          }
          setPhotoFinderOpen(false);
          setPhotoSwapTargetId(null);
        }}
      />

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
          setScanError('AI meal scan stayed offline. Tell me what you ate or pick from the list instead.');
        }}
      />
    </div>
  );
};
