/**
 * Documented thresholds, typical adult proportion ranges, calibration weights,
 * and centered Tier Ladder definitions for ASCEND on-device facial landmark analysis.
 *
 * Every score is a rough photo-based estimate — camera distance, focal length,
 * head tilt, and lighting significantly change computed ratios.
 */

export const QUALITY_THRESHOLDS = {
  /** BLOCK only if face is very tiny (< 15% of frame width) */
  MIN_FACE_WIDTH_BLOCK: 0.15,
  /** Comfortable framing >= 21% of frame width */
  MIN_FACE_WIDTH_PASS: 0.21,
  /** BLOCK above 97% of frame height (lens pressed directly against face) */
  MAX_FACE_HEIGHT_BLOCK: 0.97,

  /** BLOCK only in near-pitch-dark (< 16) or clipped whiteout (> 246) */
  BRIGHTNESS_BLOCK_MIN: 16,
  BRIGHTNESS_BLOCK_MAX: 246,
  /** Comfortable indoor lighting PASS band */
  BRIGHTNESS_PASS_MIN: 36,
  BRIGHTNESS_PASS_MAX: 222,

  /** WARN if left-vs-right face-half mean luminance delta exceeds 56 */
  SIDE_LIGHT_DIFF_WARN: 56,
  /** WARN if 4-neighbor Laplacian edge magnitude indicates heavy blur */
  SHARPNESS_WARN_THRESHOLD: 1.8,

  /** Front pose PASS limits (degrees) */
  FRONT_PASS_YAW_DEG: 14,
  FRONT_PASS_ROLL_DEG: 10,
  FRONT_PASS_PITCH_DEG: 16,
  /** Front pose BLOCK limits (only when turned strongly sideways, |yaw| > 28°) */
  FRONT_BLOCK_YAW_DEG: 28,

  /** 45° side capture PASS band (18–64°) and allowable WARN band (8–18° or 64–78°) */
  SIDE_PASS_MIN_YAW_DEG: 18,
  SIDE_PASS_MAX_YAW_DEG: 64,
  SIDE_BLOCK_MIN_YAW_DEG: 8,
  SIDE_BLOCK_MAX_YAW_DEG: 78,
  SIDE_PASS_MAX_ROLL_DEG: 14,

  /** Optional 90-degree true side profile bounds */
  PROFILE90_MIN_YAW_DEG: 45,
  PROFILE90_MAX_ROLL_DEG: 18,

  /** Front shot BLOCK only if eyes tightly shut; WARN if mouth clearly open */
  MIN_EYE_ASPECT_BLOCK: 0.06,
  MAX_MOUTH_OPEN_WARN: 0.26,
} as const;

export const EXPRESSION_THRESHOLDS = {
  PASS_MAX: 0.28,
  WARN_MAX: 0.52,
  RESTING_NOISE_FLOOR: 0.12,
} as const;

export const EXPRESSION_BLENDSHAPE_GROUPS: Array<{
  id: string;
  keys: string[];
  weight: number;
  cue: string;
  domain: 'mouth' | 'eyes';
}> = [
  { id: 'smile', keys: ['mouthSmileLeft', 'mouthSmileRight'], weight: 0.95, cue: 'Smile detected', domain: 'mouth' },
  { id: 'jawOpen', keys: ['jawOpen'], weight: 1.05, cue: 'Mouth open', domain: 'mouth' },
  { id: 'mouthFunnel', keys: ['mouthFunnel'], weight: 0.95, cue: 'Mouth open', domain: 'mouth' },
  { id: 'mouthPucker', keys: ['mouthPucker'], weight: 0.9, cue: 'Lips puckered', domain: 'mouth' },
  { id: 'cheekPuff', keys: ['cheekPuff'], weight: 1.0, cue: 'Cheeks puffed', domain: 'mouth' },
  { id: 'browInnerUp', keys: ['browInnerUp'], weight: 0.7, cue: 'Eyebrows raised', domain: 'eyes' },
  { id: 'browDown', keys: ['browDownLeft', 'browDownRight'], weight: 0.6, cue: 'Brows furrowed', domain: 'eyes' },
  { id: 'eyeSquint', keys: ['eyeSquintLeft', 'eyeSquintRight'], weight: 0.55, cue: 'Eyes squinted', domain: 'eyes' },
  { id: 'eyeWide', keys: ['eyeWideLeft', 'eyeWideRight'], weight: 0.75, cue: 'Eyes wide open', domain: 'eyes' },
  { id: 'mouthStretch', keys: ['mouthStretchLeft', 'mouthStretchRight', 'mouthStretch'], weight: 0.65, cue: 'Mouth stretched', domain: 'mouth' },
  { id: 'mouthPress', keys: ['mouthPressLeft', 'mouthPressRight'], weight: 0.55, cue: 'Lips pressed', domain: 'mouth' },
  { id: 'noseSneer', keys: ['noseSneerLeft', 'noseSneerRight'], weight: 0.65, cue: 'Nose wrinkled', domain: 'mouth' },
];

