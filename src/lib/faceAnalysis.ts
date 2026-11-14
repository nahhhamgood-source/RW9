import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { LandmarksOverlayGuides } from '../types';
import {
  computeMedianLandmarks,
  evaluateLandmarksQuality,
  type QualityCheckResult,
  type ScanAngleStep,
} from './faceMetrics';

export * from './faceMetrics';
export * from './faceMetricsConstants';

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
let downscaleCanvas: HTMLCanvasElement | null = null;

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

  if (forceRetry && engineState.landmarker) {
    try {
      engineState.landmarker.close();
    } catch {
      // Ignore cleanup errors
    }
    engineState.landmarker = null;
  }

  engineState.status = 'loading';
  engineState.error = null;
  notify();

  loadPromise = (async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Scanner model load timed out (12s).')), 12000)
    );

    const runInit = async () => {
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return FaceLandmarker.createFromOptions(fileset, {
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
        outputFacialTransformationMatrixes: true,
      });
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
      engineState.error =
        err instanceof Error ? err.message : 'Failed to initialize local Face Landmarker.';
      notify();
      throw err;
    }
  })();

  return loadPromise;
}

/** Dispose singleton landmarker cleanly when leaving camera screen to free WASM memory */
export function disposeFaceLandmarker(): void {
  loadPromise = null;
  if (engineState.landmarker) {
    try {
      engineState.landmarker.close();
    } catch {
      // Ignore close errors
    }
    engineState.landmarker = null;
  }
  engineState.status = 'idle';
  engineState.error = null;
  notify();
}

function getDownscaledCanvas(source: HTMLCanvasElement | HTMLVideoElement, maxWidth = 480): HTMLCanvasElement {
  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const targetW = Math.min(maxWidth, Math.max(1, srcW));
  const targetH = Math.max(1, Math.round((srcH / Math.max(1, srcW)) * targetW));

  if (!downscaleCanvas) {
    downscaleCanvas = document.createElement('canvas');
  }
  if (downscaleCanvas.width !== targetW || downscaleCanvas.height !== targetH) {
    downscaleCanvas.width = targetW;
    downscaleCanvas.height = targetH;
  }
  const ctx = downscaleCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx && srcW > 0 && srcH > 0) {
    ctx.drawImage(source, 0, 0, targetW, targetH);
  }
  return downscaleCanvas;
}

/** Downscaled live-preview landmark + transformation matrix detection (480px max width) */
export function detectLandmarksFromVideo(
  video: HTMLVideoElement
): {
  landmarks: NormalizedLandmark[] | null;
  matrixData: number[] | null;
  sampleCanvas: HTMLCanvasElement;
} | null {
  if (engineState.status !== 'ready' || !engineState.landmarker) return null;
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;

  try {
    const sampleCanvas = getDownscaledCanvas(video, 480);
    const result = engineState.landmarker.detect(sampleCanvas);
    const rawMatrix = result?.facialTransformationMatrixes?.[0]?.data;
    return {
      landmarks: result?.faceLandmarks?.[0] ?? null,
      matrixData: rawMatrix ? Array.from(rawMatrix) : null,
      sampleCanvas,
    };
  } catch {
    return null;
  }
}

/** Run landmark + transformation matrix detection on a captured still canvas with a strict 5s timeout */
export async function detectLandmarksOnStill(
  canvas: HTMLCanvasElement,
  timeoutMs = 5000
): Promise<{ landmarks: NormalizedLandmark[] | null; matrixData: number[] | null }> {
  const lm = await initFaceLandmarker();
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { landmarks: null, matrixData: null };
  }

  const detectTask = new Promise<{ landmarks: NormalizedLandmark[] | null; matrixData: number[] | null }>(
    (resolve, reject) => {
      try {
        const target = canvas.width > 960 ? getDownscaledCanvas(canvas, 960) : canvas;
        const result = lm.detect(target);
        const rawMatrix = result?.facialTransformationMatrixes?.[0]?.data;
        resolve({
          landmarks: result?.faceLandmarks?.[0] ?? null,
          matrixData: rawMatrix ? Array.from(rawMatrix) : null,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Still landmark detection failed.'));
      }
    }
  );

  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Face detection timed out after 5 seconds. Tap Retry.')), timeoutMs)
  );

  return Promise.race([detectTask, timeoutTask]);
}

