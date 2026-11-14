export type EvidenceTag = 'Proven' | 'Likely works' | 'Not proven';

export type FocusAreaId = 'face' | 'body' | 'mind';
export type MindSubGoalId = 'study' | 'programming' | 'calm';
export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export type ProtocolCategory =
  | 'sleep'
  | 'hydration'
  | 'skin'
  | 'hair'
  | 'posture'
  | 'training'
  | 'presence'
  | 'mind';

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
  focusAreas?: FocusAreaId[];
  mindSubGoals?: MindSubGoalId[];
  dailyTimeBudgetMin: 15 | 30 | 60 | 90;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  calorieGoal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  stepTarget?: number;
  detectedFaceShape: FaceShape | null;
  onboardingDone: boolean;
  onboardingComplete?: boolean;
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
  slangTierNames?: boolean;
  prayerTrackingEnabled?: boolean;
  dhikrTaskEnabled?: boolean;
  prayerTimes?: Record<PrayerKey, string>;
  tongueReminderTimes?: string[];
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
  prayersCompleted?: Partial<Record<PrayerKey, boolean>>;
  minimumsDone?: boolean;
  gratitudeLine?: string;
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

export type QualityLevel = 'PASS' | 'WARN' | 'BLOCK';

export type WarnDomain = 'pose' | 'yaw' | 'lighting' | 'blur' | 'mouth' | 'occlusion';

export interface SavedAngleSnapshot {
  landmarks: Array<{ x: number; y: number; z: number }>;
  brightness: number;
  sideLightDiff: number;
  sharpness: number;
  faceWidthFrac: number;
  faceScale: number;
  rollDeg: number;
  yawDeg: number;
  pitchDeg: number;
  qualityLevel: QualityLevel;
  warnDomains: WarnDomain[];
  skinStats?: { evennessScore: number; rednessIndex: number; underEyeContrast: number };
}

export interface ScanMeasurement {
  key: string;
  label: string;
  value: number | null;
  displayValue?: string;
  unit: string;
  typicalRange: string;
  status: 'balanced' | 'watch' | 'focus';
  measurementStatus?: 'in range' | 'below' | 'above' | 'not measurable';
  confidence?: 'high' | 'medium' | 'low';
  explanation?: string;
  notMeasurableReason?: string;
  angleSource?: 'front' | 'sides_45' | 'profile_90' | 'combined';
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

export interface ExtendedReportPillar {
  key: string;
  title: string;
  score: number | null;
  displayScore: string;
  descriptor: string;
  confidence: 'high' | 'medium' | 'low';
  approximate?: boolean;
  evidence: EvidenceTag;
  why: string;
  angleNote?: string;
  notMeasurableReason?: string;
}

export interface LandmarksOverlayGuides {
  faceTopY: number;
  upperThirdY: number;
  midThirdY: number;
  lowerThirdY: number;
  midlineX: number;
  leftFaceX?: number;
  rightFaceX?: number;
  upperPct: number;
  midPct: number;
  lowerPct: number;
  customHairlineY?: number;
  hairlineAdjustedByUser?: boolean;
}

export interface FaceScanResult {
  id?: number;
  date: string;
  timestamp: number;
  anglesCaptured: ('front' | 'left' | 'right' | 'profile90' | 'smile')[];
  qualityScore: number;
  lightingScore: number;
  pslEstimate: number;
  tier:
    | 'Developing'
    | 'Mid'
    | 'High'
    | 'Top'
    | 'Elite'
    | 'LTN'
    | 'True Normie'
    | 'HTN'
    | 'Chadlite'
    | 'Chad'
    | 'Chad / Elite';
  plainLabel?: string;
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
    harmony?: number;
  };
  measurements: ScanMeasurement[];
  asymmetries: Array<{ label: string; diffPct: number }>;
  strengths: Array<{ area: string; detail: string }>;
  focusAreas: ScanFocusArea[];
  oneLineFixes?: Array<{ area: string; fix: string; protocolId?: string }>;
  extendedPillars?: ExtendedReportPillar[];
  featureChips?: string[];
  verdictText?: string;
  landmarksOverlay?: LandmarksOverlayGuides;
  savedFrontSnapshot?: SavedAngleSnapshot;
  savedLeftSnapshot?: SavedAngleSnapshot;
  savedRightSnapshot?: SavedAngleSnapshot;
  frontThumbnail?: string;
  leftThumbnail?: string;
  rightThumbnail?: string;
  profile90Thumbnail?: string;
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

export interface PuffinessLogEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  puffiness: 1 | 2 | 3 | 4 | 5;
  sleepHours: number;
  alcoholOrSaltyMeal: boolean;
  photoDataUrl?: string;
  notes?: string;
  createdAt: number;
}


