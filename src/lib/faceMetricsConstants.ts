/**
 * Documented thresholds, typical adult proportion ranges, and calibration weights
 * for ASCEND on-device facial landmark analysis.
 *
 * Every score is a rough photo-based estimate — camera distance, focal length,
 * head tilt, and lighting significantly change computed ratios.
 */

export const QUALITY_THRESHOLDS = {
  /** BLOCK below 25% of frame width so users at arm's length unlock easily */
  MIN_FACE_WIDTH_BLOCK: 0.25,
  /** Ideal comfort band >= 32% of frame width */
  MIN_FACE_WIDTH_PASS: 0.32,
  /** BLOCK above 92% of frame height (lens pressed right to face) */
  MAX_FACE_HEIGHT_BLOCK: 0.92,

  /** BLOCK luminance extremes (< 35 dark room, > 230 blown-out highlights) */
  BRIGHTNESS_BLOCK_MIN: 35,
  BRIGHTNESS_BLOCK_MAX: 230,
  /** Comfortable lighting PASS band */
  BRIGHTNESS_PASS_MIN: 55,
  BRIGHTNESS_PASS_MAX: 205,

  /** WARN if left-vs-right face-half mean luminance delta exceeds 38 */
  SIDE_LIGHT_DIFF_WARN: 38,
  /** WARN if 4-neighbor Laplacian edge magnitude indicates mild blur */
  SHARPNESS_WARN_THRESHOLD: 3.5,

  /** Front pose PASS limits (degrees) */
  FRONT_PASS_YAW_DEG: 8,
  FRONT_PASS_ROLL_DEG: 5,
  FRONT_PASS_PITCH_DEG: 10,
  /** Front pose BLOCK limits (wildly turned away, |yaw| > 20°; small tilt/pitch is WARN) */
  FRONT_BLOCK_YAW_DEG: 20,

  /** 45° side capture PASS band (30–55°) and allowable WARN band (15–30° or 55–70°) */
  SIDE_PASS_MIN_YAW_DEG: 30,
  SIDE_PASS_MAX_YAW_DEG: 55,
  SIDE_BLOCK_MIN_YAW_DEG: 15,
  SIDE_BLOCK_MAX_YAW_DEG: 70,
  SIDE_PASS_MAX_ROLL_DEG: 8,

  /** Optional 90-degree true side profile bounds */
  PROFILE90_MIN_YAW_DEG: 52,
  PROFILE90_MAX_ROLL_DEG: 14,

  /** Front shot BLOCK if eyes clearly closed; WARN if mouth slightly open */
  MIN_EYE_ASPECT_BLOCK: 0.11,
  MAX_MOUTH_OPEN_WARN: 0.16,
} as const;

/**
 * Neutral-expression gate thresholds (MediaPipe blendshapes, 0 = neutral, 1 = expressive).
 * - < 0.15: PASS (neutral face)
 * - 0.15–0.30: WARN (amber shutter enabled, "Relax your face a little")
 * - > 0.30: BLOCK ("Neutral face please: mouth closed, relax your forehead")
 */
export const EXPRESSION_THRESHOLDS = {
  PASS_MAX: 0.15,
  WARN_MAX: 0.30,
  /** Resting sensor noise floor subtracted before normalizing blendshape cues */
  RESTING_NOISE_FLOOR: 0.04,
} as const;

/**
 * Blendshape weights and user-facing cues for neutral-expression scoring.
 * Higher weight amplifies strong non-neutral expressions (smiling, open jaw, puffed cheeks, etc.).
 */
