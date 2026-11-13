export type EvidenceTag = 'Proven' | 'Likely works' | 'Not proven';

export type ProtocolCategory =
  | 'sleep'
  | 'hydration'
  | 'skin'
  | 'hair'
  | 'posture'
  | 'training'
  | 'presence';

export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export type AccentPreset = 'mint' | 'violet' | 'amber' | 'sky';

export type ThemeMode = 'dark' | 'light';

export type UnitSystem = 'metric' | 'imperial';

export type SkinType = 'normal' | 'oily' | 'dry' | 'combination' | 'sensitive';

export type HairType = 'straight' | 'wavy' | 'curly' | 'coily' | 'thinning';

export type GymLevel = 'beginner' | 'intermediate' | 'advanced';

export type FaceShape = 'oval' | 'square' | 'round' | 'diamond' | 'heart' | 'oblong';

export interface UserProfile {
  id: 'me';
  name: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  heightCm: number;
  weightKg: number;
  waistCm: number | null;
  neckCm: number | null;
  skinType: SkinType;
  skinConcerns: string[];
  hairType: HairType;
  hairConcerns: string[];
  gymLevel: GymLevel;
  workoutDaysPerWeek: number;
  equipment: 'none' | 'home_dumbbells' | 'full_gym';
  targetSleepHours: number;
  sunExposure: 'low' | 'moderate' | 'high';
  goals: string[];
  dailyTimeBudgetMin: 15 | 30 | 60 | 90;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  calorieGoal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  stepTarget?: number;
  detectedFaceShape: FaceShape | null;
  onboardingDone: boolean;
  onboardingSkipped: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  id: 'app';
  theme: ThemeMode;
  accent: AccentPreset;
  units: UnitSystem;
  saveThumbnails: boolean;
  autoPedometer?: boolean;
  pinHash: string | null;
  reminders: {
    enabled: boolean;
    morning: string;
    spf: string;
    workout: string;
    sleep: string;
    rescanDays: number;
  };
  lastWeeklyReviewDate: string | null;
}

export interface ProtocolDefinition {
  id: string;
  title: string;
  actionLine: string;
  minutes: number;
  xp: number;
  category: ProtocolCategory;
  defaultBlock: TimeBlock;
  steps: string[];
  evidence: EvidenceTag;
  why: string;
  safetyNote?: string;
  isAdvancedOptional?: boolean;
  tags: string[];
}

export interface ActiveProtocolTask {
  id: string;
  protocolId: string;
  title: string;
  actionLine: string;
  block: TimeBlock;
  category: ProtocolCategory;
  minutes: number;
  xp: number;
  steps: string[];
  evidence: EvidenceTag;
  why: string;
  safetyNote?: string;
  isCustom: boolean;
  enabled: boolean;
  sortOrder: number;
  sourceFocusArea?: string;
  daysOfWeek?: number[]; // 0=Sun..6=Sat; undefined = daily
}

export interface TaskCompletion {
  id: string; // `${date}::${taskId}`
  date: string; // YYYY-MM-DD
  taskId: string;
  minutes: number;
  xpEarned: number;
  completedAt: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  waterMl: number;
  proteinG: number;
  calories: number;
  sleepHours: number;
  sleepQuality: number; // 0 if unset, 1-5
  bedtime: string;
  wakeTime: string;
  mood: number; // 0 if unset, 1-5
  energy: number; // 0 if unset, 1-5
  steps: number;
  restingHr: number | null;
  mewingHours?: number;
  chewingMinutes?: number;
  postureScore?: number;
  morningPuffiness?: 'none' | 'mild' | 'noticeable' | null;
  jawDiscomfort?: boolean;
  notes: string;
  updatedAt: number;
}

export interface BodyMetricEntry {
  id?: number;
  date: string;
  weightKg: number;
  waistCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  createdAt: number;
}

export interface SkinEntry {
  id?: number;
  date: string;
  hydrationRating: number; // 1-5
  irritationLevel: number; // 0=none, 1=mild, 2=moderate, 3=high
  breakoutsCount: number;
  notes: string;
  photoDataUrl?: string;
  productsUsed: string[];
  createdAt: number;
}

