import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  ExtendedReportPillar,
  FaceScanResult,
  FaceShape,
  LandmarksOverlayGuides,
  QualityLevel,
  SavedAngleSnapshot,
  ScanFocusArea,
  ScanMeasurement,
  WarnDomain,
} from '../types';
import { toLocalDateKey } from './date';
import {
  CANTHAL_TILT_THRESHOLDS,
  CONFIDENCE_SHRINKAGE_CONSTANTS,
  CONFIDENCE_WEIGHTS,
  EXPRESSION_BLENDSHAPE_GROUPS,
  EXPRESSION_THRESHOLDS,
  getPslTierMeta,
  HAIRLINE_EXTRAPOLATION_IPD,
  HUMAN_METRIC_PLAUSIBLE_RANGES,
  METRIC_RANGES,
  PLAUSIBILITY_OUTLIER_THRESHOLD,
  PSL_SUBSCORE_WEIGHTS,
  QUALITY_THRESHOLDS,
} from './faceMetricsConstants';

export function recomputeThirdsFromHairlineY(
  faceTopY: number,
  upperThirdY: number,
  midThirdY: number,
  lowerThirdY: number
): { upperPct: number; midPct: number; lowerPct: number } {
  const safeTop = Math.min(faceTopY, upperThirdY - 0.02);
  const upper = Math.max(0.02, upperThirdY - safeTop);
  const mid = Math.max(0.02, midThirdY - upperThirdY);
  const lower = Math.max(0.02, lowerThirdY - midThirdY);
  const total = upper + mid + lower;
  const upperPct = Number(((upper / total) * 100).toFixed(1));
  const midPct = Number(((mid / total) * 100).toFixed(1));
  const lowerPct = Number((100 - upperPct - midPct).toFixed(1));
  return { upperPct, midPct, lowerPct };
}

export function calculateCalibratedPslScore(weightedAvg: number): number {
  const norm = clamp((weightedAvg - 42) / 50, 0, 1);
  const curved = 3.0 + Math.pow(norm, 1.35) * 4.5;
  return Number(clamp(curved, 1.5, 8.0).toFixed(1));
}

export type ScanAngleStep = 'front' | 'left' | 'right' | 'profile90' | 'smile';

export interface ExpressionEvaluation {
  expressionScore: number;
  expressionGate: QualityLevel;
  expressionCue: string | null;
  expressionDomain: 'mouth' | 'eyes' | null;
  activeGroupScores: Record<string, number>;
}

/**
 * Compute expressionScore (0 = neutral, 1 = very expressive) from MediaPipe blendshapes.
 * Combines the strongest expressive group with the top active groups so pulling any
 * clear goofy face (smile, jaw open, cheek puff, wide eyes, brow raise, etc.) reliably gates.
 */
export function computeExpressionScore(
  blendshapes?: Record<string, number> | null,
  landmarkFallback?: { mouthOpen?: number; avgEar?: number }
): ExpressionEvaluation {
  if (!blendshapes || Object.keys(blendshapes).length === 0) {
    // Fallback heuristic if blendshapes were unavailable (e.g., restored draft snapshot)
    const mOpen = landmarkFallback?.mouthOpen ?? 0;
    const ear = landmarkFallback?.avgEar ?? 0.28;
    const mouthComp = clamp((mOpen - 0.14) / 0.28, 0, 1);
    const wideEyeComp = clamp((ear - 0.39) / 0.14, 0, 1);
    const score = Number(clamp(Math.max(mouthComp, wideEyeComp), 0, 1).toFixed(3));
    const cue = mouthComp >= wideEyeComp && mouthComp > 0.12
      ? 'Mouth open'
      : wideEyeComp > 0.12
      ? 'Eyes wide open'
      : null;
    const gate: QualityLevel =
      score > EXPRESSION_THRESHOLDS.WARN_MAX
        ? 'BLOCK'
        : score >= EXPRESSION_THRESHOLDS.PASS_MAX
        ? 'WARN'
        : 'PASS';
    return {
      expressionScore: score,
      expressionGate: gate,
      expressionCue: cue,
      expressionDomain: cue === 'Eyes wide open' ? 'eyes' : cue ? 'mouth' : null,
      activeGroupScores: {},
    };
  }

  const activeGroupScores: Record<string, number> = {};
  let topWeighted = 0;
  let topCue: string | null = null;
  let topDomain: 'mouth' | 'eyes' | null = null;
  const weightedVals: number[] = [];

  for (const group of EXPRESSION_BLENDSHAPE_GROUPS) {
    let rawMax = 0;
    for (const key of group.keys) {
      const v = blendshapes[key];
      if (typeof v === 'number' && Number.isFinite(v) && v > rawMax) {
        rawMax = v;
      }
    }
    const net = Math.max(0, rawMax - EXPRESSION_THRESHOLDS.RESTING_NOISE_FLOOR);
    const weighted = clamp(net * group.weight, 0, 1);
    activeGroupScores[group.id] = Number(rawMax.toFixed(3));
    weightedVals.push(weighted);
    if (weighted > topWeighted) {
      topWeighted = weighted;
      topCue = group.cue;
      topDomain = group.domain;
    }
  }

  weightedVals.sort((a, b) => b - a);
  const top3Mean =
    weightedVals.slice(0, 3).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(3, weightedVals.length));
  const expressionScore = Number(clamp(topWeighted * 0.72 + top3Mean * 0.28, 0, 1).toFixed(3));

  const expressionGate: QualityLevel =
    expressionScore > EXPRESSION_THRESHOLDS.WARN_MAX
      ? 'BLOCK'
      : expressionScore >= EXPRESSION_THRESHOLDS.PASS_MAX
      ? 'WARN'
      : 'PASS';

  return {
    expressionScore,
    expressionGate,
    expressionCue: expressionScore >= EXPRESSION_THRESHOLDS.PASS_MAX * 0.8 ? topCue : null,
    expressionDomain: expressionScore >= EXPRESSION_THRESHOLDS.PASS_MAX * 0.8 ? topDomain : null,
    activeGroupScores,
  };
}

export interface QualityCheckResult {
  level: QualityLevel;
  /** True for PASS and WARN (shutter unlocked); false only for BLOCK */
  passed: boolean;
  /** Single highest-priority friendly instruction for the user */
  primaryInstruction: string;
  /** 0..1 ring fill progress toward ideal target pose */
  poseProgress: number;
  reasons: string[];
  warnings: string[];
  warnDomains: WarnDomain[];
  hint: string;
  brightness: number;
  sideLightDiff: number;
  sharpness: number;
  faceWidthFrac: number;
  faceScale: number;
  rollDeg: number;
  yawDeg: number;
  pitchDeg: number;
  expressionScore: number;
  expressionGate: QualityLevel;
  expressionCue: string | null;
  blendshapes?: Record<string, number> | null;
  landmarks: NormalizedLandmark[] | null;
  matrixData?: number[] | null;
}

const FALLBACK_PT: NormalizedLandmark = { x: 0.5, y: 0.5, z: 0, visibility: 0 };

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function safePt(landmarks: NormalizedLandmark[], idx: number): NormalizedLandmark {
  const pt = landmarks[idx];
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return FALLBACK_PT;
  return pt;
}

export function distPx(a: NormalizedLandmark, b: NormalizedLandmark, w: number, h: number): number {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

export function classifyCanthalTilt(deg: number): 'Positive' | 'Neutral' | 'Negative' {
  if (deg >= CANTHAL_TILT_THRESHOLDS.POSITIVE_MIN_DEG) return 'Positive';
  if (deg <= CANTHAL_TILT_THRESHOLDS.NEGATIVE_MAX_DEG) return 'Negative';
  return 'Neutral';
}

export interface FramePixelStats {
  brightness: number;
  sideLightDiff: number;
  sharpness: number;
}

export function computeImageQualityMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): FramePixelStats {
  const sx = Math.floor(width * 0.18);
  const sy = Math.floor(height * 0.12);
  const sw = Math.max(40, Math.floor(width * 0.64));
  const sh = Math.max(40, Math.floor(height * 0.76));
  const img = ctx.getImageData(sx, sy, sw, sh).data;

  const gray = new Float32Array(sw * sh);
  let leftSum = 0;
  let leftCount = 0;
  let rightSum = 0;
  let rightCount = 0;
  const halfW = sw >> 1;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      const l = 0.299 * img[idx] + 0.587 * img[idx + 1] + 0.114 * img[idx + 2];
      gray[y * sw + x] = l;
      if ((x & 1) === 0 && (y & 1) === 0) {
        if (x < halfW) {
          leftSum += l;
          leftCount++;
        } else {
          rightSum += l;
          rightCount++;
        }
      }
    }
  }

  let lapSum = 0;
  let lapCount = 0;
  for (let y = 1; y < sh - 1; y += 2) {
    for (let x = 1; x < sw - 1; x += 2) {
      const c = gray[y * sw + x];
      const lap = Math.abs(
        4 * c -
          gray[(y - 1) * sw + x] -
          gray[(y + 1) * sw + x] -
          gray[y * sw + (x - 1)] -
          gray[y * sw + (x + 1)]
      );
      lapSum += lap;
      lapCount++;
    }
  }

  const leftMean = leftCount > 0 ? leftSum / leftCount : 128;
  const rightMean = rightCount > 0 ? rightSum / rightCount : 128;
  const totalCount = leftCount + rightCount;

  return {
    brightness: totalCount > 0 ? (leftSum + rightSum) / totalCount : 128,
    sideLightDiff: Math.abs(leftMean - rightMean),
    sharpness: lapCount > 0 ? lapSum / lapCount : 10,
  };
}

/**
 * Extract yaw, pitch, and roll (degrees) from MediaPipe 4x4 row-major
 * facialTransformationMatrixes when available.
 * Note: Returns null if matrix is missing or invalid so callers fall back
 * cleanly to landmark-based pose estimation.
 */
export function extractPoseFromTransformationMatrix(
  matrixData?: ArrayLike<number> | null
): { yawDeg: number; pitchDeg: number; rollDeg: number; rot3x3: number[] } | null {
  if (!matrixData || matrixData.length < 12) return null;
  const m00 = matrixData[0];
  const m01 = matrixData[1];
  const m02 = matrixData[2];
  const m10 = matrixData[4];
  const m11 = matrixData[5];
  const m12 = matrixData[6];
  const m20 = matrixData[8];
  const m21 = matrixData[9];
  const m22 = matrixData[10];

  if (
    !Number.isFinite(m00) ||
    !Number.isFinite(m11) ||
    !Number.isFinite(m22)
  ) {
    return null;
  }

  // Orthonormalize column vectors to remove uniform camera/face scale factor
  const s0 = Math.hypot(m00, m10, m20) || 1;
  const s1 = Math.hypot(m01, m11, m21) || 1;
  const s2 = Math.hypot(m02, m12, m22) || 1;
  const r00 = m00 / s0;
  const r10 = m10 / s0;
  const r20 = m20 / s0;
  const r01 = m01 / s1;
  const r11 = m11 / s1;
  const r21 = m21 / s1;
  const r02 = m02 / s2;
  const r12 = m12 / s2;
  const r22 = m22 / s2;

  const sy = Math.hypot(r00, r10);
  const rollRad = Math.atan2(r10, r00);
  const pitchRad = Math.atan2(-r21, r22);
  const yawRad = Math.atan2(-r20, sy);

  return {
    yawDeg: clamp((yawRad * 180) / Math.PI, -88, 88),
    pitchDeg: clamp((pitchRad * 180) / Math.PI, -45, 45),
    rollDeg: clamp((rollRad * 180) / Math.PI, -45, 45),
    rot3x3: [r00, r01, r02, r10, r11, r12, r20, r21, r22],
  };
}

/**
 * De-rotate landmarks into frontal canonical coordinates using MediaPipe's
 * 3x3 rotation matrix transpose (R^T) when available, or inverse Euler angles
 * estimated from landmarks as a documented fallback.
 */