export const EXPRESSION_BLENDSHAPE_GROUPS: Array<{
  id: string;
  keys: string[];
  weight: number;
  cue: string;
  domain: 'mouth' | 'eyes';
}> = [
  {
    id: 'smile',
    keys: ['mouthSmileLeft', 'mouthSmileRight'],
    weight: 1.0,
    cue: 'Smile detected',
    domain: 'mouth',
  },
  {
    id: 'jawOpen',
    keys: ['jawOpen'],
    weight: 1.15,
    cue: 'Mouth open',
    domain: 'mouth',
  },
  {
    id: 'mouthFunnel',
    keys: ['mouthFunnel'],
    weight: 1.0,
    cue: 'Mouth open',
    domain: 'mouth',
  },
  {
    id: 'mouthPucker',
    keys: ['mouthPucker'],
    weight: 1.0,
    cue: 'Lips puckered',
    domain: 'mouth',
  },
  {
    id: 'cheekPuff',
    keys: ['cheekPuff'],
    weight: 1.1,
    cue: 'Cheeks puffed',
    domain: 'mouth',
  },
  {
    id: 'browInnerUp',
    keys: ['browInnerUp'],
    weight: 1.0,
    cue: 'Eyebrows raised',
    domain: 'eyes',
  },
  {
    id: 'browDown',
    keys: ['browDownLeft', 'browDownRight'],
    weight: 0.9,
    cue: 'Brows furrowed',
    domain: 'eyes',
  },
  {
    id: 'eyeSquint',
    keys: ['eyeSquintLeft', 'eyeSquintRight'],
    weight: 0.95,
    cue: 'Eyes squinted',
    domain: 'eyes',
  },
  {
    id: 'eyeWide',
    keys: ['eyeWideLeft', 'eyeWideRight'],
    weight: 1.05,
    cue: 'Eyes wide open',
    domain: 'eyes',
  },
  {
    id: 'mouthStretch',
    keys: ['mouthStretchLeft', 'mouthStretchRight', 'mouthStretch'],
    weight: 0.9,
    cue: 'Mouth stretched',
    domain: 'mouth',
  },
  {
    id: 'mouthPress',
    keys: ['mouthPressLeft', 'mouthPressRight'],
    weight: 0.85,
    cue: 'Lips pressed',
    domain: 'mouth',
  },
  {
    id: 'noseSneer',
    keys: ['noseSneerLeft', 'noseSneerRight'],
    weight: 0.9,
    cue: 'Nose wrinkled',
    domain: 'mouth',
  },
];

/** Confidence weight multipliers used in overall confidence-weighted averaging */
export const CONFIDENCE_WEIGHTS: Record<'high' | 'medium' | 'low', number> = {
  high: 1.0,
  medium: 0.72,
  low: 0.42,
};

/**
 * Calibrated population means & shrinkage factor weights.
 * final = mean + scanConfidence * (raw - mean)
 * At raw sub-score mean 67, calculateCalibratedPslScore(67) = 4.8 (True Normie average).
 */
export const CONFIDENCE_SHRINKAGE_CONSTANTS = {
  POPULATION_SUBSCORE_MEAN: 67,
  POPULATION_PSL_MEAN: 4.8,
  FACTOR_WEIGHTS: {
    pose: 0.24,
    expression: 0.28,
    lighting: 0.18,
    sharpness: 0.15,
    angles: 0.15,
  },
  /** Extra shrinkage multiplier on mouth, lip, jaw, and eye metrics when expression is WARN */
  WARN_EXPRESSION_METRIC_MULTIPLIER: 0.55,
} as const;

/**
 * Documented physiological human bounds for key landmark ratios & angles.
 * If PLAUSIBILITY_OUTLIER_THRESHOLD or more metrics fall outside these bounds,
 * the scan is flagged as unusual instead of showing a misleading report.
 */
export const PLAUSIBILITY_OUTLIER_THRESHOLD = 3;

export const HUMAN_METRIC_PLAUSIBLE_RANGES = {
  thirdUpperPct: { label: 'Upper third %', min: 18, max: 48 },
  thirdMidPct: { label: 'Middle third %', min: 20, max: 48 },
  thirdLowerPct: { label: 'Lower third %', min: 20, max: 48 },
  fwhr: { label: 'Facial width-to-height (fWHR)', min: 1.25, max: 2.65 },
  jawToCheek: { label: 'Jaw-to-cheek ratio', min: 0.52, max: 1.15 },
  chinToPhiltrum: { label: 'Chin-to-philtrum ratio', min: 1.0, max: 4.2 },
  eyeAspect: { label: 'Eye aspect ratio', min: 0.12, max: 0.55 },
  eyeSpacing: { label: 'Eye spacing ratio', min: 0.65, max: 1.45 },
  mouthToNose: { label: 'Mouth-to-nose width', min: 0.95, max: 2.35 },
  lipRatio: { label: 'Lower-to-upper lip ratio', min: 0.6, max: 3.2 },
  midfaceRatio: { label: 'Midface ratio', min: 0.68, max: 1.45 },
  gonialAngle: { label: 'Gonial angle', min: 95, max: 152 },
} as const;

/** Documented canthal tilt classification cutoffs (degrees, pose-corrected) */
export const CANTHAL_TILT_THRESHOLDS = {
  POSITIVE_MIN_DEG: 1.5,
  NEGATIVE_MAX_DEG: -1.5,
} as const;