export const CONFIDENCE_WEIGHTS: Record<'high' | 'medium' | 'low', number> = {
  high: 1.0,
  medium: 0.72,
  low: 0.42,
};

/**
 * Calibrated population means & shrinkage factor weights.
 * final = mean + scanConfidence * (raw - mean)
 * At raw sub-score mean 67, calculateCalibratedPslScore(67) = 4.9 (True Normie center).
 */
export const CONFIDENCE_SHRINKAGE_CONSTANTS = {
  POPULATION_SUBSCORE_MEAN: 67,
  POPULATION_PSL_MEAN: 4.9,
  FACTOR_WEIGHTS: {
    pose: 0.24,
    expression: 0.28,
    lighting: 0.18,
    sharpness: 0.15,
    angles: 0.15,
  },
  WARN_EXPRESSION_METRIC_MULTIPLIER: 0.55,
} as const;

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

export const CANTHAL_TILT_THRESHOLDS = {
  POSITIVE_MIN_DEG: 1.5,
  NEGATIVE_MAX_DEG: -1.5,
} as const;

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

export const HAIRLINE_EXTRAPOLATION_IPD = 0.54;

export const PSL_SUBSCORE_WEIGHTS = {
  symmetry: 0.18,
  proportions: 0.16,
  eyeArea: 0.16,
  jawNeck: 0.16,
  cheekbones: 0.12,
  skin: 0.12,
  leanness: 0.10,
} as const;

export type PslTierId = 'Developing' | 'LTN' | 'True Normie' | 'HTN' | 'Chadlite' | 'Chad';

export interface PslTierMeta {
  id: PslTierId;
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

export interface PslLadderRung {
  id: PslTierId;
  minScore: number;
  maxScore: number;
  rangeLabel: string;
  slangName: string;
  slangFull: string;
  neutralName: string;
  explanation: string;
}

export const PSL_LADDER_RUNGS: PslLadderRung[] = [
  {
    id: 'Chad',
    minScore: 7.5,
    maxScore: 8.0,
    rangeLabel: '7.5 – 8.0',
    slangName: 'Chad',
    slangFull: 'Chad (Elite)',
    neutralName: 'Elite',
    explanation: 'Very rare multi-angle symmetry, bone framing, and skin clarity.',
  },
  {
    id: 'Chadlite',
    minScore: 6.5,
    maxScore: 7.49,
    rangeLabel: '6.5 – 7.4',
    slangName: 'Chadlite',
    slangFull: 'Chadlite',
    neutralName: 'Top',
    explanation: 'Distinct symmetry, sharp jaw contours, and strong eye framing.',
  },
  {
    id: 'HTN',
    minScore: 5.5,
    maxScore: 6.49,
    rangeLabel: '5.5 – 6.4',
    slangName: 'HTN',
    slangFull: 'HTN (High-Tier Normie)',
    neutralName: 'High',
    explanation: 'Above-average harmony, clean skin tone, and tidy lower-third lines.',
  },
  {
    id: 'True Normie',
    minScore: 4.5,
    maxScore: 5.49,
    rangeLabel: '4.5 – 5.4',
    slangName: 'True Normie',
    slangFull: 'True Normie',
    neutralName: 'Average',
    explanation: 'Balanced everyday range where most people naturally land.',
  },
  {
    id: 'LTN',
    minScore: 3.5,
    maxScore: 4.49,
    rangeLabel: '3.5 – 4.4',
    slangName: 'LTN',
    slangFull: 'LTN (Low-Tier Normie)',
    neutralName: 'Below average',
    explanation: 'Common baseline with big upside from body fat, skin care, hair, and sleep.',
  },
  {
    id: 'Developing',
    minScore: 1.0,
    maxScore: 3.49,
    rangeLabel: '< 3.5',
    slangName: 'Developing',
    slangFull: 'Developing',
    neutralName: 'Developing',
    explanation: 'Early photo reading — lighting, bloat, posture, and core habits move this fast.',
  },
];

export const PSL_SCALE_GUIDE: Array<{
  rangeLabel: string;
  slangName: string;
  neutralName: string;
  explanation: string;
}> = [...PSL_LADDER_RUNGS].reverse().map((r) => ({
  rangeLabel: r.rangeLabel,
  slangName: r.slangFull,
  neutralName: r.neutralName,
  explanation: r.explanation,
}));

export const WHAT_MOVES_PSL = {
  realisticLevers: [
    'Body fat level (leaner frame sharpens jaw and cheek lines)',
    'Clear skin routine (gentle wash, moisturizer, daily SPF, 7–9h sleep)',
    'Haircut and facial hair tailored to your face shape',
    'Grooming (tidy brows, clean neck, oral care)',
    'Upright neck posture and strong back/traps',
    'Soft front window light and arm’s-length eye-level camera',
  ],
  doesNotMove: [
    'Adult bone structure (chewing gadgets or tapping cannot reshape adult skull bones)',
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
      constructiveLine: 'Biggest levers for you: soft front light, sleep, skin basics, and steady habits.',
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
      constructiveLine: 'Biggest levers for you: skin care, leanness, grooming, and haircut framing.',
      explanation: 'Common baseline with large gains from clear skin, less puffiness, and hair fit.',
    };
  }
  if (score < 5.5) {
    return {
      id: 'True Normie',
      slangLabel: 'True Normie',
      neutralLabel: 'Average',
      displayLabel: useSlangNames ? 'True Normie' : 'Average',
      bracketLabel: useSlangNames ? 'True Normie (Average)' : 'Average',
      rangeLabel: '4.5 – 5.4',
      plainLabel: 'Average',
      constructiveLine: 'Biggest levers for you: lean body fat, daily SPF, and upright neck posture.',
      explanation: 'Balanced everyday range; lower bloat, clean skin, and hair fit sharpen presentation.',
    };
  }
  if (score < 6.5) {
    return {
      id: 'HTN',
      slangLabel: 'HTN',
      neutralLabel: 'High',
      displayLabel: useSlangNames ? 'HTN' : 'High',
      bracketLabel: useSlangNames ? 'HTN (High-Tier Normie)' : 'High',
      rangeLabel: '5.5 – 6.4',
      plainLabel: useSlangNames ? 'High-Tier Normie' : 'High',
      constructiveLine: 'Biggest levers for you: stay lean, protect skin barrier, and train neck/back.',
      explanation: 'Above-average balance, clear skin tone, and sharp lower-third lines across angles.',
    };
  }
  if (score < 7.5) {
    return {
      id: 'Chadlite',
      slangLabel: 'Chadlite',
      neutralLabel: 'Top',
      displayLabel: useSlangNames ? 'Chadlite' : 'Top',
      bracketLabel: useSlangNames ? 'Chadlite (Top)' : 'Top',
      rangeLabel: '6.5 – 7.4',
      plainLabel: 'Top',
      constructiveLine: 'Biggest levers for you: sleep steadiness, daily UV care, and neat grooming.',
      explanation: 'Strong structural alignment across symmetry, eye area, jawline, and skin clarity.',
    };
  }
  return {
    id: 'Chad',
    slangLabel: 'Chad',
    neutralLabel: 'Elite',
    displayLabel: useSlangNames ? 'Chad' : 'Elite',
    bracketLabel: useSlangNames ? 'Chad (Elite)' : 'Elite',
    rangeLabel: '7.5 – 8.0',
    plainLabel: 'Elite',
    constructiveLine: 'Biggest levers for you: protect skin with SPF and keep basic health habits steady.',
    explanation: 'Very rare multi-angle structural harmony, balance, and clear framing.',
  };
}