export function derotateLandmarks(
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  matrixData?: ArrayLike<number> | null,
  fallbackRollDeg = 0,
  fallbackYawDeg = 0,
  fallbackPitchDeg = 0
): NormalizedLandmark[] {
  if (!landmarks || landmarks.length < 468) return landmarks;

  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const pivot = safePt(landmarks, 168); // nasal bridge between eyes
  const cx = pivot.x * w;
  const cy = pivot.y * h;
  const cz = (pivot.z ?? 0) * w;

  const matPose = extractPoseFromTransformationMatrix(matrixData);
  let r00: number, r01: number, r02: number;
  let r10: number, r11: number, r12: number;
  let r20: number, r21: number, r22: number;

  if (matPose) {
    // Inverse of orthogonal rotation matrix R is its transpose R^T
    const R = matPose.rot3x3;
    r00 = R[0];
    r01 = R[3];
    r02 = R[6];
    r10 = R[1];
    r11 = R[4];
    r12 = R[7];
    r20 = R[2];
    r21 = R[5];
    r22 = R[8];
  } else {
    // Fallback: inverse Euler rotation from landmark roll/yaw/pitch when matrix is unavailable
    const cr = Math.cos((-fallbackRollDeg * Math.PI) / 180);
    const sr = Math.sin((-fallbackRollDeg * Math.PI) / 180);
    const cyaw = Math.cos((-fallbackYawDeg * Math.PI) / 180);
    const syaw = Math.sin((-fallbackYawDeg * Math.PI) / 180);
    const cp = Math.cos((-fallbackPitchDeg * Math.PI) / 180);
    const sp = Math.sin((-fallbackPitchDeg * Math.PI) / 180);

    // Rz(roll) * Ry(yaw) * Rx(pitch)
    r00 = cr * cyaw;
    r01 = cr * syaw * sp - sr * cp;
    r02 = cr * syaw * cp + sr * sp;
    r10 = sr * cyaw;
    r11 = sr * syaw * sp + cr * cp;
    r12 = sr * syaw * cp - cr * sp;
    r20 = -syaw;
    r21 = cyaw * sp;
    r22 = cyaw * cp;
  }

  return landmarks.map((pt) => {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return pt;
    const dx = pt.x * w - cx;
    const dy = pt.y * h - cy;
    const dz = (pt.z ?? 0) * w - cz;

    const nx = r00 * dx + r01 * dy + r02 * dz + cx;
    const ny = r10 * dx + r11 * dy + r12 * dz + cy;
    const nz = r20 * dx + r21 * dy + r22 * dz + cz;

    return {
      x: nx / w,
      y: ny / h,
      z: nz / w,
      visibility: pt.visibility ?? 1,
    };
  });
}

/**
 * Compute per-landmark coordinate-wise median across a short capture burst
 * (e.g. 5 consecutive frames) to suppress detection jitter cleanly.
 */
export function computeMedianLandmarks(
  framesLandmarks: NormalizedLandmark[][]
): NormalizedLandmark[] | null {
  const valid = framesLandmarks.filter((f) => Array.isArray(f) && f.length >= 468);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  const len = valid[0].length;
  const out: NormalizedLandmark[] = new Array(len);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i < len; i++) {
    xs.length = 0;
    ys.length = 0;
    zs.length = 0;
    for (let f = 0; f < valid.length; f++) {
      const pt = valid[f][i];
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        xs.push(pt.x);
        ys.push(pt.y);
        zs.push(pt.z ?? 0);
      }
    }
    if (xs.length === 0) {
      out[i] = FALLBACK_PT;
      continue;
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
    const mid = xs.length >> 1;
    out[i] = {
      x: xs[mid],
      y: ys[mid],
      z: zs[mid],
      visibility: 1,
    };
  }

  return out;
}

export function evaluateLandmarksQuality(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[] | null,
  expectedAngle: ScanAngleStep,
  matrixData?: ArrayLike<number> | null,
  blendshapes?: Record<string, number> | null
): QualityCheckResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const { brightness, sideLightDiff, sharpness } = ctx
    ? computeImageQualityMetrics(ctx, w, h)
    : { brightness: 128, sideLightDiff: 0, sharpness: 12 };

  const blockReasons: string[] = [];
  const warnReasons: string[] = [];
  const warnDomains = new Set<WarnDomain>();

  // 1. Lighting & basic frame checks (only extreme darkness/glare blocks)
  if (brightness < QUALITY_THRESHOLDS.BRIGHTNESS_BLOCK_MIN) {
    blockReasons.push('Too dark — face a window or turn on a light');
  } else if (brightness > QUALITY_THRESHOLDS.BRIGHTNESS_BLOCK_MAX) {
    blockReasons.push('Too bright — step out of harsh direct glare');
  } else if (
    brightness < QUALITY_THRESHOLDS.BRIGHTNESS_PASS_MIN ||
    brightness > QUALITY_THRESHOLDS.BRIGHTNESS_PASS_MAX
  ) {
    warnReasons.push('Lighting is slightly dim or uneven');
    warnDomains.add('lighting');
  }

  if (sideLightDiff > QUALITY_THRESHOLDS.SIDE_LIGHT_DIFF_WARN) {
    warnReasons.push('Face light slightly more evenly');
    warnDomains.add('lighting');
  }

  if (sharpness < QUALITY_THRESHOLDS.SHARPNESS_WARN_THRESHOLD) {
    warnReasons.push('Hold steady for sharper focus');
    warnDomains.add('blur');
  }

  if (!landmarks || landmarks.length < 468) {
    blockReasons.unshift('Center your face inside the ring');
    return {
      level: 'BLOCK',
      passed: false,
      primaryInstruction: blockReasons[0],
      poseProgress: 0,
      reasons: blockReasons,
      warnings: warnReasons,
      warnDomains: Array.from(warnDomains),
      hint: blockReasons[0],
      brightness,
      sideLightDiff,
      sharpness,
      faceWidthFrac: 0,
      faceScale: 0,
      rollDeg: 0,
      yawDeg: 0,
      pitchDeg: 0,
      expressionScore: 0,
      expressionGate: 'PASS',
      expressionCue: null,
      blendshapes: blendshapes ?? null,
      landmarks: null,
      matrixData: matrixData ? Array.from(matrixData) : null,
    };
  }

  const fore = safePt(landmarks, 10);
  const chin = safePt(landmarks, 152);
  const leftCheek = safePt(landmarks, 234);
  const rightCheek = safePt(landmarks, 454);
  const noseTip = safePt(landmarks, 1);
  const leftEyeOuter = safePt(landmarks, 33);
  const leftEyeInner = safePt(landmarks, 133);
  const rightEyeInner = safePt(landmarks, 362);
  const rightEyeOuter = safePt(landmarks, 263);

  const faceWidthFrac = Math.abs(rightCheek.x - leftCheek.x);
  const faceHeight = Math.abs(chin.y - fore.y);

  if (faceWidthFrac < QUALITY_THRESHOLDS.MIN_FACE_WIDTH_BLOCK) {
    blockReasons.push('Move a little closer');
  } else if (faceHeight > QUALITY_THRESHOLDS.MAX_FACE_HEIGHT_BLOCK) {
    blockReasons.push('Hold the phone slightly farther away');
  } else if (faceWidthFrac < QUALITY_THRESHOLDS.MIN_FACE_WIDTH_PASS) {
    warnReasons.push('Move slightly closer for sharper detail');
  }

  // Landmark pose estimation (used directly and as fallback if matrix is unavailable)
  const rollRadLm = Math.atan2(
    (rightEyeOuter.y - leftEyeOuter.y) * h,
    Math.max(1e-4, Math.abs(rightEyeOuter.x - leftEyeOuter.x)) * w * (rightEyeOuter.x >= leftEyeOuter.x ? 1 : -1)
  );
  const rollDegLm = clamp((rollRadLm * 180) / Math.PI, -45, 45);
  const safeWidthX = Math.max(0.035, faceWidthFrac);
  const noseRelX = (noseTip.x - (leftCheek.x + rightCheek.x) / 2) / safeWidthX;
  const yawDegLm = clamp(noseRelX * 72, -88, 88);

  const eyeMidY = (leftEyeInner.y + rightEyeInner.y) / 2;
  const noseToEye = noseTip.y - eyeMidY;
  const chinToEye = Math.max(0.03, chin.y - eyeMidY);
  const pitchDegLm = clamp((noseToEye / chinToEye - 0.39) * 85, -45, 45);

  // Prefer MediaPipe facialTransformationMatrixes for pose when available, keeping sign consistent with noseRelX
  const matPose = extractPoseFromTransformationMatrix(matrixData);
  let yawDeg = yawDegLm;
  let rollDeg = rollDegLm;
  let pitchDeg = pitchDegLm;
  if (matPose) {
    // Align matrix yaw sign with landmark horizontal offset convention so left/right steps never invert
    const alignedYawSign =
      Math.abs(matPose.yawDeg) > 4 && Math.abs(yawDegLm) > 4 && Math.sign(matPose.yawDeg) !== Math.sign(yawDegLm)
        ? -matPose.yawDeg
        : matPose.yawDeg;
    yawDeg = Math.abs(alignedYawSign) > 0.5 ? alignedYawSign : yawDegLm;
    rollDeg = matPose.rollDeg;
    pitchDeg = matPose.pitchDeg;
  }

  // Eyes open & neutral mouth checks
  const leftEar =
    distPx(safePt(landmarks, 159), safePt(landmarks, 145), w, h) /
    Math.max(1, distPx(leftEyeOuter, leftEyeInner, w, h));
  const rightEar =
    distPx(safePt(landmarks, 386), safePt(landmarks, 374), w, h) /
    Math.max(1, distPx(rightEyeInner, rightEyeOuter, w, h));
  const avgEar = (leftEar + rightEar) / 2;

  const mouthOpen =
    distPx(safePt(landmarks, 13), safePt(landmarks, 14), w, h) /
    Math.max(1, distPx(safePt(landmarks, 61), safePt(landmarks, 291), w, h));

  // Optional brow shadow / glasses glare warnings (non-blocking WARN)
  if (ctx) {
    const browPt = safePt(landmarks, 9);
    const cheekPt = safePt(landmarks, 50);
    const fx = clamp(Math.round(browPt.x * w), 6, Math.max(6, w - 7));
    const fy = clamp(Math.round(browPt.y * h), 6, Math.max(6, h - 7));
    const cx = clamp(Math.round(cheekPt.x * w), 6, Math.max(6, w - 7));
    const cy = clamp(Math.round(cheekPt.y * h), 6, Math.max(6, h - 7));
    try {
      const foreData = ctx.getImageData(fx - 4, fy - 4, 8, 8).data;
      const cheekData = ctx.getImageData(cx - 4, cy - 4, 8, 8).data;
      let fSum = 0;
      let cSum = 0;
      for (let i = 0; i < foreData.length; i += 4) {
        fSum += 0.299 * foreData[i] + 0.587 * foreData[i + 1] + 0.114 * foreData[i + 2];
        cSum += 0.299 * cheekData[i] + 0.587 * cheekData[i + 1] + 0.114 * cheekData[i + 2];
      }
      const fMean = fSum / (foreData.length / 4);
      const cMean = cSum / (cheekData.length / 4);
      if (cMean - fMean > 68) {
        warnReasons.push('Hair may be covering your forehead');
        warnDomains.add('occlusion');
      }
      if (fMean > 242) {
        warnReasons.push('Glare near glasses or brow bridge');
        warnDomains.add('occlusion');
      }
    } catch {
      // Ignore pixel read issues
    }
  }

  let poseProgress = 1;

  if (expectedAngle === 'front' || expectedAngle === 'smile') {
    if (avgEar < QUALITY_THRESHOLDS.MIN_EYE_ASPECT_BLOCK) {
      blockReasons.push('Open both eyes naturally');
    }
    if (Math.abs(yawDeg) > QUALITY_THRESHOLDS.FRONT_BLOCK_YAW_DEG) {
      blockReasons.push(
        yawDeg > 0 ? 'Turn slightly right to face the camera' : 'Turn slightly left to face the camera'
      );
    } else if (Math.abs(yawDeg) > QUALITY_THRESHOLDS.FRONT_PASS_YAW_DEG) {
      warnReasons.push(
        yawDeg > 0 ? 'Turn slightly right toward center' : 'Turn slightly left toward center'
      );
      warnDomains.add('yaw');
    }

    if (Math.abs(rollDeg) > QUALITY_THRESHOLDS.FRONT_PASS_ROLL_DEG) {
      warnReasons.push('Level your head slightly');
      warnDomains.add('pose');
    }
    if (Math.abs(pitchDeg) > QUALITY_THRESHOLDS.FRONT_PASS_PITCH_DEG) {
      warnReasons.push(pitchDeg > 0 ? 'Raise your chin slightly' : 'Tilt your chin slightly down');
      warnDomains.add('pose');
    }
    if (expectedAngle === 'front' && mouthOpen > QUALITY_THRESHOLDS.MAX_MOUTH_OPEN_WARN) {
      warnReasons.push('Close lips gently for a neutral read');
      warnDomains.add('mouth');
    }

    const yawScore = 1 - clamp(Math.abs(yawDeg) / QUALITY_THRESHOLDS.FRONT_BLOCK_YAW_DEG, 0, 1);
    const rollScore = 1 - clamp(Math.abs(rollDeg) / 22, 0, 1);
    const pitchScore = 1 - clamp(Math.abs(pitchDeg) / 26, 0, 1);
    poseProgress = clamp(yawScore * 0.5 + rollScore * 0.25 + pitchScore * 0.25, 0.15, 1);
  } else if (expectedAngle === 'left') {
    // Camera sees LEFT jaw when user turns head RIGHT (negative yawDeg)
    if (yawDeg > 12) {
      blockReasons.push('Turn your head to the RIGHT so your LEFT jaw faces camera');
    } else if (yawDeg > -QUALITY_THRESHOLDS.SIDE_BLOCK_MIN_YAW_DEG) {
      blockReasons.push('Turn slightly more to the right');
    } else if (yawDeg < -QUALITY_THRESHOLDS.SIDE_BLOCK_MAX_YAW_DEG) {
      blockReasons.push('Turn slightly back toward the camera');
    } else if (
      yawDeg > -QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG ||
      yawDeg < -QUALITY_THRESHOLDS.SIDE_PASS_MAX_YAW_DEG
    ) {
      warnReasons.push(
        yawDeg > -QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG
          ? 'Turn a touch more right for ideal 45°'
          : 'Turn slightly back toward center'
      );
      warnDomains.add('yaw');
    }

    if (Math.abs(rollDeg) > QUALITY_THRESHOLDS.SIDE_PASS_MAX_ROLL_DEG) {
      warnReasons.push('Keep head level with horizon');
      warnDomains.add('pose');
    }
    if (mouthOpen > QUALITY_THRESHOLDS.MAX_MOUTH_OPEN_WARN) {
      warnReasons.push('Close mouth for cleaner jaw line');
      warnDomains.add('mouth');
    }

    const absYaw = Math.max(0, -yawDeg);
    const minPass = QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG;
    const maxPass = QUALITY_THRESHOLDS.SIDE_PASS_MAX_YAW_DEG;
    const distFromTarget =
      absYaw < minPass ? (minPass - absYaw) / minPass : absYaw > maxPass ? (absYaw - maxPass) / 20 : 0;
    poseProgress = clamp(1 - distFromTarget, 0.15, 1);
  } else if (expectedAngle === 'right') {
    // Camera sees RIGHT jaw when user turns head LEFT (positive yawDeg)
    if (yawDeg < -12) {
      blockReasons.push('Turn your head to the LEFT so your RIGHT jaw faces camera');
    } else if (yawDeg < QUALITY_THRESHOLDS.SIDE_BLOCK_MIN_YAW_DEG) {
      blockReasons.push('Turn slightly more to the left');
    } else if (yawDeg > QUALITY_THRESHOLDS.SIDE_BLOCK_MAX_YAW_DEG) {
      blockReasons.push('Turn slightly back toward the camera');
    } else if (
      yawDeg < QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG ||
      yawDeg > QUALITY_THRESHOLDS.SIDE_PASS_MAX_YAW_DEG
    ) {
      warnReasons.push(
        yawDeg < QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG
          ? 'Turn a touch more left for ideal 45°'
          : 'Turn slightly back toward center'
      );
      warnDomains.add('yaw');
    }

    if (Math.abs(rollDeg) > QUALITY_THRESHOLDS.SIDE_PASS_MAX_ROLL_DEG) {
      warnReasons.push('Keep head level with horizon');
      warnDomains.add('pose');
    }
    if (mouthOpen > QUALITY_THRESHOLDS.MAX_MOUTH_OPEN_WARN) {
      warnReasons.push('Close mouth for cleaner jaw line');
      warnDomains.add('mouth');
    }

    const absYaw = Math.max(0, yawDeg);
    const minPass = QUALITY_THRESHOLDS.SIDE_PASS_MIN_YAW_DEG;
    const maxPass = QUALITY_THRESHOLDS.SIDE_PASS_MAX_YAW_DEG;
    const distFromTarget =
      absYaw < minPass ? (minPass - absYaw) / minPass : absYaw > maxPass ? (absYaw - maxPass) / 20 : 0;
    poseProgress = clamp(1 - distFromTarget, 0.15, 1);
  } else if (expectedAngle === 'profile90') {
    if (Math.abs(yawDeg) < QUALITY_THRESHOLDS.PROFILE90_MIN_YAW_DEG) {
      blockReasons.push('Turn further sideways toward 90° profile');
    }
    if (Math.abs(rollDeg) > QUALITY_THRESHOLDS.PROFILE90_MAX_ROLL_DEG) {
      warnReasons.push('Keep head upright and level');
      warnDomains.add('pose');
    }
    poseProgress = clamp(Math.abs(yawDeg) / 70, 0.15, 1);
  }

  // Neutral-expression gate from MediaPipe blendshapes (checked on live preview & still capture).
  // Side angles foreshorten half the face and skew blendshapes, so side turns warn instead of red-blocking.
  const expr = computeExpressionScore(blendshapes, { mouthOpen, avgEar });
  const isSideAngle = expectedAngle === 'left' || expectedAngle === 'right' || expectedAngle === 'profile90';
  let effectiveExpressionGate: QualityLevel = expectedAngle === 'smile' ? 'PASS' : expr.expressionGate;
  if (isSideAngle && effectiveExpressionGate === 'BLOCK') {
    effectiveExpressionGate = 'WARN';
  }

  if (expectedAngle !== 'smile') {
    if (effectiveExpressionGate === 'BLOCK') {
      const cueSuffix = expr.expressionCue ? ` (${expr.expressionCue})` : '';
      blockReasons.unshift(`Neutral face please: mouth closed, relax your forehead${cueSuffix}`);
      warnDomains.add('expression');
      warnDomains.add('mouth');
      warnDomains.add('eyes');
    } else if (effectiveExpressionGate === 'WARN' && !isSideAngle) {
      const cueSuffix = expr.expressionCue ? ` — ${expr.expressionCue}` : '';
      warnReasons.unshift(`Relax your face a little${cueSuffix}`);
      warnDomains.add('expression');
      warnDomains.add('mouth');
      warnDomains.add('eyes');
    }
  }

  const level: QualityLevel =
    blockReasons.length > 0 ? 'BLOCK' : warnReasons.length > 0 ? 'WARN' : 'PASS';
  const passed = level !== 'BLOCK';
  const primaryInstruction =
    level === 'BLOCK'
      ? blockReasons[0]
      : level === 'WARN'
      ? warnReasons[0]
      : 'Aligned — tap Capture Angle';

  return {
    level,
    passed,
    primaryInstruction,
    poseProgress: level === 'BLOCK' ? Math.min(poseProgress, 0.65) : level === 'WARN' ? Math.min(poseProgress, 0.9) : 1,
    reasons: blockReasons,
    warnings: warnReasons,
    warnDomains: Array.from(warnDomains),
    hint: primaryInstruction,
    brightness,
    sideLightDiff,
    sharpness,
    faceWidthFrac,
    faceScale: faceHeight,
    rollDeg,
    yawDeg,
    pitchDeg,
    expressionScore: expr.expressionScore,
    expressionGate: effectiveExpressionGate,
    expressionCue: expr.expressionCue,
    blendshapes: blendshapes ?? null,
    landmarks,
    matrixData: matrixData ? Array.from(matrixData) : null,
  };
}

