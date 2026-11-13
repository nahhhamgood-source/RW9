import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FaceScanResult, FaceShape, ScanFocusArea, ScanMeasurement } from '../types';
import { toLocalDateKey } from './date';

export type ScannerEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EngineState {
  status: ScannerEngineStatus;
  error: string | null;
  landmarker: FaceLandmarker | null;
}

const engineState: EngineState = {
  status: 'idle',
  error: null,
  landmarker: null,
};

let loadPromise: Promise<FaceLandmarker> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

export function subscribeScannerStatus(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getScannerState(): { status: ScannerEngineStatus; error: string | null } {
  return { status: engineState.status, error: engineState.error };
}

export async function initFaceLandmarker(forceRetry = false): Promise<FaceLandmarker> {
  if (engineState.landmarker && !forceRetry) return engineState.landmarker;
  if (loadPromise && !forceRetry) return loadPromise;

  engineState.status = 'loading';
  engineState.error = null;
  notify();

  loadPromise = (async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Model initialization timed out after 20s.')), 20000)
    );

    const runInit = async () => {
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/mediapipe/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      return landmarker;
    };

    try {
      const lm = await Promise.race([runInit(), timeoutPromise]);
      engineState.landmarker = lm;
      engineState.status = 'ready';
      engineState.error = null;
      notify();
      return lm;
    } catch (err) {
      loadPromise = null;
      engineState.landmarker = null;
      engineState.status = 'error';
      engineState.error = err instanceof Error ? err.message : 'Failed to load local Face Landmarker.';
      notify();
      throw err;
    }
  })();

  return loadPromise;
}

export interface QualityCheckResult {
  passed: boolean;
  reasons: string[];
  hint: string;
  brightness: number; // 0..255
  sharpness: number;
  faceScale: number; // fraction of frame height
  rollDeg: number;
  yawDeg: number;
  pitchDeg: number;
  landmarks: NormalizedLandmark[] | null;
}

const FALLBACK_PT: NormalizedLandmark = { x: 0.5, y: 0.5, z: 0, visibility: 0 };

export interface PslTierMeta {
  id: 'Very Low' | 'LTN' | 'True Normie' | 'HTN' | 'Chadlite' | 'Chad / Elite';
  rangeLabel: string;
  title: string;
  subtitle: string;
}

export const PSL_TIERS: PslTierMeta[] = [
  {
    id: 'Very Low',
    rangeLabel: 'PSL 1–2',
    title: 'Very Low',
    subtitle: 'Poor bone structure, severe asymmetry',
  },
  {
    id: 'LTN',
    rangeLabel: 'PSL 3–4',
    title: 'LTN - Low Tier Normie',
    subtitle: 'Weak jawline, facial fat',
  },
  {
    id: 'True Normie',
    rangeLabel: 'PSL 5',
    title: 'True Normie',
    subtitle: 'Average, balanced features',
  },
  {
    id: 'HTN',
    rangeLabel: 'PSL 6',
    title: 'HTN - High-Tier Normie',
    subtitle: 'Good looking, strong aesthetics',
  },
  {
    id: 'Chadlite',
    rangeLabel: 'PSL 7',
    title: 'Chadlite',
    subtitle: 'Very attractive, strong bone structure',
  },
  {
    id: 'Chad / Elite',
    rangeLabel: 'PSL 8+',
    title: 'Chad / Elite',
    subtitle: 'Top 1%, model tier, perfect symmetry',
  },
];

export function getPslTierInfo(score: number): PslTierMeta {
  if (score < 3.0) return PSL_TIERS[0];
  if (score < 4.5) return PSL_TIERS[1];
  if (score < 5.5) return PSL_TIERS[2];
  if (score < 6.5) return PSL_TIERS[3];
  if (score < 7.5) return PSL_TIERS[4];
  return PSL_TIERS[5];
}

function safePt(landmarks: NormalizedLandmark[], idx: number): NormalizedLandmark {
  const pt = landmarks[idx];
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return FALLBACK_PT;
  return pt;
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark, w: number, h: number): number {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.hypot(dx, dy);
}

function computeImageQualityMetrics(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Sample central 60% of frame for fast luminance + Laplacian edge sharpness
  const sx = Math.floor(width * 0.2);
  const sy = Math.floor(height * 0.15);
  const sw = Math.max(40, Math.floor(width * 0.6));
  const sh = Math.max(40, Math.floor(height * 0.7));
  const img = ctx.getImageData(sx, sy, sw, sh).data;

  const step = 2;
  let lumSum = 0;
  let lumCount = 0;
  const gray = new Float32Array(sw * sh);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      const l = 0.299 * img[idx] + 0.587 * img[idx + 1] + 0.114 * img[idx + 2];
      gray[y * sw + x] = l;
      if (x % step === 0 && y % step === 0) {
        lumSum += l;
        lumCount++;
      }
    }
  }

  let lapSum = 0;
  let lapCount = 0;
  for (let y = 1; y < sh - 1; y += 2) {
    for (let x = 1; x < sw - 1; x += 2) {
      const c = gray[y * sw + x];
      const lap =
        Math.abs(4 * c - gray[(y - 1) * sw + x] - gray[(y + 1) * sw + x] - gray[y * sw + (x - 1)] - gray[y * sw + (x + 1)]);
      lapSum += lap;
      lapCount++;
    }
  }

  return {
    brightness: lumCount > 0 ? lumSum / lumCount : 128,
    sharpness: lapCount > 0 ? lapSum / lapCount : 10,
  };
}