export function getNeutralTierMeta(score: number, useSlangNames = true): PslTierMeta {
  return getPslTierMeta(score, useSlangNames);
}

export const PSL_HONEST_DISCLAIMER =
  'PSL is an internet scale. This is a rough estimate from photos, not science and not your worth.';

export interface ScanComparisonMatch {
  comparable: boolean;
  label: 'Comparable' | 'Not comparable';
  reasons: string[];
}

export function evaluateScanComparisonMatch(
  scanA: {
    lightingScore: number;
    savedFrontSnapshot?: { faceWidthFrac: number; yawDeg: number } | null;
  } | null | undefined,
  scanB: {
    lightingScore: number;
    savedFrontSnapshot?: { faceWidthFrac: number; yawDeg: number } | null;
  } | null | undefined
): ScanComparisonMatch {
  if (!scanA || !scanB) {
    return {
      comparable: false,
      label: 'Not comparable',
      reasons: ['Need two scans to check setup consistency'],
    };
  }

  const reasons: string[] = [];
  const lightDiff = Math.abs((scanA.lightingScore || 0) - (scanB.lightingScore || 0));
  if (lightDiff > 18) {
    reasons.push(`Lighting shifted by ${Math.round(lightDiff)} pts`);
  }

  const snapA = scanA.savedFrontSnapshot;
  const snapB = scanB.savedFrontSnapshot;
  if (snapA && snapB) {
    const distDiff = Math.abs((snapA.faceWidthFrac || 0) - (snapB.faceWidthFrac || 0));
    if (distDiff > 0.1) {
      reasons.push('Camera distance changed noticeably');
    }
    const yawDiff = Math.abs((snapA.yawDeg || 0) - (snapB.yawDeg || 0));
    if (yawDiff > 8) {
      reasons.push(`Head angle shifted (${Math.round(yawDiff)}° yaw)`);
    }
  }

  const comparable = reasons.length === 0;
  return {
    comparable,
    label: comparable ? 'Comparable' : 'Not comparable',
    reasons: comparable
      ? ['Similar lighting, distance, and front head angle']
      : reasons,
  };
}