/**
 * Typical adult geometric target ranges & distance penalties used to convert
 * raw landmark ratios into 0–100 sub-scores.
 */
export const METRIC_RANGES = {
  THIRDS_PCT: { min: 30.0, ideal: 33.3, max: 36.6 },
  FWHR: { min: 1.75, ideal: 1.9, max: 2.05 },
  JAW_TO_CHEEK: { min: 0.76, ideal: 0.83, max: 0.90 },
  CHEEK_TO_JAW: { min: 1.12, ideal: 1.21, max: 1.30 },
  CHIN_TO_PHILTRUM: { min: 1.9, ideal: 2.2, max: 2.5 },
  EYE_ASPECT: { min: 0.26, ideal: 0.31, max: 0.36 },
  EYE_SPACING: { min: 0.92, ideal: 1.0, max: 1.08 },
  BROW_HEIGHT_IPD: { min: 0.20, ideal: 0.25, max: 0.30 },
  MOUTH_TO_NOSE: { min: 1.35, ideal: 1.5, max: 1.65 },
  LIP_RATIO: { min: 1.2, ideal: 1.5, max: 1.8 },
  MIDFACE_RATIO: { min: 0.92, ideal: 1.0, max: 1.08 },
  GONIAL_ANGLE_DEG: { min: 115, ideal: 122, max: 130 },
  SUBMENTAL_ANGLE_DEG: { min: 95, ideal: 108, max: 120 },
  ELINE_OFFSET_U: { min: 1.0, ideal: 2.8, max: 4.5 },
} as const;

/**
 * Raised IPD-normalized extrapolation constant above forehead landmark 10
 * so estimated upper third reflects typical anatomical hairline placement (~33%).
 */
export const HAIRLINE_EXTRAPOLATION_IPD = 0.54;

/** Sub-score weights for calibrated PSL estimate (modulated dynamically by confidence) */
export const PSL_SUBSCORE_WEIGHTS = {
  symmetry: 0.18,
  proportions: 0.16,
  eyeArea: 0.16,
  jawNeck: 0.16,
  cheekbones: 0.12,
  skin: 0.12,
  leanness: 0.10,
} as const;

export interface PslTierMeta {
  id: 'Developing' | 'LTN' | 'True Normie' | 'HTN' | 'Chadlite' | 'Chad';
  slangLabel: string;
  neutralLabel: string;
  displayLabel: string;
  bracketLabel: string;
  rangeLabel: string;
  plainLabel: string;
  constructiveLine: string;
  explanation: string;
}

export type NeutralPslTierMeta = PslTierMeta;

export const PSL_SCALE_GUIDE: Array<{
  rangeLabel: string;
  slangName: string;
  neutralName: string;
  explanation: string;
}> = [
  {
    rangeLabel: '1.0 – 3.4',
    slangName: 'Developing',
    neutralName: 'Developing',
    explanation: 'Early photo baseline — posture, lighting angle, puffiness, and core habits shift this quickly.',
  },
  {
    rangeLabel: '3.5 – 4.4',
    slangName: 'LTN (Low-Tier Normie)',
    neutralName: 'Below average',
    explanation: 'Common starting point; body fat, skincare consistency, hair fit, and grooming move scores upward.',
  },
  {
    rangeLabel: '4.5 – 4.9',
    slangName: 'True Normie',
    neutralName: 'Average',
    explanation: 'Balanced everyday proportions where many people land naturally.',
  },
  {
    rangeLabel: '5.0 – 5.9',
    slangName: 'HTN (High-Tier Normie)',
    neutralName: 'High',
    explanation: 'Strong visual harmony, clear skin tone, and clean lower-third definition.',
  },
  {
    rangeLabel: '6.0 – 6.9',
    slangName: 'Chadlite',
    neutralName: 'Top',
    explanation: 'Distinct multi-angle symmetry, eye-area framing, and defined bone contours.',
  },
  {
    rangeLabel: '7.0 – 8.0',
    slangName: 'Chad',
    neutralName: 'Elite',
    explanation: 'Extremely rare structural harmony across bone framing, symmetry, and skin clarity.',
  },
];