export function evaluateLandmarksQuality(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[] | null,
  expectedAngle: 'front' | 'left' | 'right' | 'smile'
): QualityCheckResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const { brightness, sharpness } = ctx
    ? computeImageQualityMetrics(ctx, w, h)
    : { brightness: 128, sharpness: 12 };

  const reasons: string[] = [];

  if (brightness < 48) {
    reasons.push('Too dark — face a window or brighter even light.');
  } else if (brightness > 228) {
    reasons.push('Overexposed — avoid harsh direct glare behind or in front.');
  }

  if (sharpness < 3.2) {
    reasons.push('Image looks blurry — hold steady and clean camera lens.');
  }

  if (!landmarks || landmarks.length < 468) {
    reasons.push('Hold inside frame — keep eyes and jaw visible.');
    return {
      passed: false,
      reasons,
      hint: reasons[0] || 'Center your face inside the alignment grid',
      brightness,
      sharpness,
      faceScale: 0,
      rollDeg: 0,
      yawDeg: 0,
      pitchDeg: 0,
      landmarks: null,
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

  const faceHeight = Math.abs(chin.y - fore.y);
  if (faceHeight < 0.22) {
    reasons.push('Face is too small in frame — move closer to arm’s length.');
  } else if (faceHeight > 0.90) {
    reasons.push('Too close — step back to arm’s length to avoid wide-angle distortion.');
  }

  // Roll angle from outer eye corners
  const rollRad = Math.atan2(
    (rightEyeOuter.y - leftEyeOuter.y) * h,
    Math.max(1e-4, Math.abs(rightEyeOuter.x - leftEyeOuter.x)) * w * (rightEyeOuter.x >= leftEyeOuter.x ? 1 : -1)
  );
  const rollDeg = clamp((rollRad * 180) / Math.PI, -45, 45);

  // Yaw estimate clamped cleanly so extreme 45-70 deg profile turns never invert or explode
  const faceWidthX = Math.max(0.035, Math.abs(rightCheek.x - leftCheek.x));
  const noseRelX = (noseTip.x - (leftCheek.x + rightCheek.x) / 2) / faceWidthX;
  const yawDeg = clamp(noseRelX * 72, -75, 75);

  // Pitch estimate: vertical ratio of nose tip between eyes and chin
  const eyeMidY = (leftEyeInner.y + rightEyeInner.y) / 2;
  const noseToEye = noseTip.y - eyeMidY;
  const chinToEye = Math.max(0.03, chin.y - eyeMidY);
  const pitchRatio = noseToEye / chinToEye; // ~0.42 neutral
  const pitchDeg = clamp((pitchRatio - 0.42) * 85, -45, 45);

  // Eye Aspect Ratio (check eyes open)
  const leftEar = dist(safePt(landmarks, 159), safePt(landmarks, 145), w, h) / Math.max(1, dist(leftEyeOuter, leftEyeInner, w, h));
  const rightEar = dist(safePt(landmarks, 386), safePt(landmarks, 374), w, h) / Math.max(1, dist(rightEyeInner, rightEyeOuter, w, h));
  const avgEar = (leftEar + rightEar) / 2;

  // Mouth Aspect Ratio (check mouth closed unless smile mode)
  const mouthOpen = dist(safePt(landmarks, 13), safePt(landmarks, 14), w, h) / Math.max(1, dist(safePt(landmarks, 61), safePt(landmarks, 291), w, h));

  if (expectedAngle === 'front' || expectedAngle === 'smile') {
    if (Math.abs(rollDeg) > 8) reasons.push(`Head tilted (${rollDeg.toFixed(0)}°) — level your eyes with horizon line.`);
    if (Math.abs(yawDeg) > 10) {
      reasons.push(yawDeg > 0 ? 'Turn slightly right on screen to face straight.' : 'Turn slightly left on screen to face straight.');
    }
    if (Math.abs(pitchDeg) > 13) {
      reasons.push(pitchDeg > 0 ? 'Raise chin slightly to eye level.' : 'Lower chin slightly to neutral eye level.');
    }
    if (avgEar < 0.14) reasons.push('Keep both eyes open naturally.');
    if (expectedAngle === 'front' && mouthOpen > 0.18) {
      reasons.push('Keep mouth closed and expression neutral.');
    }
  } else if (expectedAngle === 'left') {
    if (yawDeg > -14) {
      reasons.push(
        yawDeg > 10
          ? 'Opposite side — turn nose toward right edge of screen (35–45°).'
          : 'Turn head 35–45° toward right edge to show Left profile.'
      );
    }
    if (Math.abs(rollDeg) > 15) reasons.push('Keep eyes level with the horizontal grid.');
  } else if (expectedAngle === 'right') {
    if (yawDeg < 14) {
      reasons.push(
        yawDeg < -10
          ? 'Opposite side — turn nose toward left edge of screen (35–45°).'
          : 'Turn head 35–45° toward left edge to show Right profile.'
      );
    }
    if (Math.abs(rollDeg) > 15) reasons.push('Keep eyes level with the horizontal grid.');
  }

  const passed = reasons.length === 0;
  const hint = passed ? 'Biometric Lock — Hold Steady' : reasons[0];

  return {
    passed,
    reasons,
    hint,
    brightness,
    sharpness,
    faceScale: faceHeight,
    rollDeg,
    yawDeg,
    pitchDeg,
    landmarks,
  };
}

export async function analyzeFrameWithLandmarker(
  canvas: HTMLCanvasElement,
  expectedAngle: 'front' | 'left' | 'right' | 'smile'
): Promise<QualityCheckResult> {
  const lm = await initFaceLandmarker();
  let landmarks: NormalizedLandmark[] | null = null;
  try {
    if (canvas.width > 0 && canvas.height > 0) {
      const result = lm.detect(canvas);
      landmarks = result?.faceLandmarks?.[0] ?? null;
    }
  } catch {
    landmarks = null;
  }
  return evaluateLandmarksQuality(canvas, landmarks, expectedAngle);
}

export async function detectLandmarksFast(
  canvas: HTMLCanvasElement
): Promise<NormalizedLandmark[] | null> {
  if (engineState.status !== 'ready' || !engineState.landmarker) return null;
  try {
    if (canvas.width <= 0 || canvas.height <= 0) return null;
    const result = engineState.landmarker.detect(canvas);
    return result?.faceLandmarks?.[0] ?? null;
  } catch {
    return null;
  }
}

export function drawBlueWireframeMesh(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[],
  scanProgress?: number | null
): void {
  if (!landmarks || landmarks.length < 468 || width <= 0 || height <= 0) return;

  const drawConnections = (
    connections: { start: number; end: number }[],
    strokeStyle: string,
    lineWidth: number
  ) => {
    if (!connections || connections.length === 0) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const a = landmarks[conn.start];
      const b = landmarks[conn.end];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
    }
    ctx.stroke();
    ctx.restore();
  };

  // Full 3D triangulated wireframe mesh (forehead, cheeks, nose bridge, jaw, chin)
  drawConnections(
    FaceLandmarker.FACE_LANDMARKS_TESSELATION ?? [],
    'rgba(59, 158, 255, 0.56)',
    Math.max(0.75, width * 0.0014)
  );

  // Crisp bright-blue anatomical contours (eyes, brows, lips, jawline & oval)
  const primaryContourGroups = [
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_LIPS ?? [],
  ];
  for (const group of primaryContourGroups) {
    drawConnections(group, 'rgba(110, 195, 255, 0.9)', Math.max(1.05, width * 0.002));
  }

  // Optional animated vertical 3D depth scan beam while scanning
  if (typeof scanProgress === 'number' && scanProgress > 0 && scanProgress < 100) {
    const scanY = (scanProgress / 100) * height;
    ctx.save();
    const grad = ctx.createLinearGradient(0, scanY - 26, 0, scanY + 6);
    grad.addColorStop(0, 'rgba(14, 165, 233, 0)');
    grad.addColorStop(0.8, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(125, 211, 252, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 26, width, 32);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(width, scanY);
    ctx.stroke();
    ctx.restore();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sampleSkinStats(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
): { evennessScore: number; rednessIndex: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { evennessScore: 70, rednessIndex: 12 };

  // Sample left cheek (117, 118, 101, 50), right cheek (346, 347, 330, 280), forehead (151, 108, 337)
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

  if (lumVals.length === 0) return { evennessScore: 70, rednessIndex: 12 };

  const meanLum = lumVals.reduce((a, b) => a + b, 0) / lumVals.length;
  const variance = lumVals.reduce((acc, v) => acc + (v - meanLum) ** 2, 0) / lumVals.length;
  const stdDev = Math.sqrt(variance);

  // Redness excess: mean(R - G)
  let redDiffSum = 0;
  for (let i = 0; i < rVals.length; i++) {
    redDiffSum += Math.max(0, rVals[i] - gVals[i]);
  }
  const redness = redDiffSum / rVals.length;

  // Lower stdDev & moderate redness = higher skin evenness score (35..95)
  const evennessScore = clamp(Math.round(95 - stdDev * 1.15 - Math.max(0, redness - 22) * 0.6), 35, 95);
  return { evennessScore, rednessIndex: Math.round(redness) };
}

function classifyFaceShape(
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

export function computeFullScanResult(params: {
  frontCanvas: HTMLCanvasElement;
  frontQuality: QualityCheckResult;
  leftCanvas?: HTMLCanvasElement | null;
  leftQuality?: QualityCheckResult | null;
  rightCanvas?: HTMLCanvasElement | null;
  rightQuality?: QualityCheckResult | null;
  hasSmile?: boolean;
  saveThumbnails: boolean;
}): FaceScanResult {
  const { frontCanvas, frontQuality, leftCanvas, leftQuality, rightCanvas, rightQuality, hasSmile, saveThumbnails } = params;
  const lm = frontQuality.landmarks ?? [];
  const w = Math.max(1, frontCanvas.width);
  const h = Math.max(1, frontCanvas.height);

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

  // Pupil centers (fallback to eye midpoints if iris 468/473 unavailable)
  const leftIris = lm[468];
  const rightIris = lm[473];
  const leftPupil = leftIris && Number.isFinite(leftIris.x) ? leftIris : {
    x: (p33.x + p133.x) / 2,
    y: (p159.y + p145.y) / 2,
    z: 0,
    visibility: 1,
  };
  const rightPupil = rightIris && Number.isFinite(rightIris.x) ? rightIris : {
    x: (p362.x + p263.x) / 2,
    y: (p386.y + p374.y) / 2,
    z: 0,
    visibility: 1,
  };

  const ipd = Math.max(10, dist(leftPupil, rightPupil, w, h));
  const cheekWidth = Math.max(10, dist(p234, p454, w, h));
  const jawWidth = Math.max(8, dist(p172, p397, w, h));
  const foreheadWidth = Math.max(10, dist(p54, p284, w, h));

  // Vertical thirds (glabella 9, subnasale 2, menton 152, forehead top 10 + 14% hairline proxy)
  const upperForeheadY = p10.y * h - cheekWidth * 0.14;
  const glabellaY = p9.y * h;
  const subnasaleY = p2.y * h;
  const mentonY = p152.y * h;

  const upperThird = Math.max(10, glabellaY - upperForeheadY);
  const midThird = Math.max(10, subnasaleY - glabellaY);
  const lowerThird = Math.max(10, mentonY - subnasaleY);
  const totalThirds = upperThird + midThird + lowerThird;

  const thirdUpperPct = (upperThird / totalThirds) * 100;
  const thirdMidPct = (midThird / totalThirds) * 100;
  const thirdLowerPct = (lowerThird / totalThirds) * 100;

  // fWHR: bizygomatic width / upper face height (brow 9 to upper lip 0)
  const upperFaceH = Math.max(10, dist(p9, p0, w, h));
  const fwhr = cheekWidth / upperFaceH;

  // Jaw-to-Cheek width ratio
  const jawToCheek = jawWidth / Math.max(1, cheekWidth);

  // Chin-to-philtrum ratio: (menton 152 to lower lip 17) / (subnasale 2 to upper lip 0)
  const philtrumH = Math.max(4, dist(p2, p0, w, h));
  const chinH = Math.max(4, dist(p17, p152, w, h));
  const chinToPhiltrum = chinH / philtrumH;

  // Canthal tilt adjusted for head roll
  const rollRad = Math.atan2((rightPupil.y - leftPupil.y) * h, Math.max(1, (rightPupil.x - leftPupil.x) * w));
  const leftTiltRaw = Math.atan2((p133.y - p33.y) * h, (p133.x - p33.x) * w);
  const rightTiltRaw = Math.atan2((p362.y - p263.y) * h, (p263.x - p362.x) * w);
  const leftCanthalDeg = ((leftTiltRaw - rollRad) * 180) / Math.PI;
  const rightCanthalDeg = ((rightTiltRaw + rollRad) * 180) / Math.PI;
  const avgCanthalDeg = clamp((leftCanthalDeg + rightCanthalDeg) / 2, -12, 14);

  // Eye Aspect Ratio & Eye Spacing
  const leftEyeW = dist(p33, p133, w, h);
  const rightEyeW = dist(p362, p263, w, h);
  const avgEyeW = Math.max(4, (leftEyeW + rightEyeW) / 2);
  const leftEyeH = dist(p159, p145, w, h);
  const rightEyeH = dist(p386, p374, w, h);
  const eyeAspectRatio = ((leftEyeH / Math.max(1, leftEyeW)) + (rightEyeH / Math.max(1, rightEyeW))) / 2;
  const intercanthalDist = dist(p133, p362, w, h);
  const eyeSpacingRatio = intercanthalDist / avgEyeW;

  // Brow height & tilt (brow mid 105/334 vs eye top 159/386, normalized by IPD)
  const leftBrowHeight = dist(p105, p159, w, h) / ipd;
  const rightBrowHeight = dist(p334, p386, w, h) / ipd;
  const avgBrowHeight = (leftBrowHeight + rightBrowHeight) / 2;

  // Mouth vs Nose width & Lip ratio
  const mouthW = dist(p61, p291, w, h);
  const noseW = dist(p129, p358, w, h);
  const mouthToNose = mouthW / Math.max(1, noseW);
  const upperLipH = Math.max(2, dist(p0, p13, w, h));
  const lowerLipH = Math.max(2, dist(p14, p17, w, h));
  const lipRatio = lowerLipH / upperLipH;

  // Midface ratio: IPD / pupil-mid-to-upper-lip height
  const pupilMidY = ((leftPupil.y + rightPupil.y) / 2) * h;
  const midfaceHeight = Math.max(10, p0.y * h - pupilMidY);
  const midfaceRatio = ipd / midfaceHeight;

  // Bilateral symmetry across mirrored landmark pairs relative to face midline
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
  const symmetryScore = clamp(Math.round(96 - avgAsym * 2.2), 42, 96);

  // Skin stats from canvas pixel patches
  const skinStats = sampleSkinStats(frontCanvas, lm);

  // Profile approximate estimates from BOTH Left & Right profiles when captured
  const profileMeasurements: ScanMeasurement[] = [];
  let jawNeckBonus = 0;

  const extractProfileMetrics = (pLm: NormalizedLandmark[]) => {
    const p234 = safePt(pLm, 234);
    const p454 = safePt(pLm, 454);
    const p172 = safePt(pLm, 172);
    const p397 = safePt(pLm, 397);
    const ear = (p234.z ?? 0) < (p454.z ?? 0) ? p234 : p454;
    const gonion = (p172.z ?? 0) < (p397.z ?? 0) ? p172 : p397;
    const menton = safePt(pLm, 152);
    const noseTip = safePt(pLm, 1);
    const upperLip = safePt(pLm, 0);

    const v1x = ear.x - gonion.x;
    const v1y = ear.y - gonion.y;
    const v2x = menton.x - gonion.x;
    const v2y = menton.y - gonion.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag = Math.max(0.0001, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
    const gonialAngle = clamp((Math.acos(clamp(dot / mag, -1, 1)) * 180) / Math.PI, 98, 148);
    const fhpApprox = clamp(Math.abs((ear.x - gonion.x) * 65), 2, 28);
    const eLineOffset = Math.abs(upperLip.x - (noseTip.x + menton.x) / 2) * 100;
    return { gonialAngle, fhpApprox, eLineOffset };
  };

  const leftMetrics = leftQuality?.landmarks ? extractProfileMetrics(leftQuality.landmarks) : null;
  const rightMetrics = rightQuality?.landmarks ? extractProfileMetrics(rightQuality.landmarks) : null;
  const bothProfiles = [leftMetrics, rightMetrics].filter(Boolean) as Array<ReturnType<typeof extractProfileMetrics>>;

  if (bothProfiles.length > 0) {
    const avgGonial = bothProfiles.reduce((s, m) => s + m.gonialAngle, 0) / bothProfiles.length;
    const avgFhp = bothProfiles.reduce((s, m) => s + m.fhpApprox, 0) / bothProfiles.length;
    const avgELine = bothProfiles.reduce((s, m) => s + m.eLineOffset, 0) / bothProfiles.length;
    const profileSymDiff =
      leftMetrics && rightMetrics ? Math.abs(leftMetrics.gonialAngle - rightMetrics.gonialAngle) : 0;

    profileMeasurements.push(
      {
        key: 'gonialAngle',
        label: bothProfiles.length === 2 ? 'Jawline / Gonial angle (L/R avg, approx.)' : 'Gonial angle (approx.)',
        value: Number(avgGonial.toFixed(1)),
        unit: '°',
        typicalRange: '115–130°',
        status: avgGonial >= 114 && avgGonial <= 132 ? 'balanced' : 'watch',
        approximate: true,
      },
      {
        key: 'forwardHead',
        label: 'Cervical posture offset (approx.)',
        value: Number(avgFhp.toFixed(1)),
        unit: '°',
        typicalRange: '< 12°',
        status: avgFhp <= 12 ? 'balanced' : 'focus',
        approximate: true,
      },
      {
        key: 'eLine',
        label: 'E-line alignment (approx.)',
        value: Number(avgELine.toFixed(1)),
        unit: 'u',
        typicalRange: '1.5–4.5 u',
        status: avgELine < 4.5 ? 'balanced' : 'watch',
        approximate: true,
      }
    );

    if (leftMetrics && rightMetrics) {
      profileMeasurements.push({
        key: 'profileSym',
        label: 'L/R profile jaw consistency (approx.)',
        value: Number(profileSymDiff.toFixed(1)),
        unit: '°',
        typicalRange: '< 6°',
        status: profileSymDiff <= 6 ? 'balanced' : 'watch',
        approximate: true,
      });
    }

    if (avgFhp <= 12) jawNeckBonus += 4;
    if (avgGonial >= 115 && avgGonial <= 130) jawNeckBonus += 5;
  }

  // Brow ridge / framing & Cheekbone prominence normalized ratios
  const cheekboneToJawRatio = cheekWidth / Math.max(1, jawWidth);
  const browSlopeDeg =
    ((Math.atan2((p55.y - p46.y) * h, Math.max(1e-4, Math.abs(p55.x - p46.x)) * w * (p55.x >= p46.x ? 1 : -1)) * 180) /
      Math.PI -
      (rollRad * 180) / Math.PI) *
    -1;

  const measurements: ScanMeasurement[] = [
    {
      key: 'thirds',
      label: 'Lower third balance',
      value: Number(thirdLowerPct.toFixed(1)),
      unit: '%',
      typicalRange: '31–36%',
      status: thirdLowerPct >= 30 && thirdLowerPct <= 37 ? 'balanced' : 'watch',
    },
    {
      key: 'fwhr',
      label: 'Facial width-to-height (fWHR)',
      value: Number(fwhr.toFixed(2)),
      unit: 'x',
      typicalRange: '1.75–2.05x',
      status: fwhr >= 1.72 && fwhr <= 2.1 ? 'balanced' : 'watch',
    },
    {
      key: 'cheekboneProminence',
      label: 'Cheekbone-to-jaw taper',
      value: Number(cheekboneToJawRatio.toFixed(2)),
      unit: 'x',
      typicalRange: '1.12–1.30x',
      status: cheekboneToJawRatio >= 1.1 && cheekboneToJawRatio <= 1.32 ? 'balanced' : 'watch',
    },
    {
      key: 'jawCheek',
      label: 'Jaw-to-cheek width',
      value: Number(jawToCheek.toFixed(2)),
      unit: 'x',
      typicalRange: '0.76–0.90x',
      status: jawToCheek >= 0.75 && jawToCheek <= 0.92 ? 'balanced' : 'focus',
    },
    {
      key: 'chinPhiltrum',
      label: 'Chin-to-philtrum ratio',
      value: Number(chinToPhiltrum.toFixed(2)),
      unit: 'x',
      typicalRange: '1.9–2.5x',
      status: chinToPhiltrum >= 1.8 && chinToPhiltrum <= 2.6 ? 'balanced' : 'watch',
    },
    {
      key: 'canthalTilt',
      label: 'Avg canthal tilt',
      value: Number(avgCanthalDeg.toFixed(1)),
      unit: '°',
      typicalRange: '0 to +6°',
      status: avgCanthalDeg >= -1 && avgCanthalDeg <= 8 ? 'balanced' : 'watch',
    },
    {
      key: 'eyeAspect',
      label: 'Eye aspect ratio',
      value: Number(eyeAspectRatio.toFixed(2)),
      unit: 'x',
      typicalRange: '0.26–0.36x',
      status: eyeAspectRatio >= 0.24 && eyeAspectRatio <= 0.38 ? 'balanced' : 'watch',
    },
    {
      key: 'eyeSpacing',
      label: 'Eye spacing ratio',
      value: Number(eyeSpacingRatio.toFixed(2)),
      unit: 'x',
      typicalRange: '0.92–1.10x',
      status: eyeSpacingRatio >= 0.9 && eyeSpacingRatio <= 1.12 ? 'balanced' : 'watch',
    },
    {
      key: 'browHeight',
      label: 'Brow-to-eye framing',
      value: Number(avgBrowHeight.toFixed(2)),
      unit: 'IPD',
      typicalRange: '0.20–0.30',
      status: avgBrowHeight >= 0.18 && avgBrowHeight <= 0.32 ? 'balanced' : 'watch',
    },
    {
      key: 'mouthNose',
      label: 'Mouth-to-nose width',
      value: Number(mouthToNose.toFixed(2)),
      unit: 'x',
      typicalRange: '1.35–1.65x',
      status: mouthToNose >= 1.3 && mouthToNose <= 1.7 ? 'balanced' : 'watch',
    },
    {
      key: 'lipRatio',
      label: 'Lower-to-upper lip',
      value: Number(lipRatio.toFixed(2)),
      unit: 'x',
      typicalRange: '1.2–1.8x',
      status: lipRatio >= 1.1 && lipRatio <= 1.9 ? 'balanced' : 'watch',
    },
    {
      key: 'midface',
      label: 'Midface ratio',
      value: Number(midfaceRatio.toFixed(2)),
      unit: 'x',
      typicalRange: '0.92–1.08x',
      status: midfaceRatio >= 0.9 && midfaceRatio <= 1.1 ? 'balanced' : 'watch',
    },
    ...profileMeasurements,
  ];

  // Sub-scores (0..100, calibrated realistically)
  const thirdDev = Math.abs(thirdUpperPct - 33.3) + Math.abs(thirdMidPct - 33.3) + Math.abs(thirdLowerPct - 33.3);
  const proportionsScore = clamp(Math.round(86 - thirdDev * 1.1 - Math.abs(midfaceRatio - 1.0) * 35), 45, 92);
  const eyeScore = clamp(Math.round(78 + clamp(avgCanthalDeg, -3, 6) * 1.5 - Math.abs(eyeSpacingRatio - 1.0) * 35), 48, 92);
  const browRidgeScore = clamp(
    Math.round(80 - Math.abs(avgBrowHeight - 0.24) * 95 + clamp(browSlopeDeg, -4, 6)),
    46,
    92
  );
  const cheekboneScore = clamp(
    Math.round(74 + (cheekboneToJawRatio >= 1.12 && cheekboneToJawRatio <= 1.3 ? 14 : 4) - Math.abs(fwhr - 1.9) * 18),
    46,
    92
  );
  const jawNeckScore = clamp(Math.round(68 + (jawToCheek >= 0.78 && jawToCheek <= 0.9 ? 10 : 2) + jawNeckBonus), 45, 90);
  const leannessProxy = clamp(Math.round(70 + (cheekboneToJawRatio > 1.12 && cheekboneToJawRatio < 1.32 ? 12 : 4)), 45, 90);

  const subScores = {
    symmetry: symmetryScore,
    proportions: proportionsScore,
    jawNeck: jawNeckScore,
    eyeArea: eyeScore,
    browRidge: browRidgeScore,
    cheekbones: cheekboneScore,
    skin: skinStats.evennessScore,
    leanness: leannessProxy,
  };

  // Calibrated PSL-style estimate across official brackets (1..8+)
  const weightedAvg =
    subScores.symmetry * 0.16 +
    subScores.proportions * 0.18 +
    subScores.jawNeck * 0.16 +
    subScores.eyeArea * 0.14 +
    subScores.browRidge * 0.08 +
    subScores.cheekbones * 0.1 +
    subScores.skin * 0.1 +
    subScores.leanness * 0.08;

  const rawPsl = 2.0 + ((weightedAvg - 42) / 50) * 5.8;
  const pslEstimate = Number(clamp(rawPsl, 1.5, 8.4).toFixed(1));
  const tier: FaceScanResult['tier'] = getPslTierInfo(pslEstimate).id;

  const faceShape = classifyFaceShape(cheekWidth, jawWidth, foreheadWidth, totalThirds);

  const domains = [
    { key: 'symmetry', area: 'Facial Symmetry', score: subScores.symmetry, detail: `Mirrored landmark alignment scored ${subScores.symmetry}/100.` },
    { key: 'proportions', area: 'Midface & Proportions', score: subScores.proportions, detail: `Vertical thirds and midface ratio scored ${subScores.proportions}/100.` },
    { key: 'jawNeck', area: 'Jawline & Neck Frame', score: subScores.jawNeck, detail: `3-angle jaw framing and cervical alignment scored ${subScores.jawNeck}/100.` },
    { key: 'eyeArea', area: 'Eye Area Framing', score: subScores.eyeArea, detail: `Canthal alignment and eye spacing scored ${subScores.eyeArea}/100.` },
    { key: 'browRidge', area: 'Brow Framing', score: subScores.browRidge, detail: `Brow height and lateral framing scored ${subScores.browRidge}/100.` },
    { key: 'cheekbones', area: 'Cheekbone Prominence', score: subScores.cheekbones, detail: `Malar-to-jaw contour taper scored ${subScores.cheekbones}/100.` },
    { key: 'skin', area: 'Skin Clarity & Tone', score: subScores.skin, detail: `Sampled cheek/forehead luminance evenness scored ${subScores.skin}/100.` },
    { key: 'leanness', area: 'Facial Contour & Debloat', score: subScores.leanness, detail: `Lower cheek contour taper scored ${subScores.leanness}/100.` },
  ].sort((a, b) => b.score - a.score);

  const strengths = domains.slice(0, 3).map((d) => ({
    area: d.area,
    detail: d.detail,
  }));

  const focusMap: Record<string, ScanFocusArea> = {
    skin: {
      area: 'Skin Clarity & Evenness',
      detail: `Measured luminance variance and redness index scored ${subScores.skin}/100.`,
      actions: [
        { label: 'Lock daily gentle cleanser, moisturizer & SPF 30+', impact: 'High', protocolId: 'skin-spf-daily' },
        { label: 'Track hydration & irritation in Skin Lab for 4 weeks', impact: 'Medium', protocolId: 'skin-journal-log' },
        { label: 'Review sleep consistency & window lighting', impact: 'Medium', protocolId: 'sleep-fixed-anchor' },
      ],
      medicalNote: 'Stubborn acne, scarring, or persistent redness cannot be diagnosed by photo—consult a dermatologist.',
    },
    jawNeck: {
      area: 'Jawline & Cervical Frame',
      detail: `3-angle jaw & neck framing scored ${subScores.jawNeck}/100.`,
      actions: [
        { label: 'Daily chin tucks & screen height alignment', impact: 'High', protocolId: 'posture-chin-tucks' },
        { label: 'Consistent protein & slight calorie deficit if above lean body fat', impact: 'High', protocolId: 'hydration-protein-anchor' },
        { label: 'Safe light neck & upper-trap training', impact: 'Medium', protocolId: 'training-neck-traps' },
      ],
      medicalNote: 'Adult jawbone structure does not change from exercises or mewing; skeletal jaw changes require orthodontics or surgery.',
    },
    leanness: {
      area: 'Facial Definition & Debloat',
      detail: `Contour taper scored ${subScores.leanness}/100. Morning puffiness and body fat heavily affect definition.`,
      actions: [
        { label: 'Stabilize water & reduce late-night sodium/alcohol', impact: 'High', protocolId: 'hydration-sodium-sugar' },
        { label: 'Hit daily step target & structured strength training', impact: 'High', protocolId: 'training-zone2-walk' },
        { label: 'Anchor 7.5–8h consistent sleep', impact: 'Medium', protocolId: 'sleep-fixed-anchor' },
      ],
      medicalNote: 'Facial fat cannot be spot-reduced; overall body composition and hydration govern facial leanness.',
    },
    cheekbones: {
      area: 'Cheekbone Contour & Debloat',
      detail: `Malar-to-jaw taper scored ${subScores.cheekbones}/100. Lowering facial fluid retention sharpens cheekbone definition.`,
      actions: [
        { label: 'Cut evening excess sodium and hit daily water target', impact: 'High', protocolId: 'hydration-sodium-sugar' },
        { label: 'Gradual systemic fat loss + resistance training', impact: 'High', protocolId: 'training-full-body' },
      ],
      medicalNote: 'Zygomatic bone projection is genetic; only body composition, debloating, and lighting alter midface contour safely.',
    },
    browRidge: {
      area: 'Brow Framing & Contrast',
      detail: `Brow height and framing scored ${subScores.browRidge}/100.`,
      actions: [
        { label: 'Clean stray hairs cleanly without over-thinning', impact: 'High', protocolId: 'hair-brow-cleanup' },
        { label: 'Protect orbital area with daily non-stinging SPF', impact: 'Medium', protocolId: 'skin-spf-daily' },
      ],
      medicalNote: 'Supraorbital bone projection is skeletal; clean natural brow grooming maximizes contrast safely.',
    },
    eyeArea: {
      area: 'Eye Area & Rested Contrast',
      detail: `Eye framing scored ${subScores.eyeArea}/100. Rested lids, UV care, and neat brows sharpen contrast.`,
      actions: [
        { label: 'Tidy natural brow strays without over-thinning', impact: 'High', protocolId: 'hair-brow-cleanup' },
        { label: 'Consistent 7.5–8h sleep window for dark-circle reduction', impact: 'High', protocolId: 'sleep-wind-down' },
      ],
      medicalNote: 'Canthal tilt and orbital bone shape are genetic and cannot be changed with squinting exercises.',
    },
    proportions: {
      area: 'Upper/Lower Visual Balance',
      detail: `Measured proportions scored ${subScores.proportions}/100 (${faceShape} shape). Haircut geometry shifts visual thirds fastest.`,
      actions: [
        { label: 'Match haircut volume to your detected face shape', impact: 'High', protocolId: 'hair-barber-card' },
        { label: 'Shoot check-ins at arm’s length to avoid lens distortion', impact: 'Medium', protocolId: 'presence-photo-practice' },
      ],
      medicalNote: 'Underlying facial thirds are skeletal; only hairstyle, facial hair, and camera distance alter them non-invasively.',
    },
    symmetry: {
      area: 'Posture & Symmetry Habits',
      detail: `Biggest bilateral variance: ${asymItems[0]?.label ?? 'subtle lateral offset'} (${asymItems[0]?.diffPct ?? 2}%).`,
      actions: [
        { label: 'Alternate chewing sides & sleep posture balance', impact: 'Medium', protocolId: 'posture-symmetry-habits' },
        { label: 'Practice neutral head alignment & thoracic mobility', impact: 'Medium', protocolId: 'posture-thoracic-mob' },
      ],
      medicalNote: 'Every human face has natural asymmetry; head tilt and side lighting often exaggerate minor differences.',
    },
  };

  const focusDomains = domains.slice(-3).reverse();
  const focusAreas = focusDomains.map((d) => focusMap[d.key]);

  const oneLineFixLookup: Record<string, { fix: string; protocolId: string }> = {
    skin: { fix: 'Lock gentle AM/PM cleanser, moisturizer, and daily SPF 30+.', protocolId: 'skin-spf-daily' },
    jawNeck: { fix: 'Run daily cervical chin tucks and eye-level screen ergonomics.', protocolId: 'posture-chin-tucks' },
    leanness: { fix: 'Drop late-night sodium/alcohol and hit 8k+ steps daily.', protocolId: 'hydration-sodium-sugar' },
    cheekbones: { fix: 'Debloat with potassium-rich meals and steady hydration.', protocolId: 'hydration-water-target' },
    browRidge: { fix: 'Remove only stray brow hairs below tail without over-thinning.', protocolId: 'hair-brow-cleanup' },
    eyeArea: { fix: 'Protect a fixed 7.5–8h sleep anchor and morning daylight.', protocolId: 'sleep-fixed-anchor' },
    proportions: { fix: 'Use a haircut calibrated to your detected face shape.', protocolId: 'hair-barber-card' },
    symmetry: { fix: 'Chew evenly on both sides and avoid one-sided pillow compression.', protocolId: 'posture-symmetry-habits' },
  };

  const oneLineFixes = focusDomains.map((d) => ({
    area: focusMap[d.key].area,
    fix: oneLineFixLookup[d.key]?.fix ?? 'Stay consistent on core daily habits.',
    protocolId: oneLineFixLookup[d.key]?.protocolId,
  }));

  const anglesCaptured: FaceScanResult['anglesCaptured'] = ['front'];
  if (leftCanvas) anglesCaptured.push('left');
  if (rightCanvas) anglesCaptured.push('right');
  if (hasSmile) anglesCaptured.push('smile');

  const qualityScore = clamp(
    Math.round(
      (frontQuality.sharpness > 6 ? 90 : 75) -
        Math.abs(frontQuality.rollDeg) * 1.5 -
        Math.abs(frontQuality.yawDeg) * 1.2
    ),
    60,
    98
  );

  const lightingScore = clamp(
    Math.round(100 - Math.abs(frontQuality.brightness - 135) * 0.55),
    45,
    98
  );

  return {
    date: toLocalDateKey(),
    timestamp: Date.now(),
    anglesCaptured,
    qualityScore,
    lightingScore,
    pslEstimate,
    tier,
    faceShape,
    subScores,
    measurements,
    asymmetries: asymItems,
    strengths,
    focusAreas,
    oneLineFixes,
    frontThumbnail: saveThumbnails ? createSmallThumbnail(frontCanvas) : undefined,
    leftThumbnail: saveThumbnails && leftCanvas ? createSmallThumbnail(leftCanvas) : undefined,
    rightThumbnail: saveThumbnails && rightCanvas ? createSmallThumbnail(rightCanvas) : undefined,
  };
}
