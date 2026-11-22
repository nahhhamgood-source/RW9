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

export type ThemeMode = 'dark' | 'light' | 'system';

export type ToneMode = 'normal' | 'chill' | 'serious';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealFullness = 'still_hungry' | 'good' | 'very_full';

export type EventType =
  | 'wedding'
  | 'birthday'
  | 'family_lunch'
  | 'restaurant'
  | 'street_food'
  | 'travel'
  | 'other';

export type EventOutcomeLevel = 'light' | 'normal' | 'heavy' | 'very_heavy';

export type DayTrackingStatus = 'complete' | 'partial' | 'estimated' | 'not_tracked';

export type LoggingDetailLevel = 'easy' | 'balanced' | 'precise';

export type BudgetViewMode = 'daily' | 'weekly';

export type NumbersDisplayMode = 'full' | 'simple' | 'hidden_today';

export type FoodReminderMode = 'off' | 'if_empty_by_time' | 'mealtime_nudges';

export type HabitStackCue = 'none' | 'after_nescafe' | 'after_dinner' | 'after_gym' | 'custom';

export type MealSourceKind =
  | 'normal'
  | 'event_quick'
  | 'event_preset'
  | 'gallery_import'
  | 'share_target'
  | 'recall'
  | 'template'
  | 'one_question'
  | 'barcode'
  | 'label';

export interface RealLifeFoodSettings {
  loggingDetail: LoggingDetailLevel;
  budgetView: BudgetViewMode;
  showNumbers: NumbersDisplayMode;
  eventModeEnabled: boolean;
  galleryImportEnabled: boolean;
  nextMorningCheckinEnabled: boolean;
  dailyOneQuestionEnabled: boolean;
  dailyOneQuestionTime: string;
  autoFillUsualMeals: boolean;
  shareIntoAscendEnabled: boolean;
  includeEstimatedInAverages: boolean;
  justTakePhotosMode: boolean;
  foodReminderMode: FoodReminderMode;
  foodReminderEmptyTime: string;
  habitStackCue: HabitStackCue;
  habitStackCustomText?: string;
  targetSource?: 'auto' | 'manual';
  kitchenScaleMode?: boolean;
}

export interface EventModeState {
  active: boolean;
  type: EventType;
  startedAt: number;
  endedAt?: number;
  reminderQuietUntilMidnight: boolean;
  outcome?: EventOutcomeLevel;
  platesCount?: number;
  hadDessert?: boolean;
  note?: string;
}

export interface SavedMealTemplate {
  id: string;
  title: string;
  mealType: MealType;
  icon: string;
  portionLabel: string;
  kcal: number;
  kcalRange?: string;
  proteinG: number;
  sodiumMg: number;
  items: Array<{
    name: string;
    portionLabel: string;
    kcal: number;
    proteinG: number;
    sodiumMg: number;
    icon?: string;
  }>;
  createdAt: number;
  lastUsedAt?: number;
}

export type DietGoalMode = 'cut' | 'maintain' | 'lean_gain';

export type StillGrowingStatus = 'yes' | 'no' | 'unsure';

export type GoalHorizon = 'this_week' | 'this_month' | 'three_months' | 'one_year';

export type UnitSystem = 'metric' | 'imperial';

export type SkinType = 'normal' | 'oily' | 'dry' | 'combination' | 'sensitive';

export type HairType = 'straight' | 'wavy' | 'curly' | 'coily' | 'thinning';

export type GymLevel = 'beginner' | 'intermediate' | 'advanced';

export type FaceShape = 'oval' | 'square' | 'round' | 'diamond' | 'heart' | 'oblong';

export type TrainingDayType = 'gym' | 'mma' | 'sparring' | 'rest';

export type MainGoalMode = 'fight_camp' | 'look_better' | 'both';

export type WeighInRule = 'same_day' | 'day_before' | 'not_sure';

export type AboutMeItemKey =
  | 'location_foods'
  | 'training_camp'
  | 'eating_pattern'
  | 'identity_focus'
  | 'support_style';

export type AboutMeConfirmationStatus = 'suggested' | 'confirmed' | 'edited';

export interface AboutMeProfile {
  countryRegion: string;
  localFoods: string[];
  trainingDisciplines: string[];
  tournamentUpcoming: boolean;
  tournamentDate: string | null;
  weightClassKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  eatingPattern: string;
  identityFocus: string;
  supportStyle: string;
  statuses: Partial<Record<AboutMeItemKey, AboutMeConfirmationStatus>>;
  deletedKeys: AboutMeItemKey[];
  updatedAt?: number;
}