export interface OwnedProduct {
  id?: number;
  domain: 'skin' | 'hair';
  name: string;
  brand: string;
  category: string;
  routineSlot: 'am' | 'pm' | 'both' | 'wash' | 'styling';
  activeIngredient: string;
  patchTested: boolean;
  notes: string;
  startedDate: string;
  inUse: boolean;
}

export interface HairPreference {
  id?: number;
  title: string;
  faceShape: FaceShape;
  barberScript: string;
  washFrequencyDays: number;
  isFavorite: boolean;
  createdAt: number;
}

export interface WardrobeItem {
  id?: number;
  name: string;
  category: 'top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory';
  color: string;
  fit: 'slim' | 'regular' | 'relaxed';
  season: 'all' | 'warm' | 'cool';
  notes: string;
}

export interface OutfitRecord {
  id?: number;
  date: string;
  name: string;
  itemIds: number[];
  occasion: string;
  notes: string;
  isSavedCombo: boolean;
}

export interface WorkoutExerciseSet {
  reps: number;
  weightKg: number;
  completed: boolean;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutExerciseSet[];
}

export interface WorkoutSession {
  id?: number;
  date: string;
  name: string;
  durationMin: number;
  exercises: WorkoutExercise[];
  notes: string;
  createdAt: number;
}

export interface ScanMeasurement {
  key: string;
  label: string;
  value: number;
  unit: string;
  typicalRange: string;
  status: 'balanced' | 'watch' | 'focus';
  approximate?: boolean;
}

export interface ScanFocusAction {
  label: string;
  impact: 'High' | 'Medium' | 'Low';
  protocolId?: string;
}

export interface ScanFocusArea {
  area: string;
  detail: string;
  actions: ScanFocusAction[];
  medicalNote: string;
}

export interface FaceScanResult {
  id?: number;
  date: string;
  timestamp: number;
  anglesCaptured: ('front' | 'left' | 'right' | 'smile')[];
  qualityScore: number;
  lightingScore: number;
  pslEstimate: number;
  tier:
    | 'Very Low'
    | 'LTN'
    | 'True Normie'
    | 'HTN'
    | 'Chadlite'
    | 'Chad / Elite'
    | 'Developing'
    | 'Mid'
    | 'High'
    | 'Top'
    | 'Elite';
  faceShape: FaceShape;
  subScores: {
    symmetry: number;
    proportions: number;
    jawNeck: number;
    eyeArea: number;
    browRidge?: number;
    cheekbones?: number;
    skin: number;
    leanness: number;
  };
  measurements: ScanMeasurement[];
  asymmetries: Array<{ label: string; diffPct: number }>;
  strengths: Array<{ area: string; detail: string }>;
  focusAreas: ScanFocusArea[];
  oneLineFixes?: Array<{ area: string; fix: string; protocolId?: string }>;
  frontThumbnail?: string;
  leftThumbnail?: string;
  rightThumbnail?: string;
}

export interface UnlockedBadge {
  id: string;
  unlockedAt: number;
}

export interface XpState {
  id: 'xp';
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezesRemaining: number;
  lastFreezeWeek: string;
  unlockedBadges: UnlockedBadge[];
}

export type DebloatStatus = 'optimal' | 'moderate' | 'high_retention';

export interface MealFoodItem {
  id: string;
  name: string;
  portionGrams: number;
  baseGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  sodiumMg: number;
  addedSugarG: number;
  notes?: string;
}

export interface MealScanEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  timestamp: number;
  mealTitle: string;
  confidence: 'High' | 'Medium' | 'Low';
  items: MealFoodItem[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatsG: number;
  totalSodiumMg: number;
  totalAddedSugarG: number;
  debloatStatus: DebloatStatus;
  debloatHeadline: string;
  summaryNote: string;
  photoThumbnail?: string;
  isManual?: boolean;
}