export async function analyzeFrameWithLandmarker(
  canvas: HTMLCanvasElement,
  expectedAngle: ScanAngleStep
): Promise<QualityCheckResult> {
  const { landmarks, matrixData } = await detectLandmarksOnStill(canvas, 5000);
  return evaluateLandmarksQuality(canvas, landmarks, expectedAngle, matrixData);
}

/**
 * Capture a 5-frame burst over ~210ms AFTER the user taps Capture, then run
 * MediaPipe detection on each still frame and compute the coordinate-wise median
 * landmarks to reduce frame-to-frame jitter. Frames are kept unmirrored so
 * landmark coordinates and yaw signs stay 100% consistent with live detection.
 */
export async function captureBurstAndEvaluate(
  video: HTMLVideoElement,
  expectedAngle: ScanAngleStep
): Promise<{ representativeCanvas: HTMLCanvasElement; quality: QualityCheckResult }> {
  const frames: HTMLCanvasElement[] = [];
  const totalFrames = 5;
  const intervalMs = 45; // ~180ms across 5 frames

  for (let i = 0; i < totalFrames; i++) {
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) break;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, c.width, c.height);
      frames.push(c);
    }
    if (i < totalFrames - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  if (frames.length === 0) {
    throw new Error('Camera frame unavailable. Hold steady and try again.');
  }

  const detections: Array<{ landmarks: NormalizedLandmark[] | null; matrixData: number[] | null }> = [];
  for (const frame of frames) {
    const det = await detectLandmarksOnStill(frame, 4000);
    if (det.landmarks && det.landmarks.length >= 468) {
      detections.push(det);
    }
  }

  const representativeCanvas = frames[Math.floor(frames.length / 2)];
  const validLandmarkSets = detections
    .map((d) => d.landmarks)
    .filter((l): l is NormalizedLandmark[] => Boolean(l));

  const medianLandmarks = computeMedianLandmarks(validLandmarkSets);
  const middleMatrix = detections[Math.floor(detections.length / 2)]?.matrixData ?? null;
  const quality = evaluateLandmarksQuality(
    representativeCanvas,
    medianLandmarks,
    expectedAngle,
    middleMatrix
  );

  return { representativeCanvas, quality };
}

/**
 * Draw subtle live 478-landmark wireframe overlay:
 * - Blue semi-transparent while adjusting / WARN
 * - Emerald green when aligned (PASS)
 */
export function drawBiometricMeshOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[],
  alignedGreen = false,
  scanProgress?: number | null
): void {
  if (!landmarks || landmarks.length < 468 || width <= 0 || height <= 0) return;

  const tesselationColor = alignedGreen
    ? 'rgba(52, 211, 153, 0.44)'
    : 'rgba(59, 158, 255, 0.42)';
  const contourColor = alignedGreen
    ? 'rgba(52, 211, 153, 0.90)'
    : 'rgba(110, 195, 255, 0.88)';

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

  drawConnections(
    FaceLandmarker.FACE_LANDMARKS_TESSELATION ?? [],
    tesselationColor,
    Math.max(0.7, width * 0.00125)
  );

  const primaryContourGroups = [
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_LIPS ?? [],
  ];
  for (const group of primaryContourGroups) {
    drawConnections(group, contourColor, Math.max(1.0, width * 0.00185));
  }

  if (typeof scanProgress === 'number' && scanProgress > 0 && scanProgress < 100) {
    const scanY = (scanProgress / 100) * height;
    ctx.save();
    const grad = ctx.createLinearGradient(0, scanY - 24, 0, scanY + 6);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
    grad.addColorStop(0.8, 'rgba(52, 211, 153, 0.35)');
    grad.addColorStop(1, 'rgba(110, 231, 183, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 24, width, 30);
    ctx.strokeStyle = 'rgba(167, 243, 208, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(width, scanY);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawThirdsGuideOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: LandmarksOverlayGuides
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.78)';
  ctx.lineWidth = Math.max(1, width * 0.003);
  ctx.setLineDash([5, 4]);

  const linesY = [
    guides.faceTopY * height,
    guides.upperThirdY * height,
    guides.midThirdY * height,
    guides.lowerThirdY * height,
  ];
  for (const y of linesY) {
    ctx.beginPath();
    ctx.moveTo(width * 0.08, y);
    ctx.lineTo(width * 0.92, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  ctx.beginPath();
  ctx.moveTo(guides.midlineX * width, Math.max(4, guides.faceTopY * height - 8));
  ctx.lineTo(guides.midlineX * width, Math.min(height - 4, guides.lowerThirdY * height + 8));
  ctx.stroke();
  ctx.restore();
}