export interface SkinPixelStats {
  evennessScore: number;
  rednessIndex: number;
  underEyeContrast: number;
}

export function sampleSkinStats(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
): SkinPixelStats {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { evennessScore: 68, rednessIndex: 12, underEyeContrast: 8 };

  const sampleIndices = [117, 118, 101, 50, 346, 347, 330, 280, 151, 108, 337];
  const rVals: number[] = [];
  const gVals: number[] = [];
  const lumVals: number[] = [];
  const patchRadius = 5;

  for (const idx of sampleIndices) {
    const pt = landmarks[idx];
    if (!pt) continue;
    const cx = clamp(Math.round(pt.x * canvas.width), patchRadius, canvas.width - patchRadius - 1);
    const cy = clamp(Math.round(pt.y * canvas.height), patchRadius, canvas.height - patchRadius - 1);
    const data = ctx.getImageData(cx - patchRadius, cy - patchRadius, patchRadius * 2, patchRadius * 2).data;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      rVals.push(r);
      gVals.push(g);
      lumVals.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  if (lumVals.length === 0) return { evennessScore: 68, rednessIndex: 12, underEyeContrast: 8 };

  const meanLum = lumVals.reduce((a, b) => a + b, 0) / lumVals.length;
  const variance = lumVals.reduce((acc, v) => acc + (v - meanLum) ** 2, 0) / lumVals.length;
  const stdDev = Math.sqrt(variance);

  let redDiffSum = 0;
  for (let i = 0; i < rVals.length; i++) {
    redDiffSum += Math.max(0, rVals[i] - gVals[i]);
  }
  const redness = redDiffSum / rVals.length;

  let underEyeContrast = 8;
  try {
    const uePt = safePt(landmarks, 229);
    const chPt = safePt(landmarks, 50);
    const uData = ctx.getImageData(
      clamp(Math.round(uePt.x * canvas.width), 3, canvas.width - 4),
      clamp(Math.round(uePt.y * canvas.height), 3, canvas.height - 4),
      4,
      4
    ).data;
    const cData = ctx.getImageData(
      clamp(Math.round(chPt.x * canvas.width), 3, canvas.width - 4),
      clamp(Math.round(chPt.y * canvas.height), 3, canvas.height - 4),
      4,
      4
    ).data;
    const avgLum = (d: Uint8ClampedArray) => {
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return s / Math.max(1, d.length / 4);
    };
    underEyeContrast = Math.round(Math.max(0, avgLum(cData) - avgLum(uData)));
  } catch {
    underEyeContrast = 8;
  }

  const evennessScore = clamp(
    Math.round(92 - stdDev * 1.15 - Math.max(0, redness - 22) * 0.65 - Math.max(0, underEyeContrast - 14) * 0.35),
    35,
    93
  );
  return { evennessScore, rednessIndex: Math.round(redness), underEyeContrast };
}

export function classifyFaceShape(
  cheekWidth: number,
  jawWidth: number,
  foreheadWidth: number,
  faceLength: number
): FaceShape {
  const lengthToWidth = faceLength / Math.max(1, cheekWidth);
  const jawToCheek = jawWidth / Math.max(1, cheekWidth);
  const foreheadToCheek = foreheadWidth / Math.max(1, cheekWidth);

  if (lengthToWidth > 1.52) return 'oblong';
  if (jawToCheek > 0.88 && lengthToWidth < 1.32) return 'square';
  if (jawToCheek > 0.84 && lengthToWidth <= 1.24) return 'round';
  if (foreheadToCheek < 0.82 && jawToCheek < 0.8) return 'diamond';
  if (foreheadToCheek > 0.92 && jawToCheek < 0.76) return 'heart';
  return 'oval';
}

function rangeStatus(
  val: number,
  min: number,
  max: number
): { status: 'balanced' | 'watch' | 'focus'; measurementStatus: 'in range' | 'below' | 'above' } {
  if (val < min) return { status: 'watch', measurementStatus: 'below' };
  if (val > max) return { status: 'watch', measurementStatus: 'above' };
  return { status: 'balanced', measurementStatus: 'in range' };
}

export function extractSideProfileGeometry(pLm: NormalizedLandmark[], w = 640, h = 480) {
  const p234 = safePt(pLm, 234);
  const p454 = safePt(pLm, 454);
  const p172 = safePt(pLm, 172);
  const p397 = safePt(pLm, 397);
  const ear = (p234.z ?? 0) < (p454.z ?? 0) ? p234 : p454;
  const gonion = (p172.z ?? 0) < (p397.z ?? 0) ? p172 : p397;
  const menton = safePt(pLm, 152);
  const noseTip = safePt(pLm, 1);
  const upperLip = safePt(pLm, 0);
  const subnasale = safePt(pLm, 2);
  const foreheadTop = safePt(pLm, 10);
  const glabella = safePt(pLm, 9);
  const infraorbital = safePt(pLm, 50);

  const v1x = (ear.x - gonion.x) * w;
  const v1y = (ear.y - gonion.y) * h;
  const v2x = (menton.x - gonion.x) * w;
  const v2y = (menton.y - gonion.y) * h;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.max(0.0001, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
  const gonialAngle = clamp((Math.acos(clamp(dot / mag, -1, 1)) * 180) / Math.PI, 98, 148);

  const jawContourLengthPx = Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y);
  const faceHeightPx = Math.max(10, distPx(foreheadTop, menton, w, h));
  const jawProjectionRatio = jawContourLengthPx / faceHeightPx;

  const jawSlopeDeg =
    (Math.atan2(Math.abs(menton.y - gonion.y) * h, Math.max(1, Math.abs(menton.x - gonion.x) * w)) * 180) /
    Math.PI;
  const submentalAngle = clamp(122 - jawSlopeDeg * 0.55, 88, 142);

  const chinProjection =
    ((menton.x - subnasale.x) * (noseTip.x >= ear.x ? 1 : -1)) / Math.max(0.02, Math.abs(noseTip.x - ear.x));
  const chinProjectionPct = clamp(Math.round((chinProjection + 0.35) * 100), 15, 95);
  const eLineOffset = Math.abs(upperLip.x - (noseTip.x + menton.x) / 2) * 100;

  const foreheadSlopeDeg = clamp(
    (Math.atan2(Math.abs(foreheadTop.x - glabella.x) * w, Math.max(1, (glabella.y - foreheadTop.y) * h)) * 180) /
      Math.PI,
    2,
    32
  );
  const maxillaProjection = clamp(
    55 + (subnasale.x - infraorbital.x) * (noseTip.x >= ear.x ? 1 : -1) * 180,
    35,
    90
  );
  const orbitalDepth = clamp(52 + Math.abs(glabella.x - infraorbital.x) * 240, 35, 90);

  return {
    gonialAngle,
    jawProjectionRatio,
    submentalAngle,
    chinProjectionPct,
    eLineOffset,
    foreheadSlopeDeg,
    maxillaProjection,
    orbitalDepth,
  };
}

export function createSmallThumbnail(canvas: HTMLCanvasElement): string {
  try {
    const safeW = Math.max(1, canvas.width || 240);
    const safeH = Math.max(1, canvas.height || 180);
    const targetW = 240;
    const targetH = Math.max(1, Math.round((safeH / safeW) * targetW));
    const thumb = document.createElement('canvas');
    thumb.width = targetW;
    thumb.height = targetH;
    const tctx = thumb.getContext('2d');
    if (!tctx) return '';
    tctx.drawImage(canvas, 0, 0, targetW, targetH);
    return thumb.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

function downgradeConfidence(
  base: 'high' | 'medium' | 'low',
  activeWarns: WarnDomain[],
  sensitiveTo: WarnDomain[]
): 'high' | 'medium' | 'low' {
  const hits = sensitiveTo.filter((d) => activeWarns.includes(d)).length;
  if (hits === 0) return base;
  if (base === 'high') return hits >= 2 ? 'low' : 'medium';
  if (base === 'medium') return 'low';
  return 'low';
}

function toSnapshot(
  q: QualityCheckResult,
  skinStats?: SkinPixelStats
): SavedAngleSnapshot {
  return {
    landmarks: (q.landmarks ?? []).map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
    brightness: q.brightness,
    sideLightDiff: q.sideLightDiff,
    sharpness: q.sharpness,
    faceWidthFrac: q.faceWidthFrac,
    faceScale: q.faceScale,
    rollDeg: q.rollDeg,
    yawDeg: q.yawDeg,
    pitchDeg: q.pitchDeg,
    qualityLevel: q.level,
    warnDomains: q.warnDomains,
    expressionScore: q.expressionScore,
    expressionCue: q.expressionCue,
    skinStats,
  };
}

export function computeScanConfidenceFactor(params: {
  frontQuality: QualityCheckResult;
  anglesCount: number;
}): number {
  const { frontQuality, anglesCount } = params;
  const fw = CONFIDENCE_SHRINKAGE_CONSTANTS.FACTOR_WEIGHTS;

  const poseAccuracy = clamp(
    1 -
      (Math.abs(frontQuality.yawDeg) / 22) * 0.45 -
      (Math.abs(frontQuality.rollDeg) / 15) * 0.3 -
      (Math.abs(frontQuality.pitchDeg) / 20) * 0.25,
    0.2,
    1
  );

  const exprScore = clamp(frontQuality.expressionScore ?? 0, 0, 1);
  const expressionConfidence = clamp(1 - exprScore * 1.9, 0.15, 1);

  const lightScore = clamp(
    1 - Math.abs(frontQuality.brightness - 130) / 140 - frontQuality.sideLightDiff / 95,
    0.25,
    1
  );

  const sharpScore = clamp(frontQuality.sharpness / 8, 0.3, 1);
  const anglesScore = anglesCount >= 3 ? 1.0 : anglesCount === 2 ? 0.8 : 0.62;

  const raw =
    poseAccuracy * fw.pose +
    expressionConfidence * fw.expression +
    lightScore * fw.lighting +
    sharpScore * fw.sharpness +
    anglesScore * fw.angles;

  // Penalize missing landmarks heavily
  const landmarkFactor =
    frontQuality.landmarks && frontQuality.landmarks.length >= 468 ? 1 : 0.35;

  return Number(clamp(raw * landmarkFactor, 0.2, 0.98).toFixed(2));
}

export function computeFullScanResult(params: {
  frontCanvas?: HTMLCanvasElement | null;
  frontQuality: QualityCheckResult;
  frontSkinStatsOverride?: SkinPixelStats;
  leftCanvas?: HTMLCanvasElement | null;
  leftQuality?: QualityCheckResult | null;
  rightCanvas?: HTMLCanvasElement | null;
  rightQuality?: QualityCheckResult | null;
  profile90Canvas?: HTMLCanvasElement | null;
  profile90Quality?: QualityCheckResult | null;
  hasSmile?: boolean;
  saveThumbnails: boolean;
  preserveFrontThumbnail?: string;
  preserveLeftThumbnail?: string;
  preserveRightThumbnail?: string;
}): FaceScanResult {
  const {
    frontCanvas,
    frontQuality,
    frontSkinStatsOverride,
    leftCanvas,
    leftQuality,
    rightCanvas,
    rightQuality,
    profile90Canvas,
    profile90Quality,
    hasSmile,
    saveThumbnails,
    preserveFrontThumbnail,
    preserveLeftThumbnail,
    preserveRightThumbnail,
  } = params;

  const w = Math.max(1, frontCanvas?.width || 640);
  const h = Math.max(1, frontCanvas?.height || 480);

  // De-rotate front landmarks (using transformation matrix when present, else Euler fallback)
  // before computing any IPD-normalized geometry so small head tilts do not distort metrics.
  const rawLm = frontQuality.landmarks ?? [];
  const lm = derotateLandmarks(
    rawLm,
    w,
    h,
    frontQuality.matrixData,
    frontQuality.rollDeg,
    frontQuality.yawDeg,
    frontQuality.pitchDeg
  );

  const frontWarns = frontQuality.warnDomains ?? [];
  const sideWarns: WarnDomain[] = [
    ...(leftQuality?.warnDomains ?? []),
    ...(rightQuality?.warnDomains ?? []),
  ];

  const p0 = safePt(lm, 0);
  const p2 = safePt(lm, 2);
  const p9 = safePt(lm, 9);
  const p10 = safePt(lm, 10);
  const p13 = safePt(lm, 13);
  const p14 = safePt(lm, 14);
  const p17 = safePt(lm, 17);
  const p33 = safePt(lm, 33);
  const p46 = safePt(lm, 46);
  const p54 = safePt(lm, 54);
  const p55 = safePt(lm, 55);
  const p61 = safePt(lm, 61);
  const p105 = safePt(lm, 105);
  const p129 = safePt(lm, 129);
  const p133 = safePt(lm, 133);
  const p145 = safePt(lm, 145);
  const p152 = safePt(lm, 152);
  const p159 = safePt(lm, 159);
  const p172 = safePt(lm, 172);
  const p234 = safePt(lm, 234);
  const p263 = safePt(lm, 263);
  const p284 = safePt(lm, 284);
  const p291 = safePt(lm, 291);
  const p334 = safePt(lm, 334);
  const p358 = safePt(lm, 358);
  const p362 = safePt(lm, 362);
  const p374 = safePt(lm, 374);
  const p386 = safePt(lm, 386);
  const p397 = safePt(lm, 397);
  const p454 = safePt(lm, 454);

  const leftIris = lm[468];
  const rightIris = lm[473];
  const leftPupil: NormalizedLandmark =
    leftIris && Number.isFinite(leftIris.x)
      ? leftIris
      : { x: (p33.x + p133.x) / 2, y: (p159.y + p145.y) / 2, z: 0, visibility: 1 };
  const rightPupil: NormalizedLandmark =
    rightIris && Number.isFinite(rightIris.x)
      ? rightIris
      : { x: (p362.x + p263.x) / 2, y: (p386.y + p374.y) / 2, z: 0, visibility: 1 };

  // Normalize by de-rotated interpupillary distance (IPD)
  const ipd = Math.max(10, distPx(leftPupil, rightPupil, w, h));
  const cheekWidth = Math.max(10, distPx(p234, p454, w, h));
  const jawWidth = Math.max(8, distPx(p172, p397, w, h));
  const foreheadWidth = Math.max(10, distPx(p54, p284, w, h));

  // Raise hairline extrapolation constant using de-rotated, IPD-normalized landmarks
  // so typical foreheads read ~33% instead of ~26% and small head tilt does not skew lines.
  const hairlineNormY = clamp(p10.y - (ipd * HAIRLINE_EXTRAPOLATION_IPD) / h, 0.02, 0.92);
  const upperForeheadY = hairlineNormY * h;
  const glabellaY = p9.y * h;
  const subnasaleY = p2.y * h;
  const mentonY = p152.y * h;

  const upperThird = Math.max(10, glabellaY - upperForeheadY);
  const midThird = Math.max(10, subnasaleY - glabellaY);
  const lowerThird = Math.max(10, mentonY - subnasaleY);
  const totalThirds = upperThird + midThird + lowerThird;

  const thirdUpperPct = Number(((upperThird / totalThirds) * 100).toFixed(1));
  const thirdMidPct = Number(((midThird / totalThirds) * 100).toFixed(1));
  const thirdLowerPct = Number((100 - thirdUpperPct - thirdMidPct).toFixed(1));

  // Overlay guides use de-rotated canonical landmarks anchored cleanly around nasal bridge pivot
  const landmarksOverlay: LandmarksOverlayGuides = {
    faceTopY: clamp(hairlineNormY, 0.02, 0.9),
    upperThirdY: clamp(p9.y, 0.06, 0.93),
    midThirdY: clamp(p2.y, 0.12, 0.95),
    lowerThirdY: clamp(p152.y, 0.18, 0.98),
    midlineX: clamp((leftPupil.x + rightPupil.x) / 2, 0.12, 0.88),
    leftFaceX: clamp(Math.min(p234.x, p454.x), 0.05, 0.45),
    rightFaceX: clamp(Math.max(p234.x, p454.x), 0.55, 0.95),
    upperPct: thirdUpperPct,
    midPct: thirdMidPct,
    lowerPct: thirdLowerPct,
    hairlineAdjustedByUser: false,
  };

  const upperFaceH = Math.max(10, distPx(p9, p0, w, h));
  const fwhr = cheekWidth / upperFaceH;
  const jawToCheek = jawWidth / Math.max(1, cheekWidth);
  const cheekboneToJawRatio = cheekWidth / Math.max(1, jawWidth);

  const philtrumH = Math.max(4, distPx(p2, p0, w, h));
  const chinH = Math.max(4, distPx(p17, p152, w, h));
  const chinToPhiltrum = chinH / philtrumH;
  const chinWidthRatio = distPx(safePt(lm, 148), safePt(lm, 377), w, h) / Math.max(1, jawWidth);

  // Canthal tilt computed from de-rotated landmarks with residual eye-axis roll correction
  const rollRad = Math.atan2((rightPupil.y - leftPupil.y) * h, Math.max(1, (rightPupil.x - leftPupil.x) * w));
  const leftTiltRaw = Math.atan2((p133.y - p33.y) * h, (p133.x - p33.x) * w);
  const rightTiltRaw = Math.atan2((p362.y - p263.y) * h, (p263.x - p362.x) * w);
  const leftCanthalDeg = clamp(((leftTiltRaw - rollRad) * 180) / Math.PI, -12, 14);
  const rightCanthalDeg = clamp(((rightTiltRaw + rollRad) * 180) / Math.PI, -12, 14);
  const avgCanthalDeg = clamp((leftCanthalDeg + rightCanthalDeg) / 2, -12, 14);
  const canthalLabel = classifyCanthalTilt(avgCanthalDeg);

  const leftEyeW = distPx(p33, p133, w, h);
  const rightEyeW = distPx(p362, p263, w, h);
  const avgEyeW = Math.max(4, (leftEyeW + rightEyeW) / 2);
  const leftEyeH = distPx(p159, p145, w, h);
  const rightEyeH = distPx(p386, p374, w, h);
  const eyeAspectRatio = ((leftEyeH / Math.max(1, leftEyeW)) + (rightEyeH / Math.max(1, rightEyeW))) / 2;
  const eyeSpacingRatio = distPx(p133, p362, w, h) / avgEyeW;

  const leftBrowHeight = distPx(p105, p159, w, h) / ipd;
  const rightBrowHeight = distPx(p334, p386, w, h) / ipd;
  const avgBrowHeight = (leftBrowHeight + rightBrowHeight) / 2;
  const browSlopeDeg =
    ((Math.atan2((p55.y - p46.y) * h, Math.max(1e-4, Math.abs(p55.x - p46.x)) * w * (p55.x >= p46.x ? 1 : -1)) * 180) /
      Math.PI -
      (rollRad * 180) / Math.PI) *
    -1;

  const mouthW = distPx(p61, p291, w, h);
  const noseW = distPx(p129, p358, w, h);
  const mouthToNose = mouthW / Math.max(1, noseW);
  const upperLipH = Math.max(2, distPx(p0, p13, w, h));
  const lowerLipH = Math.max(2, distPx(p14, p17, w, h));
  const lipRatio = lowerLipH / upperLipH;

  const pupilMidY = ((leftPupil.y + rightPupil.y) / 2) * h;
  const midfaceHeight = Math.max(10, p0.y * h - pupilMidY);
  const midfaceRatio = ipd / midfaceHeight;

  const midlineX = (leftPupil.x + rightPupil.x) / 2;
  const asymItems: Array<{ label: string; diffPct: number }> = [
    {
      label: 'Eye vertical alignment',
      diffPct: Number((((Math.abs(leftPupil.y - rightPupil.y) * h) / ipd) * 100).toFixed(1)),
    },
    {
      label: 'Eyebrow height balance',
      diffPct: Number((Math.abs(leftBrowHeight - rightBrowHeight) * 100).toFixed(1)),
    },
    {
      label: 'Cheekbone lateral balance',
      diffPct: Number((((Math.abs(Math.abs(p234.x - midlineX) - Math.abs(p454.x - midlineX)) * w) / cheekWidth) * 100).toFixed(1)),
    },
    {
      label: 'Jawline lateral balance',
      diffPct: Number((((Math.abs(Math.abs(p172.x - midlineX) - Math.abs(p397.x - midlineX)) * w) / jawWidth) * 100).toFixed(1)),
    },
    {
      label: 'Lip corner height balance',
      diffPct: Number((((Math.abs(p61.y - p291.y) * h) / ipd) * 100).toFixed(1)),
    },
  ].sort((a, b) => b.diffPct - a.diffPct);

  const avgAsym = asymItems.reduce((a, b) => a + b.diffPct, 0) / asymItems.length;
  const symmetryScore = clamp(Math.round(92 - avgAsym * 2.1), 40, 92);

  const skinStats = frontSkinStatsOverride ?? (frontCanvas ? sampleSkinStats(frontCanvas, rawLm) : { evennessScore: 68, rednessIndex: 12, underEyeContrast: 8 });

  // Side profile & optional 90-degree geometry
  const leftMetrics = leftQuality?.landmarks
    ? extractSideProfileGeometry(leftQuality.landmarks, leftCanvas?.width || 640, leftCanvas?.height || 480)
    : null;
  const rightMetrics = rightQuality?.landmarks
    ? extractSideProfileGeometry(rightQuality.landmarks, rightCanvas?.width || 640, rightCanvas?.height || 480)
    : null;
  const profile90Metrics = profile90Quality?.landmarks
    ? extractSideProfileGeometry(profile90Quality.landmarks, profile90Canvas?.width || 640, profile90Canvas?.height || 480)
    : null;

  const sideProfiles = [leftMetrics, rightMetrics].filter(Boolean) as Array<ReturnType<typeof extractSideProfileGeometry>>;
  const has45Sides = sideProfiles.length > 0;
  const has90Profile = Boolean(profile90Metrics);

  const gonialVal = profile90Metrics
    ? profile90Metrics.gonialAngle
    : has45Sides
    ? sideProfiles.reduce((s, m) => s + m.gonialAngle, 0) / sideProfiles.length
    : null;

  const submentalVal = profile90Metrics
    ? profile90Metrics.submentalAngle
    : has45Sides
    ? sideProfiles.reduce((s, m) => s + m.submentalAngle, 0) / sideProfiles.length
    : null;

  const eLineVal = profile90Metrics
    ? profile90Metrics.eLineOffset
    : has45Sides
    ? sideProfiles.reduce((s, m) => s + m.eLineOffset, 0) / sideProfiles.length
    : null;

  const chinProjVal = profile90Metrics
    ? profile90Metrics.chinProjectionPct
    : has45Sides
    ? sideProfiles.reduce((s, m) => s + m.chinProjectionPct, 0) / sideProfiles.length
    : null;

  const jawContourVal = has45Sides
    ? sideProfiles.reduce((s, m) => s + m.jawProjectionRatio, 0) / sideProfiles.length
    : profile90Metrics?.jawProjectionRatio ?? null;

  const profileSymDiff =
    leftMetrics && rightMetrics ? Number(Math.abs(leftMetrics.gonialAngle - rightMetrics.gonialAngle).toFixed(1)) : null;

  // Targeted confidence assignment: WARN lowers confidence ONLY on the affected metrics
  // A WARN-level expression specifically lowers confidence of mouth, lip, jaw, and eye metrics.
  const hasExprWarn =
    (frontQuality.expressionScore ?? 0) >= EXPRESSION_THRESHOLDS.PASS_MAX ||
    frontWarns.includes('expression');
  const symConf = downgradeConfidence('high', frontWarns, ['yaw', 'pose']);
  const propConf = downgradeConfidence('low', frontWarns, ['pose', 'occlusion']);
  const fwhrConf = downgradeConfidence('high', frontWarns, ['yaw', 'mouth']);
  const taperConf = downgradeConfidence('medium', frontWarns, ['yaw', 'pose']);
  const eyeConf = downgradeConfidence('high', frontWarns, ['blur', 'occlusion', 'pose', 'eyes', 'expression']);
  const browConf = downgradeConfidence('medium', frontWarns, ['occlusion', 'lighting', 'eyes', 'expression']);
  const mouthConf = downgradeConfidence('high', frontWarns, ['mouth', 'blur', 'expression']);
  const skinConf = downgradeConfidence('medium', frontWarns, ['lighting', 'blur']);
  const sideBaseConf: 'medium' | 'low' = has90Profile ? 'medium' : 'low';
  const gonialConf = downgradeConfidence(sideBaseConf, [...sideWarns, ...(hasExprWarn ? ['expression' as WarnDomain] : [])], [
    'yaw',
    'pose',
    'mouth',
    'expression',
  ]);

  const measurements: ScanMeasurement[] = [
    {
      key: 'thirds',
      label: `Facial thirds (${Math.round(thirdUpperPct)} / ${Math.round(thirdMidPct)} / ${Math.round(thirdLowerPct)}%)`,
      value: Number(thirdLowerPct.toFixed(1)),
      unit: '%',
      typicalRange: '30–37% each',
      ...rangeStatus(thirdLowerPct, METRIC_RANGES.THIRDS_PCT.min, METRIC_RANGES.THIRDS_PCT.max),
      confidence: propConf,
      approximate: propConf === 'low',
      explanation: 'Hairline is estimated above forehead landmark 10 (not a direct landmark).',
      angleSource: 'front',
    },
    {
      key: 'fwhr',
      label: 'Facial width-to-height (fWHR)',
      value: Number(fwhr.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.FWHR.min}–${METRIC_RANGES.FWHR.max}x`,
      ...rangeStatus(fwhr, METRIC_RANGES.FWHR.min, METRIC_RANGES.FWHR.max),
      confidence: fwhrConf,
      approximate: fwhrConf === 'low',
      explanation: 'Pose-corrected cheekbone width divided by upper face height (brow to upper lip).',
      angleSource: 'front',
    },
    {
      key: 'cheekboneProminence',
      label: 'Cheekbone-to-jaw taper',
      value: Number(cheekboneToJawRatio.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.CHEEK_TO_JAW.min}–${METRIC_RANGES.CHEEK_TO_JAW.max}x`,
      ...rangeStatus(cheekboneToJawRatio, METRIC_RANGES.CHEEK_TO_JAW.min, METRIC_RANGES.CHEEK_TO_JAW.max),
      confidence: taperConf,
      approximate: taperConf === 'low',
      explanation: 'Visible bizygomatic width relative to bigonial jaw width.',
      angleSource: 'front',
    },
    {
      key: 'jawCheek',
      label: 'Jaw-to-cheek width ratio',
      value: Number(jawToCheek.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.JAW_TO_CHEEK.min}–${METRIC_RANGES.JAW_TO_CHEEK.max}x`,
      ...rangeStatus(jawToCheek, METRIC_RANGES.JAW_TO_CHEEK.min, METRIC_RANGES.JAW_TO_CHEEK.max),
      confidence: taperConf,
      approximate: taperConf === 'low',
      explanation: 'Lower jaw width compared against cheekbone width.',
      angleSource: 'front',
    },
    {
      key: 'chinPhiltrum',
      label: 'Chin-to-philtrum ratio',
      value: Number(chinToPhiltrum.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.CHIN_TO_PHILTRUM.min}–${METRIC_RANGES.CHIN_TO_PHILTRUM.max}x`,
      ...rangeStatus(chinToPhiltrum, METRIC_RANGES.CHIN_TO_PHILTRUM.min, METRIC_RANGES.CHIN_TO_PHILTRUM.max),
      confidence: mouthConf,
      approximate: mouthConf === 'low',
      explanation: `Chin height relative to upper lip length (chin width ratio ${chinWidthRatio.toFixed(2)}x).`,
      angleSource: 'front',
    },
    {
      key: 'canthalTilt',
      label: `Canthal tilt (${canthalLabel} · L ${leftCanthalDeg.toFixed(1)}° / R ${rightCanthalDeg.toFixed(1)}°)`,
      value: Number(avgCanthalDeg.toFixed(1)),
      unit: '°',
      typicalRange: '0 to +6°',
      ...rangeStatus(avgCanthalDeg, -1.0, 8.0),
      confidence: eyeConf,
      approximate: eyeConf === 'low',
      explanation: `Pose-corrected inner-to-outer eye corner slope (${canthalLabel} classification).`,
      angleSource: 'front',
    },
    {
      key: 'eyeAspect',
      label: 'Eye aspect ratio',
      value: Number(eyeAspectRatio.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.EYE_ASPECT.min}–${METRIC_RANGES.EYE_ASPECT.max}x`,
      ...rangeStatus(eyeAspectRatio, METRIC_RANGES.EYE_ASPECT.min, METRIC_RANGES.EYE_ASPECT.max),
      confidence: eyeConf,
      approximate: eyeConf === 'low',
      explanation: 'Vertical palpebral opening height divided by eye width.',
      angleSource: 'front',
    },
    {
      key: 'eyeSpacing',
      label: 'Eye spacing ratio',
      value: Number(eyeSpacingRatio.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.EYE_SPACING.min}–${METRIC_RANGES.EYE_SPACING.max}x`,
      ...rangeStatus(eyeSpacingRatio, METRIC_RANGES.EYE_SPACING.min, METRIC_RANGES.EYE_SPACING.max),
      confidence: eyeConf,
      approximate: eyeConf === 'low',
      explanation: 'Intercanthal distance divided by average eye width (~1.0x balanced).',
      angleSource: 'front',
    },
    {
      key: 'browHeight',
      label: 'Brow height & tilt',
      value: Number(avgBrowHeight.toFixed(2)),
      unit: 'IPD',
      typicalRange: `${METRIC_RANGES.BROW_HEIGHT_IPD.min}–${METRIC_RANGES.BROW_HEIGHT_IPD.max}`,
      ...rangeStatus(avgBrowHeight, METRIC_RANGES.BROW_HEIGHT_IPD.min, METRIC_RANGES.BROW_HEIGHT_IPD.max),
      confidence: browConf,
      approximate: browConf === 'low',
      explanation: `Vertical distance from brow arch to upper lid (${browSlopeDeg.toFixed(1)}° brow slope).`,
      angleSource: 'front',
    },
    {
      key: 'mouthNose',
      label: 'Mouth-to-nose width',
      value: Number(mouthToNose.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.MOUTH_TO_NOSE.min}–${METRIC_RANGES.MOUTH_TO_NOSE.max}x`,
      ...rangeStatus(mouthToNose, METRIC_RANGES.MOUTH_TO_NOSE.min, METRIC_RANGES.MOUTH_TO_NOSE.max),
      confidence: mouthConf,
      approximate: mouthConf === 'low',
      explanation: 'Oral commissure width relative to alar nasal width.',
      angleSource: 'front',
    },
    {
      key: 'lipRatio',
      label: 'Lower-to-upper lip',
      value: Number(lipRatio.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.LIP_RATIO.min}–${METRIC_RANGES.LIP_RATIO.max}x`,
      ...rangeStatus(lipRatio, METRIC_RANGES.LIP_RATIO.min, METRIC_RANGES.LIP_RATIO.max),
      confidence: mouthConf,
      approximate: mouthConf === 'low',
      explanation: 'Vertical lower vermilion height compared with upper lip.',
      angleSource: 'front',
    },
    {
      key: 'midface',
      label: 'Midface ratio',
      value: Number(midfaceRatio.toFixed(2)),
      unit: 'x',
      typicalRange: `${METRIC_RANGES.MIDFACE_RATIO.min}–${METRIC_RANGES.MIDFACE_RATIO.max}x`,
      ...rangeStatus(midfaceRatio, METRIC_RANGES.MIDFACE_RATIO.min, METRIC_RANGES.MIDFACE_RATIO.max),
      confidence: fwhrConf,
      approximate: fwhrConf === 'low',
      explanation: 'IPD divided by pupil-midline-to-upper-lip height.',
      angleSource: 'front',
    },
    gonialVal !== null
      ? {
          key: 'gonialAngle',
          label: has90Profile ? 'Gonial angle (90° profile)' : 'Gonial angle (45° side estimate)',
          value: Number(gonialVal.toFixed(1)),
          unit: '°',
          typicalRange: `${METRIC_RANGES.GONIAL_ANGLE_DEG.min}–${METRIC_RANGES.GONIAL_ANGLE_DEG.max}°`,
          ...rangeStatus(gonialVal, METRIC_RANGES.GONIAL_ANGLE_DEG.min, METRIC_RANGES.GONIAL_ANGLE_DEG.max),
          confidence: gonialConf,
          approximate: gonialConf === 'low',
          angleSource: has90Profile ? 'profile_90' : 'sides_45',
          explanation: has90Profile
            ? 'Measured from true 90° profile ear-gonion-chin points; head angle still affects reading.'
            : 'Foreshortened estimate from 45° side views.',
        }
      : {
          key: 'gonialAngle',
          label: 'Gonial angle',
          value: null,
          displayValue: 'Not measurable',
          unit: '°',
          typicalRange: `${METRIC_RANGES.GONIAL_ANGLE_DEG.min}–${METRIC_RANGES.GONIAL_ANGLE_DEG.max}°`,
          status: 'watch',
          measurementStatus: 'not measurable',
          confidence: 'low',
          notMeasurableReason: 'Not measurable — add a side photo',
          angleSource: 'sides_45',
        },
    submentalVal !== null
      ? {
          key: 'submentalAngle',
          label: 'Submental (neck-chin) angle',
          value: Number(submentalVal.toFixed(1)),
          unit: '°',
          typicalRange: `${METRIC_RANGES.SUBMENTAL_ANGLE_DEG.min}–${METRIC_RANGES.SUBMENTAL_ANGLE_DEG.max}°`,
          ...rangeStatus(submentalVal, METRIC_RANGES.SUBMENTAL_ANGLE_DEG.min, METRIC_RANGES.SUBMENTAL_ANGLE_DEG.max),
          confidence: gonialConf,
          approximate: gonialConf === 'low',
          angleSource: has90Profile ? 'profile_90' : 'sides_45',
          explanation: 'Strongly affected by body fat percentage, fluid retention, and neck posture.',
        }
      : {
          key: 'submentalAngle',
          label: 'Submental (neck-chin) angle',
          value: null,
          displayValue: 'Not measurable',
          unit: '°',
          typicalRange: `${METRIC_RANGES.SUBMENTAL_ANGLE_DEG.min}–${METRIC_RANGES.SUBMENTAL_ANGLE_DEG.max}°`,
          status: 'watch',
          measurementStatus: 'not measurable',
          confidence: 'low',
          notMeasurableReason: 'Not measurable — add a side photo',
          angleSource: 'sides_45',
        },
    eLineVal !== null
      ? {
          key: 'eLine',
          label: 'Nose-lip-chin E-line offset',
          value: Number(eLineVal.toFixed(1)),
          unit: 'u',
          typicalRange: `${METRIC_RANGES.ELINE_OFFSET_U.min}–${METRIC_RANGES.ELINE_OFFSET_U.max} u`,
          ...rangeStatus(eLineVal, METRIC_RANGES.ELINE_OFFSET_U.min, METRIC_RANGES.ELINE_OFFSET_U.max),
          confidence: gonialConf,
          approximate: gonialConf === 'low',
          angleSource: has90Profile ? 'profile_90' : 'sides_45',
          explanation: 'Lip position relative to the profile line connecting nose tip and chin.',
        }
      : {
          key: 'eLine',
          label: 'Nose-lip-chin E-line',
          value: null,
          displayValue: 'Not measurable',
          unit: 'u',
          typicalRange: '1.0–4.5 u',
          status: 'watch',
          measurementStatus: 'not measurable',
          confidence: 'low',
          notMeasurableReason: 'Not measurable — add a side photo',
          angleSource: 'sides_45',
        },
  ];

  if (profileSymDiff !== null) {
    measurements.push({
      key: 'profileSym',
      label: 'Left/Right jaw angle difference',
      value: profileSymDiff,
      unit: '°',
      typicalRange: '< 6°',
      status: profileSymDiff <= 6 ? 'balanced' : 'watch',
      measurementStatus: profileSymDiff <= 6 ? 'in range' : 'above',
      confidence: gonialConf,
      approximate: gonialConf === 'low',
      angleSource: 'sides_45',
      explanation: 'Difference between your left and right 45° jawline contour angles.',
    });
  }

  // Calibrated 0..100 Sub-scores
  const thirdDev =
    Math.abs(thirdUpperPct - METRIC_RANGES.THIRDS_PCT.ideal) +
    Math.abs(thirdMidPct - METRIC_RANGES.THIRDS_PCT.ideal) +
    Math.abs(thirdLowerPct - METRIC_RANGES.THIRDS_PCT.ideal);
  const proportionsScore = clamp(
    Math.round(86 - thirdDev * 1.15 - Math.abs(midfaceRatio - 1.0) * 34),
    42,
    91
  );

  const eyeScore = clamp(
    Math.round(76 + clamp(avgCanthalDeg, -3, 6) * 1.5 - Math.abs(eyeSpacingRatio - 1.0) * 35),
    44,
    91
  );

  const browRidgeScore = clamp(
    Math.round(78 - Math.abs(avgBrowHeight - 0.25) * 90 + clamp(browSlopeDeg, -4, 6)),
    44,
    90
  );

  const cheekboneScore = clamp(
    Math.round(72 + (cheekboneToJawRatio >= 1.12 && cheekboneToJawRatio <= 1.3 ? 13 : 3) - Math.abs(fwhr - 1.9) * 18),
    44,
    90
  );

  const jawSideBonus =
    (gonialVal !== null && gonialVal >= METRIC_RANGES.GONIAL_ANGLE_DEG.min && gonialVal <= METRIC_RANGES.GONIAL_ANGLE_DEG.max ? 5 : 0) +
    (jawContourVal !== null && jawContourVal >= 0.72 ? 4 : 0) +
    (chinProjVal !== null ? clamp(Math.round((chinProjVal - 55) * 0.15), -4, 5) : 0);

  const jawNeckScore = clamp(
    Math.round(67 + (jawToCheek >= 0.76 && jawToCheek <= 0.9 ? 10 : 2) + jawSideBonus),
    42,
    90
  );

  const leannessProxy = clamp(
    Math.round(
      68 +
        (cheekboneToJawRatio >= 1.12 && cheekboneToJawRatio <= 1.32 ? 10 : 2) +
        (submentalVal !== null && submentalVal <= 115 ? 6 : 0)
    ),
    42,
    89
  );

  const inRangeCount = measurements.filter((m) => m.value !== null && m.measurementStatus === 'in range').length;
  const totalMeasurable = Math.max(1, measurements.filter((m) => m.value !== null).length);
  const harmonyScore = clamp(Math.round(52 + (inRangeCount / totalMeasurable) * 38), 44, 92);

  const rawSubScores = {
    symmetry: symmetryScore,
    proportions: proportionsScore,
    jawNeck: jawNeckScore,
    eyeArea: eyeScore,
    browRidge: browRidgeScore,
    cheekbones: cheekboneScore,
    skin: skinStats.evennessScore,
    leanness: leannessProxy,
    harmony: harmonyScore,
  };

  // Compute overall 0..1 scanConfidence from pose, expressionScore, lighting, sharpness, and angles captured
  const capturedCount = 1 + (leftQuality ? 1 : 0) + (rightQuality ? 1 : 0) + (profile90Quality ? 1 : 0);
  const scanConfidence = computeScanConfidenceFactor({
    frontQuality,
    anglesCount: capturedCount,
  });

  // Shrinkage toward calibrated population mean: final = mean + conf * (raw - mean)
  // Expression-sensitive pillars (mouth/jaw/eye) receive an additional shrinkage multiplier on WARN expressions.
  const subMean = CONFIDENCE_SHRINKAGE_CONSTANTS.POPULATION_SUBSCORE_MEAN;
  const warnMetricMult = hasExprWarn ? CONFIDENCE_SHRINKAGE_CONSTANTS.WARN_EXPRESSION_METRIC_MULTIPLIER : 1;
  const shrinkSub = (rawVal: number, exprSensitive = false) => {
    const c = clamp(scanConfidence * (exprSensitive ? warnMetricMult : 1), 0.15, 1);
    return Math.round(clamp(subMean + c * (rawVal - subMean), 35, 95));
  };

  const subScores = {
    symmetry: shrinkSub(rawSubScores.symmetry, false),
    proportions: shrinkSub(rawSubScores.proportions, false),
    jawNeck: shrinkSub(rawSubScores.jawNeck, true),
    eyeArea: shrinkSub(rawSubScores.eyeArea, true),
    browRidge: shrinkSub(rawSubScores.browRidge, true),
    cheekbones: shrinkSub(rawSubScores.cheekbones, false),
    skin: shrinkSub(rawSubScores.skin, false),
    leanness: shrinkSub(rawSubScores.leanness, true),
    harmony: shrinkSub(rawSubScores.harmony, hasExprWarn),
  };

  // Confidence-weighted overall PSL estimate with shrinkage toward calibrated population mean.
  // Note: expression/eyes/mouth WARN downgrades are excluded from weight allocation so an expression
  // cannot boost rawWeightedAvg by downweighting a lower-scoring pillar; shrinkage handles overall uncertainty.
  const frontNonExprWarns = frontWarns.filter(
    (d) => d !== 'expression' && d !== 'eyes' && d !== 'mouth'
  );
  const sideNonExprWarns = sideWarns.filter(
    (d) => d !== 'expression' && d !== 'eyes' && d !== 'mouth'
  );
  const wSym = PSL_SUBSCORE_WEIGHTS.symmetry * CONFIDENCE_WEIGHTS[downgradeConfidence('high', frontNonExprWarns, ['yaw', 'pose'])];
  const wProp = PSL_SUBSCORE_WEIGHTS.proportions * CONFIDENCE_WEIGHTS[downgradeConfidence('low', frontNonExprWarns, ['pose', 'occlusion'])];
  const wEye = PSL_SUBSCORE_WEIGHTS.eyeArea * CONFIDENCE_WEIGHTS[downgradeConfidence('high', frontNonExprWarns, ['blur', 'occlusion', 'pose'])];
  const wJaw = PSL_SUBSCORE_WEIGHTS.jawNeck * (has45Sides || has90Profile ? CONFIDENCE_WEIGHTS[downgradeConfidence(sideBaseConf, sideNonExprWarns, ['yaw', 'pose'])] : 0.35);
  const wCheek = PSL_SUBSCORE_WEIGHTS.cheekbones * CONFIDENCE_WEIGHTS[downgradeConfidence('medium', frontNonExprWarns, ['yaw', 'pose'])];
  const wSkin = PSL_SUBSCORE_WEIGHTS.skin * CONFIDENCE_WEIGHTS[skinConf];
  const wLean = PSL_SUBSCORE_WEIGHTS.leanness * CONFIDENCE_WEIGHTS[has45Sides ? downgradeConfidence(sideBaseConf, sideNonExprWarns, ['yaw', 'pose']) : taperConf];

  const totalW = Math.max(0.01, wSym + wProp + wEye + wJaw + wCheek + wSkin + wLean);
  const rawWeightedAvg =
    (rawSubScores.symmetry * wSym +
      rawSubScores.proportions * wProp +
      rawSubScores.eyeArea * wEye +
      rawSubScores.jawNeck * wJaw +
      rawSubScores.cheekbones * wCheek +
      rawSubScores.skin * wSkin +
      rawSubScores.leanness * wLean) /
    totalW;

  const rawPslEstimate = calculateCalibratedPslScore(rawWeightedAvg);
  const popPslMean = CONFIDENCE_SHRINKAGE_CONSTANTS.POPULATION_PSL_MEAN;
  const shrunkPsl = popPslMean + scanConfidence * (rawPslEstimate - popPslMean);
  const guardedPsl = hasExprWarn ? Math.min(shrunkPsl, rawPslEstimate) : shrunkPsl;
  const pslEstimate = Number(clamp(guardedPsl, 1.5, 8.0).toFixed(1));

  // Plausibility check against documented human physiological ranges
  const implausibleMetrics: string[] = [];
  const checkPlausible = (val: number | null, r: { label: string; min: number; max: number }) => {
    if (val === null || !Number.isFinite(val)) return;
    if (val < r.min || val > r.max) implausibleMetrics.push(r.label);
  };
  checkPlausible(thirdUpperPct, HUMAN_METRIC_PLAUSIBLE_RANGES.thirdUpperPct);
  checkPlausible(thirdMidPct, HUMAN_METRIC_PLAUSIBLE_RANGES.thirdMidPct);
  checkPlausible(thirdLowerPct, HUMAN_METRIC_PLAUSIBLE_RANGES.thirdLowerPct);
  checkPlausible(fwhr, HUMAN_METRIC_PLAUSIBLE_RANGES.fwhr);
  checkPlausible(jawToCheek, HUMAN_METRIC_PLAUSIBLE_RANGES.jawToCheek);
  checkPlausible(chinToPhiltrum, HUMAN_METRIC_PLAUSIBLE_RANGES.chinToPhiltrum);
  checkPlausible(eyeAspectRatio, HUMAN_METRIC_PLAUSIBLE_RANGES.eyeAspect);
  checkPlausible(eyeSpacingRatio, HUMAN_METRIC_PLAUSIBLE_RANGES.eyeSpacing);
  checkPlausible(mouthToNose, HUMAN_METRIC_PLAUSIBLE_RANGES.mouthToNose);
  checkPlausible(lipRatio, HUMAN_METRIC_PLAUSIBLE_RANGES.lipRatio);
  checkPlausible(midfaceRatio, HUMAN_METRIC_PLAUSIBLE_RANGES.midfaceRatio);
  checkPlausible(gonialVal, HUMAN_METRIC_PLAUSIBLE_RANGES.gonialAngle);

  const isImplausible = implausibleMetrics.length >= PLAUSIBILITY_OUTLIER_THRESHOLD;
  const plausibilityWarning = isImplausible
    ? 'This scan looks unusual — retake with a neutral face, camera at eye level'
    : undefined;

  const neutralTier = getPslTierMeta(pslEstimate, true);
  const faceShape = classifyFaceShape(cheekWidth, jawWidth, foreheadWidth, totalThirds);

  const jawConf: 'high' | 'medium' | 'low' = has45Sides || has90Profile ? gonialConf : 'low';
  const harmonyConf: 'high' | 'medium' | 'low' = downgradeConfidence('medium', frontWarns, ['yaw', 'pose', 'expression']);

  const extendedPillars: ExtendedReportPillar[] = [
    {
      key: 'symmetry',
      title: 'Facial Symmetry',
      score: subScores.symmetry,
      displayScore: `${subScores.symmetry}/100`,
      descriptor: asymItems[0]
        ? `Peak delta: ${asymItems[0].label} (${asymItems[0].diffPct}%)`
        : 'Bilateral eye, cheekbone & jaw alignment',
      confidence: symConf,
      approximate: symConf === 'low',
      evidence: 'Proven',
      why: 'Every face has natural asymmetry; head roll and side lighting shift measurements strongly.',
    },
    {
      key: 'eyeArea',
      title: 'Eye Area & Canthal Tilt',
      score: subScores.eyeArea,
      displayScore: `${subScores.eyeArea}/100`,
      descriptor: `${canthalLabel} tilt (${avgCanthalDeg >= 0 ? '+' : ''}${avgCanthalDeg.toFixed(1)}°) · Eye spacing ${eyeSpacingRatio.toFixed(2)}x`,
      confidence: eyeConf,
      approximate: eyeConf === 'low',
      evidence: 'Likely works',
      why: 'Rested sleep, SPF around the orbital bone, and clean brow grooming sharpen contrast; squinting does not alter bone.',
    },
    {
      key: 'jawProjection',
      title: 'Jawline Projection & Lower Third',
      score: has45Sides || has90Profile ? subScores.jawNeck : null,
      displayScore: has45Sides || has90Profile ? `${subScores.jawNeck}/100` : 'Not measurable',
      descriptor:
        gonialVal !== null
          ? `Gonial ${gonialVal.toFixed(1)}° · Submental ${submentalVal?.toFixed(0)}° (affected by body fat)`
          : 'Not measurable — add a side photo',
      confidence: jawConf,
      approximate: jawConf === 'low',
      evidence: 'Proven',
      why: 'Overall body fat reduction, hydration consistency, and upright neck posture strongly affect lower-third definition.',
      notMeasurableReason: has45Sides || has90Profile ? undefined : 'Not measurable — add a side photo',
    },
    {
      key: 'midface',
      title: 'Midface Ratio',
      score: shrinkSub(Math.round(clamp(88 - Math.abs(midfaceRatio - 1.0) * 65, 42, 92)), false),
      displayScore: `${shrinkSub(Math.round(clamp(88 - Math.abs(midfaceRatio - 1.0) * 65, 42, 92)), false)}/100`,
      descriptor: `${midfaceRatio.toFixed(2)}x IPD-to-upper-lip height (typical 0.92–1.08x)`,
      confidence: fwhrConf,
      approximate: fwhrConf === 'low',
      evidence: 'Not proven',
      why: 'Midface height is skeletal; close selfie cameras exaggerate it, so shoot at arm’s length.',
    },
    {
      key: 'thirds',
      title: 'Facial Thirds Balance',
      score: subScores.proportions,
      displayScore: `${subScores.proportions}/100`,
      descriptor: `Upper ${Math.round(thirdUpperPct)}% · Mid ${Math.round(thirdMidPct)}% · Lower ${Math.round(thirdLowerPct)}%`,
      confidence: propConf,
      approximate: true,
      evidence: 'Likely works',
      why: 'Hairline is estimated from forehead landmarks (low confidence). Haircut volume shifts upper-third balance fast.',
    },
    {
      key: 'boneStructure',
      title: 'Visible Bone Structure',
      score: subScores.cheekbones,
      displayScore: `${subScores.cheekbones}/100`,
      descriptor: `Describes what the camera sees (taper ${cheekboneToJawRatio.toFixed(2)}x), not bone density`,
      confidence: taperConf,
      approximate: taperConf === 'low',
      evidence: 'Proven',
      why: 'Cheekbone and jaw contour visibility improves primarily with body recomposition and evening debloating.',
    },
    {
      key: 'harmony',
      title: 'Facial Harmony',
      score: subScores.harmony,
      displayScore: `${subScores.harmony}/100`,
      descriptor: `${inRangeCount}/${totalMeasurable} measurable proportions sit within typical adult ranges`,
      confidence: harmonyConf,
      approximate: harmonyConf === 'low',
      evidence: 'Proven',
      why: 'Overall visual balance reflects how all regions sit together alongside skin clarity, grooming, and posture.',
    },
    {
      key: 'noseLips',
      title: 'Nose & Lip Proportions',
      score: shrinkSub(Math.round(clamp(85 - Math.abs(mouthToNose - 1.5) * 35 - Math.abs(lipRatio - 1.5) * 18, 45, 92)), true),
      displayScore: `${shrinkSub(Math.round(clamp(85 - Math.abs(mouthToNose - 1.5) * 35 - Math.abs(lipRatio - 1.5) * 18, 45, 92)), true)}/100`,
      descriptor: `Mouth/nose ${mouthToNose.toFixed(2)}x · Lip ratio ${lipRatio.toFixed(2)}x`,
      confidence: mouthConf,
      approximate: mouthConf === 'low',
      evidence: 'Not proven',
      why: 'Soft-tissue lip hydration and wide-angle camera distance affect close-up width ratios.',
    },
    {
      key: 'skin',
      title: 'Skin Texture & Tone',
      score: subScores.skin,
      displayScore: `${subScores.skin}/100`,
      descriptor: `Evenness ${subScores.skin}/100 · Redness index ${skinStats.rednessIndex} · Under-eye delta ${skinStats.underEyeContrast}`,
      confidence: skinConf,
      approximate: skinConf === 'low',
      evidence: 'Proven',
      why: 'Gentle cleanser, moisturizer, daily SPF 30–50, and steady 7.5–8h sleep deliver reliable texture clarity.',
    },
  ];

  const featureChips: string[] = [];
  if (symmetryScore >= 75 && symConf !== 'low') featureChips.push('Symmetrical alignment');
  if (jawNeckScore >= 74 && (has45Sides || has90Profile) && jawConf !== 'low') featureChips.push('Defined jaw contour');
  if (Math.abs(thirdMidPct - 33.3) <= 3.5 && Math.abs(thirdLowerPct - 33.3) <= 3.5 && proportionsScore >= 72) {
    featureChips.push('Balanced facial thirds');
  }
  if (avgCanthalDeg >= CANTHAL_TILT_THRESHOLDS.POSITIVE_MIN_DEG && eyeConf !== 'low') {
    featureChips.push('Positive canthal tilt');
  }
  if (skinStats.evennessScore >= 75 && skinConf !== 'low') featureChips.push('Even skin tone');
  if (eyeSpacingRatio >= 0.92 && eyeSpacingRatio <= 1.08 && eyeConf !== 'low') {
    featureChips.push('Balanced eye spacing');
  }

  const domains = [
    { key: 'symmetry', area: 'Facial Symmetry', score: subScores.symmetry, detail: `Mirrored landmark balance scored ${subScores.symmetry}/100.` },
    { key: 'proportions', area: 'Midface & Proportions', score: subScores.proportions, detail: `Vertical thirds (${Math.round(thirdUpperPct)}/${Math.round(thirdMidPct)}/${Math.round(thirdLowerPct)}%) and midface ratio scored ${subScores.proportions}/100.` },
    ...(has45Sides || has90Profile
      ? [{ key: 'jawNeck', area: 'Jawline & Neck Frame', score: subScores.jawNeck, detail: `Multi-angle jaw contour scored ${subScores.jawNeck}/100.` }]
      : []),
    { key: 'eyeArea', area: 'Eye Area Framing', score: subScores.eyeArea, detail: `${canthalLabel} canthal alignment (${avgCanthalDeg.toFixed(1)}°) scored ${subScores.eyeArea}/100.` },
    { key: 'cheekbones', area: 'Cheekbones & Taper', score: subScores.cheekbones, detail: `Malar-to-jaw taper (${cheekboneToJawRatio.toFixed(2)}x) scored ${subScores.cheekbones}/100.` },
    { key: 'skin', area: 'Skin Texture & Tone', score: subScores.skin, detail: `Sampled cheek & forehead evenness scored ${subScores.skin}/100.` },
    { key: 'leanness', area: 'Lower-Third Definition', score: subScores.leanness, detail: `Facial leanness contour proxy scored ${subScores.leanness}/100.` },
  ].sort((a, b) => b.score - a.score);

  const strengths = domains.slice(0, 3).map((d) => ({
    area: d.area,
    detail: d.detail,
  }));

  const focusMap: Record<string, ScanFocusArea> = {
    skin: {
      area: 'Skin Clarity & Texture',
      detail: `Measured luminance evenness and redness index scored ${subScores.skin}/100.`,
      actions: [
        { label: 'Lock gentle cleanser, moisturizer & daily SPF 30+', impact: 'High', protocolId: 'skin-spf-daily' },
        { label: 'Track hydration & breakouts in Skin Lab for 4 weeks', impact: 'Medium', protocolId: 'skin-journal-log' },
        { label: 'Anchor 7.5–8h sleep and shoot under even daylight', impact: 'Medium', protocolId: 'sleep-fixed-anchor' },
      ],
      medicalNote: 'Acne scarring or persistent redness can be treated clinically by a dermatologist.',
    },
    jawNeck: {
      area: 'Jawline & Cervical Frame',
      detail: `Jawline & submental contour scored ${subScores.jawNeck}/100.`,
      actions: [
        { label: 'Daily chin tucks & eye-level screen posture', impact: 'High', protocolId: 'posture-chin-tucks' },
        { label: 'Sustainable lean body composition & high protein intake', impact: 'High', protocolId: 'hydration-protein-anchor' },
        { label: 'Safe progressive neck & upper-trap training', impact: 'Medium', protocolId: 'training-neck-traps' },
      ],
      medicalNote: 'Adult jawbone structure does not change from chewing gadgets or mewing; skeletal change requires orthodontics or surgery.',
    },
    leanness: {
      area: 'Lower-Third Definition & Debloat',
      detail: `Contour taper scored ${subScores.leanness}/100. Body fat and evening sodium strongly affect definition.`,
      actions: [
        { label: 'Reduce late-night sodium/alcohol and keep steady water', impact: 'High', protocolId: 'hydration-sodium-sugar' },
        { label: 'Hit daily steps & 3x weekly resistance training', impact: 'High', protocolId: 'training-zone2-walk' },
        { label: 'Protect a consistent 7.5–8h sleep window', impact: 'Medium', protocolId: 'sleep-fixed-anchor' },
      ],
      medicalNote: 'Facial fat cannot be spot-reduced; overall nutrition, hydration, and fitness drive lower-third sharpness.',
    },
    cheekbones: {
      area: 'Cheekbone Contour & Debloat',
      detail: `Cheek-to-jaw taper scored ${subScores.cheekbones}/100.`,
      actions: [
        { label: 'Cut late-night sodium and eat potassium-rich foods', impact: 'High', protocolId: 'hydration-sodium-sugar' },
        { label: 'Gradual systemic fat loss + structured lifting', impact: 'High', protocolId: 'training-full-body' },
      ],
      medicalNote: 'Zygomatic bone shape is genetic; lowering fluid retention and body fat reveals natural contour safely.',
    },
    eyeArea: {
      area: 'Eye Area & Rested Contrast',
      detail: `Eye spacing and orbital framing scored ${subScores.eyeArea}/100.`,
      actions: [
        { label: 'Tidy stray brow hairs without over-thinning', impact: 'High', protocolId: 'hair-brow-cleanup' },
        { label: 'Consistent 7.5–8h sleep + daily non-stinging orbital SPF', impact: 'High', protocolId: 'sleep-wind-down' },
      ],
      medicalNote: 'Orbital bone and canthal tilt are skeletal and cannot be changed with squinting exercises.',
    },
    proportions: {
      area: 'Upper / Lower Visual Balance',
      detail: `Vertical balance scored ${subScores.proportions}/100 (${faceShape} shape).`,
      actions: [
        { label: `Select a haircut matched to your ${faceShape} face shape`, impact: 'High', protocolId: 'hair-barber-card' },
        { label: 'Capture rescan photos at arm’s length at eye height', impact: 'Medium', protocolId: 'presence-photo-practice' },
      ],
      medicalNote: 'Skeletal proportions are fixed in adulthood; hair geometry, grooming, and camera distance shift perceived balance immediately.',
    },
    symmetry: {
      area: 'Posture & Alignment Habits',
      detail: `Largest bilateral variance: ${asymItems[0]?.label ?? 'subtle lateral offset'} (${asymItems[0]?.diffPct ?? 2}%).`,
      actions: [
        { label: 'Check head roll in camera & alternate sleep/chew sides', impact: 'Medium', protocolId: 'posture-symmetry-habits' },
        { label: 'Upper-back mobility & neck alignment drills', impact: 'Medium', protocolId: 'posture-thoracic-mob' },
      ],
      medicalNote: 'Every human face has mild natural asymmetry; uneven lighting and slight head tilt exaggerate small differences.',
    },
  };

  const focusDomains = domains.slice(-3).reverse();
  const focusAreas = focusDomains.map((d) => focusMap[d.key]);

  const oneLineFixLookup: Record<string, { fix: string; protocolId: string }> = {
    skin: { fix: 'Lock gentle AM/PM cleanser, moisturizer, and daily SPF 30+.', protocolId: 'skin-spf-daily' },
    jawNeck: { fix: 'Practice daily chin tucks, upright posture, and safe neck/trap work.', protocolId: 'posture-chin-tucks' },
    leanness: { fix: 'Trim late-night sodium/alcohol and hit 8k+ steps with resistance training.', protocolId: 'hydration-sodium-sugar' },
    cheekbones: { fix: 'Stabilize hydration and potassium intake to minimize morning puffiness.', protocolId: 'hydration-water-target' },
    eyeArea: { fix: 'Clean stray brow hairs naturally and protect 7.5–8h sleep.', protocolId: 'hair-brow-cleanup' },
    proportions: { fix: `Match hair top volume and side taper to your ${faceShape} shape.`, protocolId: 'hair-barber-card' },
    symmetry: { fix: 'Keep shoulders level and chew evenly without aggressive gadgets.', protocolId: 'posture-symmetry-habits' },
  };

  const oneLineFixes = focusDomains.map((d) => ({
    area: focusMap[d.key].area,
    fix: oneLineFixLookup[d.key]?.fix ?? 'Stay consistent on core daily habits.',
    protocolId: oneLineFixLookup[d.key]?.protocolId,
  }));

  const anglePhrase =
    leftQuality && rightQuality
      ? '3-angle'
      : leftQuality || rightQuality
      ? '2-angle'
      : 'front-only';

  const verdictText = `Your strongest measured pillars today are ${strengths[0].area} and ${strengths[1].area} under ${anglePhrase} analysis. Your highest-impact realistic levers right now focus on ${focusAreas[0].area} and ${focusAreas[1].area} through consistent skincare, lean body composition, hairstyle framing, and upright neck posture. Adult bone structure does not change from exercises or chewing devices; skeletal changes require a licensed medical or orthodontic specialist.`;

  const anglesCaptured: FaceScanResult['anglesCaptured'] = ['front'];
  if (leftCanvas || leftQuality) anglesCaptured.push('left');
  if (rightCanvas || rightQuality) anglesCaptured.push('right');
  if (profile90Canvas || profile90Quality) anglesCaptured.push('profile90');
  if (hasSmile) anglesCaptured.push('smile');

  const qualityScore = clamp(
    Math.round(
      (frontQuality.sharpness > 5 ? 90 : 75) -
        Math.abs(frontQuality.rollDeg) * 1.1 -
        Math.abs(frontQuality.yawDeg) * 0.9 -
        frontWarns.length * 4
    ),
    55,
    98
  );

  const lightingScore = clamp(
    Math.round(100 - Math.abs(frontQuality.brightness - 130) * 0.45 - frontQuality.sideLightDiff * 0.35),
    42,
    98
  );

  return {
    date: toLocalDateKey(),
    timestamp: Date.now(),
    anglesCaptured,
    qualityScore,
    lightingScore,
    scanConfidence,
    expressionScore: frontQuality.expressionScore ?? 0,
    isImplausible,
    plausibilityWarning,
    implausibleMetrics,
    pslEstimate,
    tier: neutralTier.id,
    plainLabel: neutralTier.plainLabel,
    faceShape,
    subScores,
    measurements,
    asymmetries: asymItems,
    strengths,
    focusAreas,
    oneLineFixes,
    extendedPillars,
    featureChips,
    verdictText,
    landmarksOverlay,
    savedFrontSnapshot: toSnapshot(frontQuality, skinStats),
    savedLeftSnapshot: leftQuality ? toSnapshot(leftQuality) : undefined,
    savedRightSnapshot: rightQuality ? toSnapshot(rightQuality) : undefined,
    frontThumbnail: preserveFrontThumbnail ?? (saveThumbnails && frontCanvas ? createSmallThumbnail(frontCanvas) : undefined),
    leftThumbnail: preserveLeftThumbnail ?? (saveThumbnails && leftCanvas ? createSmallThumbnail(leftCanvas) : undefined),
    rightThumbnail: preserveRightThumbnail ?? (saveThumbnails && rightCanvas ? createSmallThumbnail(rightCanvas) : undefined),
    profile90Thumbnail: saveThumbnails && profile90Canvas ? createSmallThumbnail(profile90Canvas) : undefined,
  };
}

/** Rebuild an existing Front-only scan when user adds Left/Right side photos later */
export function snapshotToQualityResult(snap: SavedAngleSnapshot): QualityCheckResult {
  return {
    level: snap.qualityLevel,
    passed: true,
    primaryInstruction: 'Restored capture',
    poseProgress: 1,
    reasons: [],
    warnings: [],
    warnDomains: snap.warnDomains,
    hint: 'Restored capture',
    brightness: snap.brightness,
    sideLightDiff: snap.sideLightDiff,
    sharpness: snap.sharpness,
    faceWidthFrac: snap.faceWidthFrac,
    faceScale: snap.faceScale,
    rollDeg: snap.rollDeg,
    yawDeg: snap.yawDeg,
    pitchDeg: snap.pitchDeg,
    expressionScore: snap.expressionScore ?? 0,
    expressionGate: (snap.expressionScore ?? 0) >= EXPRESSION_THRESHOLDS.PASS_MAX ? 'WARN' : 'PASS',
    expressionCue: snap.expressionCue ?? null,
    landmarks: snap.landmarks.map((p) => ({ ...p, visibility: 1 })),
  };
}