export interface UserProfile {
  id: 'me';
  name: string;
  age: number;
  ageExplicitlySet?: boolean;
  birthDate?: string;
  sex: 'male' | 'female' | 'other';
  heightCm: number;
  weightKg: number;
  waistCm: number | null;
  neckCm: number | null;
  stillGrowing?: StillGrowingStatus;
  motherHeightCm?: number | null;
  fatherHeightCm?: number | null;
  dreamHeightCm?: number | null;
  monthlyHeightReminder?: boolean;
  usualBedtime?: string;
  usualWakeTime?: string;
  skinType: SkinType;
  skinConcerns: string[];
  hairType: HairType;
  hairConcerns: string[];
  gymLevel: GymLevel;
  workoutDaysPerWeek: number;
  gymDaysPerWeek?: number;
  mmaDaysPerWeek?: number;
  equipment: 'none' | 'home_dumbbells' | 'full_gym';
  targetSleepHours: number;
  sunExposure: 'low' | 'moderate' | 'high';
  goals: string[];
  mainGoalMode?: MainGoalMode;
  dietGoal?: DietGoalMode;
  weighInRule?: WeighInRule;
  focusAreas?: FocusAreaId[];
  mindSubGoals?: MindSubGoalId[];
  dailyTimeBudgetMin: 15 | 30 | 60 | 90;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  calorieGoal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  stepTarget?: number;
  detectedFaceShape: FaceShape | null;
  aboutMe?: AboutMeProfile;
  onboardingDone: boolean;
  onboardingComplete?: boolean;
  onboardingSkipped: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderPreferences {
  enabled: boolean;
  morning: string;
  spf: string;
  workout: string;
  sleep: string;
  rescanDays: number;
  waterReminder?: boolean;
  waterIntervalMin?: number;
  breakfastTime?: string;
  lunchTime?: string;
  dinnerTime?: string;
  mealLogReminder?: boolean;
  exerciseTime?: string;
  exerciseReminder?: boolean;
  postureBreakEnabled?: boolean;
  weeklyPhotoEnabled?: boolean;
  monthlyHeightEnabled?: boolean;
  studyReminderEnabled?: boolean;
  studyReminderTime?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxPerDay?: number;
  mewingCheckEnabled?: boolean;
  neckSetEnabled?: boolean;
  neckSetTime?: string;
  showDetailsInNotifications?: boolean;
}

export interface AppSettings {
  id: 'app';
  theme: ThemeMode;
  accent: AccentPreset;
  units: UnitSystem;
  easyMode?: boolean;
  tone?: ToneMode;
  soundEnabled?: boolean;
  saveThumbnails: boolean;
  includeSkinScoreInScans?: boolean;
  autoPedometer?: boolean;
  slangTierNames?: boolean;
  dayStartsAt4am?: boolean;
  onlineConsentSeen?: boolean;
  onlineFoodEnabled?: boolean;
  onlineCoachEnabled?: boolean;
  prayerTrackingEnabled?: boolean;
  dhikrTaskEnabled?: boolean;
  prayerTimes?: Record<PrayerKey, string>;
  tongueReminderTimes?: string[];
  arabicHintsEnabled?: boolean;
  arabicIndicDigits?: boolean;
  dismissedPatternIds?: string[];
  trainingWindowStart?: string;
  trainingWindowEnd?: string;
  relaxedFridayMode?: boolean;
  roughDayDates?: string[];
  dayModeByDate?: Record<string, TrainingDayType>;
  healthyFrameLastShownDate?: string | null;
  celebratedMilestones?: string[];
  lastAutoPlanDate?: string | null;
  quickMealLastInputs?: { name?: string; calories: string; protein: string; sodium: string };
  favoriteFoodIds?: string[];
  recentFoodIds?: string[];
  customFoodCatalog?: CustomFoodEntry[];
  realLifeFood?: RealLifeFoodSettings;
  mealTemplates?: SavedMealTemplate[];
  skippedGapCheckinDates?: string[];
  dailyCheckinAskedDates?: Record<string, string>;
  pinHash: string | null;
  reminders: ReminderPreferences;
  lastWeeklyReviewDate: string | null;
  lastBackupDate?: string | null;
  lookAndFeel?: LookAndFeelSettings;
  mindsetPaths?: MindsetPathsSettings;
}

export type FoodCatalogCategory =
  | 'Breakfast'
  | 'Egyptian home food'
  | 'Street food'
  | 'Fast food'
  | 'Drinks'
  | 'Sweets'
  | 'Fruit'
  | 'Snacks';

export interface CustomFoodEntry {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  category: FoodCatalogCategory;
  portionLabel: string;
  kcal: number;
  kcalRange?: string;
  proteinG: number;
  carbsG?: number;
  fatsG?: number;
  sodiumMg?: number;
  addedSugarG?: number;
  createdAt: number;
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
  exerciseSlug?: string;
  watchQuery?: string;
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
  isAdvancedOptional?: boolean;
  exerciseSlug?: string;
  watchQuery?: string;
  isCustom: boolean;
  enabled: boolean;
  sortOrder: number;
  sourceFocusArea?: string;
  daysOfWeek?: number[]; // 0=Sun..6=Sat; undefined = daily
  scheduledDate?: string; // If set (e.g. tomorrow YYYY-MM-DD), belongs to that date
  deferredFromDate?: string; // If moved from a specific date to tomorrow
  reminderTime?: string; // Optional HH:MM reminder
}

export interface LifeGoal {
  id?: number;
  title: string;
  focusArea: 'face' | 'body' | 'mind' | 'growth';
  targetLabel: string;
  horizon: GoalHorizon;
  progressPct: number;
  milestones: Array<{
    id: string;
    horizon: GoalHorizon;
    label: string;
    done: boolean;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface LifeListItem {
  id?: number;
  title: string;
  timeframe: GoalHorizon;
  dueDate?: string;
  note?: string;
  done: boolean;
  doneAt?: number;
  createdAt: number;
}

export interface HeightLogEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  heightCm: number;
  timeOfDay: 'morning' | 'evening';
  note?: string;
  createdAt: number;
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
  earShoulderAngleDeg?: number | null;
  postureCheckPhotoDate?: string;
  morningPuffiness?: 'none' | 'mild' | 'noticeable' | null;
  jawDiscomfort?: boolean;
  prayersCompleted?: Partial<Record<PrayerKey, boolean>>;
  minimumsDone?: boolean;
  gratitudeLine?: string;
  dayStatus?: DayTrackingStatus;
  eventMode?: EventModeState;
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

export type WarnDomain =
  | 'pose'
  | 'yaw'
  | 'lighting'
  | 'blur'
  | 'mouth'
  | 'eyes'
  | 'expression'
  | 'occlusion';

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
  expressionScore?: number;
  expressionCue?: string | null;
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
  scanConfidence?: number;
  expressionScore?: number;
  isImplausible?: boolean;
  plausibilityWarning?: string;
  implausibleMetrics?: string[];
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
  nameAr?: string;
  icon?: string;
  portionLabel?: string;
  kcalRange?: string;
  confidence?: 'High' | 'Medium' | 'Low';
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
  mealType?: MealType;
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
  fullness?: MealFullness;
  photoThumbnail?: string;
  isManual?: boolean;
  isEstimate?: boolean;
  estimateRangeLabel?: string;
  sourceKind?: MealSourceKind;
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

export type QuitHabitCategory =
  | 'nicotine'
  | 'sugar'
  | 'junk_food'
  | 'caffeine'
  | 'doomscroll'
  | 'late_night'
  | 'gaming'
  | 'skin_picking'
  | 'alcohol'
  | 'private';

export interface QuitHabitItem {
  id?: number;
  category?: QuitHabitCategory;
  title: string;
  reason?: string;
  triggers?: string[];
  swaps?: string[];
  isPrivate?: boolean;
  slipDates?: string[];
  urgesResisted?: number;
  lastResetAt: number;
  longestDays: number;
  createdAt: number;
}

export interface QuitSlipEntry {
  id?: number;
  habitId: number;
  date: string;
  trigger?: string;
  tweak?: string;
  createdAt: number;
}

export interface ExerciseSessionLog {
  id?: number;
  date: string;
  programId: string;
  programTitle: string;
  domain: 'face' | 'grow';
  level: 1 | 2;
  minutes: number;
  xpEarned: number;
  completedAt: number;
}

export interface GrowthCheckoffEntry {
  id: string; // `${date}::${habitId}`
  date: string; // YYYY-MM-DD
  habitId: string;
  xpEarned: number;
  completedAt: number;
}

export interface GrowthProgramProgress {
  id: 'spine_posture' | 'stretch_flow' | 'active_play';
  completedDays: number[];
  updatedAt: number;
}

// ============================================================================
// Look & Feel + Mindset Paths + Daily Cut + Daily Motivation Video
// ============================================================================

export type ThemePresetId =
  | 'default'
  | 'obsidian'
  | 'carbon'
  | 'noir_gold'
  | 'blood_noir'
  | 'terminal'
  | 'void_violet'
  | 'steel'
  | 'monochrome'
  | 'light_clean';

export type CornerStyle = 'sharp' | 'soft' | 'pill';
export type CardStyle = 'flat' | 'glass' | 'outlined';
export type IconStyle = 'line' | 'filled';
export type DensityMode = 'comfortable' | 'compact';
export type FontHeadingStyle = 'sans' | 'mono';
export type BackgroundStyle = 'none' | 'noise' | 'gradient' | 'scanline' | 'ambient';
export type AnimationLevel = 'off' | 'light' | 'full';
export type HapticLevel = 'off' | 'light';
export type LaunchAnimationStyle = 'none' | 'logo_fade';
export type AppIconId = 'peak' | 'monolith' | 'orbit' | 'prism' | 'shield' | 'pulse';

export interface LookAndFeelSettings {
  preset: ThemePresetId;
  scheduleEnabled: boolean; // dark 19:00-07:00, light_clean 07:00-19:00
  surpriseDateKey?: string | null;
  surprisePreset?: ThemePresetId | null;
  customAccentHex?: string | null;
  cornerStyle: CornerStyle;
  cardStyle: CardStyle;
  iconStyle: IconStyle;
  density: DensityMode;
  fontStyle: FontHeadingStyle;
  textScalePct: number; // 100..130
  backgroundStyle: BackgroundStyle;
  batterySaverMode?: boolean;
  animationLevel: AnimationLevel;
  haptics: HapticLevel;
  soundsEnabled: boolean; // OFF by default
  launchAnimation: LaunchAnimationStyle;
  bootLineEnabled: boolean;
  operatorConsoleOnToday: boolean;
  appIconId: AppIconId;
  displayAppName: string; // private display name, default "ASCEND"
}

export type MindsetPathId =
  | 'eagle'
  | 'callous_mind'
  | 'finisher'
  | 'operator'
  | 'rebel_mind'
  | 'underdog_strategist'
  | 'strategist'
  | 'grinder'
  | 'craftsman'
  | 'reinventor'
  | 'loyalty_family'
  | 'custom';

export type PathSelectionMode = 'mix_all' | 'one_per_day' | 'single';

export interface CustomPathConfig {
  name: string;
  identityStatement: string; // "I am the kind of person who..."
  habitProtocolIds: string[]; // up to 3 existing CURATED_PROTOCOLS IDs
}

export interface DailyCutLesson {
  id: string;
  pathId: MindsetPathId;
  dayIndex: number; // 1..30
  title: string;
  idea: string; // 2-3 sentences, own words
  ideaSpoilerFree: string; // safe 2-3 sentence summary without plot reveals
  matureSafeSummary: string; // age-appropriate summary for <18 or unknown age
  arabicHint?: string;
  moveToday: string; // 1 concrete micro-action
  protocolId: string; // existing CURATED_PROTOCOLS ID
  realityCheck: string; // Take/Leave/Cost reminder
  watchMoreTitle?: string; // plain text only
  watchSearchQuery?: string; // clean search query, no copyrighted links
  focusTag?: 'fight_camp' | 'study' | 'sleep' | 'general';
}

export interface SavedCutEntry {
  lessonId: string;
  pathId: MindsetPathId;
  title: string;
  idea: string;
  moveToday: string;
  protocolId: string;
  realityCheck: string;
  savedAt: number;
  actedDates: string[];
}

export interface WatchlistEntry {
  id: string;
  title: string;
  pathId: MindsetPathId;
  watched: boolean;
  addedAt: number;
}

export interface MySavedVideo {
  id: string;
  url: string;
  title: string;
  whySaved: string;
  pathId: MindsetPathId;
  createdAt: number;
}

export interface ChannelFollow {
  id: string;
  name: string;
  pathId?: MindsetPathId;
  createdAt: number;
}

export interface MindsetPathsSettings {
  pathsEnabled: boolean;
  pickerCompleted: boolean;
  pickerBannerDismissCount: number; // max 3 dismissals
  mode: PathSelectionMode;
  mainPathId: MindsetPathId | null;
  inspirationIds: MindsetPathId[]; // up to 2 inspirations
  todayPersonOverrideDate?: string | null;
  todayPersonOverrideId?: MindsetPathId | null;
  hiddenPathIds: MindsetPathId[];
  spoilerFreeDefault: boolean;
  customPath: CustomPathConfig;
  // Daily Cut tracking
  dailyCutHistory: Record<string, string>; // YYYY-MM-DD -> lessonId (prevent 14-day repeats)
  dailyCutSwapCountByDate: Record<string, number>;
  actedCutIdsByDate: Record<string, string[]>;
  savedCuts: SavedCutEntry[];
  watchlist: WatchlistEntry[];
  // Daily Motivation Video
  videoMuted: boolean;
  videosPerDayCap: number; // default 1
  myVideos: MySavedVideo[];
  channelsFollowed: ChannelFollow[];
  videoFeedbackByDate: Record<
    string,
    { topic: string; helped: boolean | null; watched: boolean; actionAdded?: string; updatedAt?: number }
  >;
  videoOpenCountByDate: Record<string, number>;
  // Notifications
  dailyCutNotifEnabled: boolean;
  dailyCutNotifTime: string;
  dailyVideoNotifEnabled: boolean;
  dailyVideoNotifTime: string;
}