export const WHAT_MOVES_PSL = {
  realisticLevers: [
    'Body fat percentage (leaner frame sharpens jaw and cheek contours)',
    'Skin clarity (gentle cleanser, moisturizer, daily SPF, consistent sleep)',
    'Haircut and facial hair tailored to face shape',
    'Grooming (clean brows, oral care, tidy neckline)',
    'Upright neck posture and proportional neck/trap muscle',
    'Camera lighting, eye-level angle, and arm’s-length distance',
  ],
  doesNotMove: [
    'Adult bone structure (does not remodel from chewing gadgets, mewing, or face tapping)',
  ],
} as const;

export function getPslTierMeta(score: number, useSlangNames = true): PslTierMeta {
  if (score < 3.5) {
    return {
      id: 'Developing',
      slangLabel: 'Developing',
      neutralLabel: 'Developing',
      displayLabel: 'Developing',
      bracketLabel: 'Developing',
      rangeLabel: '< 3.5',
      plainLabel: 'Developing',
      constructiveLine: 'Biggest levers for you: lighting, sleep, skin basics, and steady habits.',
      explanation: 'Early photo baseline shaped strongly by lighting, angle, and daily routines.',
    };
  }
  if (score < 4.5) {
    return {
      id: 'LTN',
      slangLabel: 'LTN',
      neutralLabel: 'Below average',
      displayLabel: useSlangNames ? 'LTN' : 'Below average',
      bracketLabel: useSlangNames ? 'LTN (Low-Tier Normie)' : 'Below average',
      rangeLabel: '3.5 – 4.4',
      plainLabel: useSlangNames ? 'Low-Tier Normie' : 'Below average',
      constructiveLine: 'Biggest levers for you: skin, leanness, grooming, and haircut framing.',
      explanation: 'Realistic everyday baseline with high upside from leanness, skin clarity, and grooming.',
    };
  }
  if (score < 5.0) {
    return {
      id: 'True Normie',
      slangLabel: 'True Normie',
      neutralLabel: 'Average',
      displayLabel: useSlangNames ? 'True Normie' : 'Average',
      bracketLabel: useSlangNames ? 'True Normie (Average)' : 'Average',
      rangeLabel: '4.5 – 4.9',
      plainLabel: useSlangNames ? 'Average' : 'Average',
      constructiveLine: 'Biggest levers for you: lean body fat, consistent SPF, and upright posture.',
      explanation: 'Balanced everyday range; grooming, lower bloat, and hair fit refine presentation.',
    };
  }
  if (score < 6.0) {
    return {
      id: 'HTN',
      slangLabel: 'HTN',
      neutralLabel: 'High',
      displayLabel: useSlangNames ? 'HTN' : 'High',
      bracketLabel: useSlangNames ? 'HTN (High-Tier Normie)' : 'High',
      rangeLabel: '5.0 – 5.9',
      plainLabel: useSlangNames ? 'High-Tier Normie' : 'High',
      constructiveLine: 'Biggest levers for you: maintain leanness, skin barrier, and neck/trap frame.',
      explanation: 'Above-average proportion harmony and defined lower-third lines across angles.',
    };
  }
  if (score < 7.0) {
    return {
      id: 'Chadlite',
      slangLabel: 'Chadlite',
      neutralLabel: 'Top',
      displayLabel: useSlangNames ? 'Chadlite' : 'Top',
      bracketLabel: useSlangNames ? 'Chadlite (Top)' : 'Top',
      rangeLabel: '6.0 – 6.9',
      plainLabel: useSlangNames ? 'Top' : 'Top',
      constructiveLine: 'Biggest levers for you: sleep consistency, UV protection, and clean grooming.',
      explanation: 'Strong structural alignment across symmetry, eye area, jawline, and skin clarity.',
    };
  }
  return {
    id: 'Chad',
    slangLabel: 'Chad',
    neutralLabel: 'Elite',
    displayLabel: useSlangNames ? 'Chad' : 'Elite',
    bracketLabel: useSlangNames ? 'Chad (Elite)' : 'Elite',
    rangeLabel: '7.0+',
    plainLabel: useSlangNames ? 'Elite' : 'Elite',
    constructiveLine: 'Biggest levers for you: protect skin with SPF and keep basic health habits steady.',
    explanation: 'Rare multi-angle proportion balance and clear structural contrast.',
  };
}

export function getNeutralTierMeta(score: number, useSlangNames = true): PslTierMeta {
  return getPslTierMeta(score, useSlangNames);
}

export const PSL_HONEST_DISCLAIMER =
  'PSL is an internet scale. This is a rough estimate from photos, not science and not your worth.';
