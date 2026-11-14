import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  Loader2,
  RotateCcw,
  ScanFace,
  SkipForward,
  Upload,
  X,
} from 'lucide-react';
import { db, recalculateXpAndBadges } from '../../db/database';
import {
  analyzeFrameWithLandmarker,
  computeFullScanResult,
  computeScanConfidenceFactor,
  detectLandmarksFromVideo,
  disposeFaceLandmarker,
  drawBiometricMeshOverlay,
  evaluateLandmarksQuality,
  EXPRESSION_BLENDSHAPE_GROUPS,
  getScannerState,
  initFaceLandmarker,
  snapshotToQualityResult,
  subscribeScannerStatus,
  type QualityCheckResult,
  type ScanAngleStep,
} from '../../lib/faceAnalysis';
import type { FaceScanResult } from '../../types';
import { useToast } from '../ui/ToastProvider';
import {
  createInitialScannerState,
  scannerReducer,
  STEP_META,
  type GuidedStepKey,
  type StepEntry,
} from './scannerMachine';

interface SerializedDraftShot {
  stillDataUrl: string;
  previewUrl: string;
  quality: Omit<QualityCheckResult, 'matrixData'>;
  captureStatus: 'captured' | 'captured, landmarks missing';
  isMirrored?: boolean;
  note?: string;
}

interface ScannerDraftPayload {
  savedAt: number;
  expiresAt: number;
  stepIndex: number;
  shots: Partial<Record<GuidedStepKey, SerializedDraftShot>>;
}

interface GuidedFaceScannerProps {
  saveThumbnails: boolean;
  augmentScan?: FaceScanResult | null;
  onCancel: () => void;
  onScanSaved: (scanId: number) => void;
}

const DRAFT_STORAGE_KEY = 'ascend_scanner_draft_v2';
const DRAFT_TTL_MS = 30 * 60 * 1000;
const STUCK_HELP_MS = 10_000;
const CAPTURE_TIMEOUT_MS = 4_000;
const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

let memoryDraft: {
  expiresAt: number;
  stepIndex: number;
  captures: Partial<Record<GuidedStepKey, StepEntry>>;
} | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
  ]);
}

function canvasToCompactDataUrl(canvas: HTMLCanvasElement, maxDim = 720): string {
  const scale = Math.min(1, maxDim / Math.max(1, canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
  }
  return out.toDataURL('image/jpeg', 0.85);
}

function loadCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, img.width);
      c.height = Math.max(1, img.height);
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Failed to decode saved draft photo'));
    img.src = dataUrl;
  });
}

function clearScannerDraft(): void {
  memoryDraft = null;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function saveScannerDraft(
  captures: Partial<Record<GuidedStepKey, StepEntry>>,
  stepIndex: number
): void {
  const now = Date.now();
  const expiresAt = now + DRAFT_TTL_MS;
  memoryDraft = { expiresAt, stepIndex, captures };

  try {
    const shots: Partial<Record<GuidedStepKey, SerializedDraftShot>> = {};
    (['front', 'left', 'right'] as GuidedStepKey[]).forEach((key) => {
      const item = captures[key];
      if (!item || item.status !== 'accepted' || !item.canvas || !item.quality || !item.previewUrl) return;
      const stillDataUrl = item.image || canvasToCompactDataUrl(item.canvas);
      const { matrixData: _omit, ...restQuality } = item.quality;
      shots[key] = {
        stillDataUrl,
        previewUrl: item.previewUrl,
        quality: restQuality,
        captureStatus:
          item.captureStatus === 'captured, landmarks missing'
            ? 'captured, landmarks missing'
            : 'captured',
        isMirrored: item.isMirrored,
        note: item.note,
      };
    });

    if (Object.keys(shots).length === 0) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    const payload: ScannerDraftPayload = {
      savedAt: now,
      expiresAt,
      stepIndex,
      shots,
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Keep memoryDraft fallback active
  }
}

function buildFallbackQuality(canvas: HTMLCanvasElement, angle: ScanAngleStep): QualityCheckResult {
  const base = evaluateLandmarksQuality(canvas, null, angle, null);
  return {
    ...base,
    level: 'WARN',
    passed: true,
    primaryInstruction: 'Face not detected on this photo, retake or continue with lower accuracy',
    warnDomains: ['pose'],
    warnings: ['Landmarks missing on still frame'],
    reasons: [],
    landmarks: null,
  };
}

function buildMeshPreviewUrl(canvas: HTMLCanvasElement, quality: QualityCheckResult): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext('2d');
  if (octx) {
    octx.drawImage(canvas, 0, 0);
    if (quality.landmarks && quality.landmarks.length >= 468) {
      drawBiometricMeshOverlay(
        octx,
        out.width,
        out.height,
        quality.landmarks,
        quality.level === 'PASS'
      );
    }
  }
  return out.toDataURL('image/jpeg', 0.88);
}

export const GuidedFaceScanner: React.FC<GuidedFaceScannerProps> = ({
  saveThumbnails,
  augmentScan = null,
  onCancel,
  onScanSaved,
}) => {
  const { showToast } = useToast();
  const isAugmentMode = Boolean(augmentScan?.id && augmentScan.savedFrontSnapshot);

  const initialAugmentStep = useMemo(() => {
    if (!augmentScan) return 0;
    if (!augmentScan.anglesCaptured.includes('left')) return 1;
    if (!augmentScan.anglesCaptured.includes('right')) return 2;
    return 1;
  }, [augmentScan]);

  const [state, dispatch] = useReducer(
    scannerReducer,
    undefined,
    () => createInitialScannerState(initialAugmentStep, isAugmentMode)
  );

  const currentStep = STEP_META[state.stepIndex];
  const currentCapture = state.captures[currentStep.key];
  const isReviewing = Boolean(state.pendingReview);

  const [draftRestored, setDraftRestored] = useState(false);
  const [engineStatus, setEngineStatus] = useState(getScannerState());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const [rejectedStill, setRejectedStill] = useState<{
    previewUrl: string;
    reason: string;
    expressionScore: number;
    cue: string | null;
    isMirrored: boolean;
  } | null>(null);

  // Hidden developer test panel (toggled by tapping Scan ID 5 times; off by default)
  const sessionScanId = useMemo(
    () => `SCN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    []
  );
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const devPanelOpenRef = useRef(false);
  const scanIdTapCountRef = useRef(0);
  const scanIdTapTimerRef = useRef<number | null>(null);
  const devLastSyncMsRef = useRef(0);
  const [devTelemetry, setDevTelemetry] = useState<{
    expressionScore: number;
    expressionGate: string;
    expressionCue: string | null;
    scanConfidence: number;
    yawDeg: number;
    rollDeg: number;
    pitchDeg: number;
    brightness: number;
    sharpness: number;
    faceWidthFrac: number;
    blendshapes: Record<string, number> | null;
    rawMetrics: {
      thirds: string;
      fwhr: string;
      jawToCheek: string;
      canthalDeg: string;
      eyeSpacing: string;
      mouthToNose: string;
    } | null;
  } | null>(null);

  useEffect(() => {
    devPanelOpenRef.current = devPanelOpen;
  }, [devPanelOpen]);

  const handleScanIdTap = () => {
    scanIdTapCountRef.current += 1;
    if (scanIdTapTimerRef.current !== null) {
      window.clearTimeout(scanIdTapTimerRef.current);
    }
    if (scanIdTapCountRef.current >= 5) {
      scanIdTapCountRef.current = 0;
      setDevPanelOpen((prev) => {
        const next = !prev;
        showToast(next ? 'Developer test panel enabled' : 'Developer test panel hidden');
        return next;
      });
      return;
    }
    scanIdTapTimerRef.current = window.setTimeout(() => {
      scanIdTapCountRef.current = 0;
    }, 2000);
  };

  const showDebugStrip = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  // Video & DOM refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);

  // Latest live-stream landmarks ref
  const latestLiveRef = useRef<{
    stepKey: GuidedStepKey;
    landmarks: NormalizedLandmark[];
    matrixData: number[] | null;
    blendshapes: Record<string, number> | null;
    quality: QualityCheckResult;
    ts: number;
  } | null>(null);

  // DOM telemetry refs (zero per-frame React state)
  const shutterBtnRef = useRef<HTMLButtonElement | null>(null);
  const shutterLabelRef = useRef<HTMLSpanElement | null>(null);
  const gateReasonRef = useRef<HTMLParagraphElement | null>(null);
  const poseRingRef = useRef<SVGCircleElement | null>(null);
  const yawBadgeRef = useRef<HTMLSpanElement | null>(null);
  const rollBadgeRef = useRef<HTMLSpanElement | null>(null);
  const lightBadgeRef = useRef<HTMLSpanElement | null>(null);
  const yawMarkerRef = useRef<HTMLDivElement | null>(null);

  const lastGateLevelRef = useRef<'PASS' | 'WARN' | 'BLOCK'>('BLOCK');
  const blockStartMsRef = useRef<number | null>(null);
  const helpAutoShownForStepRef = useRef<boolean>(false);

  // Keep synchronous busy ref aligned with reducer state
  useEffect(() => {
    busyRef.current = state.busy;
  }, [state.busy]);

  // Restore 30-min draft when starting a normal scan
  useEffect(() => {
    if (isAugmentMode) return;
    let cancelled = false;

    const restore = async () => {
      const now = Date.now();
      if (memoryDraft && memoryDraft.expiresAt > now && Object.keys(memoryDraft.captures).length > 0) {
        if (cancelled) return;
        const firstIncomplete = STEP_META.findIndex(
          (s) => memoryDraft?.captures[s.key]?.status !== 'accepted'
        );
        dispatch({
          type: 'RESTORE_DRAFT',
          captures: memoryDraft.captures,
          stepIndex: firstIncomplete >= 0 ? firstIncomplete : 2,
        });
        setDraftRestored(true);
        return;
      }

      try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as ScannerDraftPayload;
        if (!parsed || parsed.expiresAt <= now || !parsed.shots) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          return;
        }
        const rebuilt: Partial<Record<GuidedStepKey, StepEntry>> = {};
        for (const key of ['front', 'left', 'right'] as GuidedStepKey[]) {
          const shot = parsed.shots[key];
          if (!shot) continue;
          const canvas = await loadCanvasFromDataUrl(shot.stillDataUrl);
          rebuilt[key] = {
            status: 'accepted',
            captureStatus: shot.captureStatus ?? 'captured',
            image: shot.stillDataUrl,
            canvas,
            landmarks: shot.quality.landmarks,
            confidence: shot.quality.level === 'WARN' ? 'medium' : 'high',
            quality: shot.quality,
            previewUrl: shot.previewUrl,
            isMirrored: shot.isMirrored,
            note: shot.note,
          };
        }
        if (!cancelled && Object.keys(rebuilt).length > 0) {
          const firstIncomplete = STEP_META.findIndex((s) => !rebuilt[s.key]);
          dispatch({
            type: 'RESTORE_DRAFT',
            captures: rebuilt,
            stepIndex: firstIncomplete >= 0 ? firstIncomplete : 2,
          });
          setDraftRestored(true);
        }
      } catch {
        // Ignore corrupt draft
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [isAugmentMode]);

  // Reset per-step live caches and timers when changing step
  useEffect(() => {
    latestLiveRef.current = null;
    blockStartMsRef.current = null;
    helpAutoShownForStepRef.current = false;
    lastGateLevelRef.current = 'BLOCK';
    setRejectedStill(null);
  }, [state.stepIndex, isReviewing, state.finalReady]);

  // Engine lifecycle + unmount camera cleanup
  useEffect(() => {
    mountedRef.current = true;
    document.body.classList.add('ascend-scroll-lock');
    const unsub = subscribeScannerStatus(() => {
      if (mountedRef.current) setEngineStatus(getScannerState());
    });
    initFaceLandmarker().catch(() => {});

    return () => {
      mountedRef.current = false;
      document.body.classList.remove('ascend-scroll-lock');
      unsub();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      disposeFaceLandmarker();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (mountedRef.current) setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API unavailable in this browser context.');
      }
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
          audio: false,
        }),
        8000,
        'Camera start timed out. Check permissions or use upload.'
      );
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = stream;
      setCameraActive(true);
      dispatch({ type: 'CAMERA_LIVE' });
    } catch (err) {
      const denied =
        err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setCameraError(
        denied
          ? 'Camera permission denied. Allow camera access or upload photos instead.'
          : err instanceof Error
          ? err.message
          : 'Camera unavailable on this device. Use "Upload photo" instead.'
      );
      setCameraActive(false);
    }
  }, []);

  // Ensure camera starts when in capture phase and restarts if tracks died after preview/retake
  useEffect(() => {
    if (state.phase === 'capture' && !cameraActive && !cameraError) {
      startCamera().catch(() => {});
    } else if (state.phase === 'capture' && cameraActive && streamRef.current) {
      const hasLiveTrack = streamRef.current.getVideoTracks().some((t) => t.readyState === 'live');
      if (!hasLiveTrack && !cameraError) {
        startCamera().catch(() => {});
      }
    }
  }, [state.phase, cameraActive, cameraError, startCamera]);

  // Keep stream attached to persistent <video> element so Retake resumes immediately
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive, state.stepIndex, isReviewing, state.finalReady]);

  // Throttled (<= 15 fps) rAF detection loop with zero per-frame React state
  useEffect(() => {
    if (
      state.phase !== 'capture' ||
      !cameraActive ||
      isReviewing ||
      state.finalReady ||
      state.busy ||
      engineStatus.status !== 'ready'
    ) {
      return;
    }

    let rafId = 0;
    let lastTick = 0;
    const MIN_INTERVAL_MS = 72;

    const updateDomTelemetry = (q: QualityCheckResult, nowMs: number) => {
      if (yawBadgeRef.current) yawBadgeRef.current.textContent = `${Math.round(q.yawDeg)}°`;
      if (rollBadgeRef.current) rollBadgeRef.current.textContent = `${Math.round(q.rollDeg)}°`;
      if (lightBadgeRef.current) lightBadgeRef.current.textContent = `${Math.round(q.brightness)}`;

      if (yawMarkerRef.current) {
        const pct = Math.max(4, Math.min(96, 50 + (q.yawDeg / 75) * 46));
        yawMarkerRef.current.style.left = `${pct}%`;
      }

      if (poseRingRef.current) {
        const offset = RING_CIRCUMFERENCE * (1 - Math.max(0.04, Math.min(1, q.poseProgress)));
        poseRingRef.current.style.strokeDashoffset = `${offset}`;
        poseRingRef.current.style.stroke =
          q.level === 'PASS'
            ? '#10B981'
            : q.level === 'WARN'
            ? '#F59E0B'
            : q.expressionGate === 'BLOCK'
            ? '#F43F5E'
            : '#38BDF8';
      }

      if (lastGateLevelRef.current !== 'PASS' && q.level === 'PASS') {
        try {
          navigator.vibrate?.(35);
        } catch {
          // Ignore unsupported vibrate
        }
      }
      lastGateLevelRef.current = q.level;

      if (q.level === 'BLOCK') {
        if (blockStartMsRef.current === null) {
          blockStartMsRef.current = nowMs;
        } else if (
          nowMs - blockStartMsRef.current >= STUCK_HELP_MS &&
          !helpAutoShownForStepRef.current
        ) {
          helpAutoShownForStepRef.current = true;
          setShowHelpSheet(true);
        }
      } else {
        blockStartMsRef.current = null;
      }

      if (shutterBtnRef.current && shutterLabelRef.current && !busyRef.current) {
        const isDisabled = q.level === 'BLOCK';
        shutterBtnRef.current.disabled = isDisabled;
        shutterBtnRef.current.setAttribute('data-level', q.level);

        if (q.level === 'PASS') {
          shutterBtnRef.current.className =
            'flex-1 py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#03150E] font-bold text-sm min-h-[48px] flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20';
          shutterLabelRef.current.textContent = 'Capture Angle';
        } else if (q.level === 'WARN') {
          shutterBtnRef.current.className =
            'flex-1 py-3.5 px-4 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-black font-bold text-sm min-h-[48px] flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/15';
          shutterLabelRef.current.textContent =
            q.expressionGate === 'WARN' ? 'Capture (relax face)' : 'Capture (lower accuracy)';
        } else {
          shutterBtnRef.current.className =
            'flex-1 py-3.5 px-4 rounded-2xl bg-white/10 text-slate-300 font-semibold text-sm min-h-[48px] flex items-center justify-center gap-2 transition opacity-55 cursor-not-allowed';
          shutterLabelRef.current.textContent =
            q.expressionGate === 'BLOCK' ? 'Neutral face required' : 'Capture Angle';
        }
      }

      if (gateReasonRef.current) {
        gateReasonRef.current.textContent = q.primaryInstruction;
        gateReasonRef.current.className =
          q.level === 'PASS'
            ? 'text-sm sm:text-base font-bold text-emerald-400 text-center min-h-[24px]'
            : q.level === 'WARN'
            ? 'text-sm sm:text-base font-semibold text-amber-300 text-center min-h-[24px]'
            : q.expressionGate === 'BLOCK'
            ? 'text-sm sm:text-base font-semibold text-rose-300 text-center min-h-[24px]'
            : 'text-sm sm:text-base font-semibold text-sky-200 text-center min-h-[24px]';
      }

      // Only update React devTelemetry state when hidden dev panel is toggled ON (throttled ~4 Hz)
      if (devPanelOpenRef.current && nowMs - devLastSyncMsRef.current >= 240) {
        devLastSyncMsRef.current = nowMs;
        const anglesAccepted =
          (state.captures.front.status === 'accepted' ? 1 : 0) +
          (state.captures.left.status === 'accepted' ? 1 : 0) +
          (state.captures.right.status === 'accepted' ? 1 : 0);

        let rawMetrics: NonNullable<typeof devTelemetry>['rawMetrics'] = null;
        if (q.landmarks && q.landmarks.length >= 468) {
          const lm = q.landmarks;
          const dist = (aIdx: number, bIdx: number) =>
            Math.hypot((lm[aIdx].x - lm[bIdx].x) * 480, (lm[aIdx].y - lm[bIdx].y) * 360);
          const cheekW = Math.max(1, dist(234, 454));
          const jawW = Math.max(1, dist(172, 397));
          const upperH = Math.max(1, dist(9, 0));
          const noseW = Math.max(1, dist(129, 358));
          const mouthW = dist(61, 291);
          const avgEyeW = Math.max(1, (dist(33, 133) + dist(362, 263)) / 2);
          const eyeSpace = dist(133, 362) / avgEyeW;
          const ipd = Math.max(1, dist(33, 263) * 0.65);
          const hairY = Math.max(0.02, lm[10].y - (ipd * 0.54) / 360);
          const u3 = Math.max(0.01, lm[9].y - hairY);
          const m3 = Math.max(0.01, lm[2].y - lm[9].y);
          const l3 = Math.max(0.01, lm[152].y - lm[2].y);
          const tot3 = u3 + m3 + l3;
          const lTilt = (Math.atan2(lm[133].y - lm[33].y, Math.max(1e-4, lm[133].x - lm[33].x)) * 180) / Math.PI;
          const rTilt = (Math.atan2(lm[362].y - lm[263].y, Math.max(1e-4, lm[263].x - lm[362].x)) * 180) / Math.PI;
          rawMetrics = {
            thirds: `${Math.round((u3 / tot3) * 100)}/${Math.round((m3 / tot3) * 100)}/${Math.round((l3 / tot3) * 100)}`,
            fwhr: (cheekW / upperH).toFixed(2),
            jawToCheek: (jawW / cheekW).toFixed(2),
            canthalDeg: ((lTilt + rTilt) / 2).toFixed(1),
            eyeSpacing: eyeSpace.toFixed(2),
            mouthToNose: (mouthW / noseW).toFixed(2),
          };
        }

        setDevTelemetry({
          expressionScore: q.expressionScore,
          expressionGate: q.expressionGate,
          expressionCue: q.expressionCue,
          scanConfidence: computeScanConfidenceFactor({
            frontQuality: q,
            anglesCount: Math.max(1, anglesAccepted),
          }),
          yawDeg: q.yawDeg,
          rollDeg: q.rollDeg,
          pitchDeg: q.pitchDeg,
          brightness: q.brightness,
          sharpness: q.sharpness,
          faceWidthFrac: q.faceWidthFrac,
          blendshapes: q.blendshapes ?? null,
          rawMetrics,
        });
      }
    };

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (document.hidden || now - lastTick < MIN_INTERVAL_MS) return;
      lastTick = now;

      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const detected = detectLandmarksFromVideo(video);
      if (!detected) return;

      const targetW = 640;
      const targetH = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * targetW);
      if (overlay.width !== targetW || overlay.height !== targetH) {
        overlay.width = targetW;
        overlay.height = targetH;
      }

      const quality = evaluateLandmarksQuality(
        detected.sampleCanvas,
        detected.landmarks,
        currentStep.key as ScanAngleStep,
        detected.matrixData,
        detected.blendshapes
      );

      if (detected.landmarks && detected.landmarks.length >= 468) {
        latestLiveRef.current = {
          stepKey: currentStep.key,
          landmarks: detected.landmarks,
          matrixData: detected.matrixData,
          blendshapes: detected.blendshapes,
          quality,
          ts: Date.now(),
        };
      }

      updateDomTelemetry(quality, now);

      const octx = overlay.getContext('2d');
      if (octx) {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        if (detected.landmarks && detected.landmarks.length >= 468) {
          drawBiometricMeshOverlay(
            octx,
            overlay.width,
            overlay.height,
            detected.landmarks,
            quality.level === 'PASS'
          );
        }
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [
    state.phase,
    state.busy,
    state.finalReady,
    cameraActive,
    isReviewing,
    engineStatus.status,
    currentStep.key,
  ]);

  /**
   * Capture handler: grabs the video frame unmirrored and runs still landmark + blendshape
   * evaluation directly on the captured still so non-neutral expressions cannot sneak past.
   * Rejects the still with an explicit reason + Retake button if expressionGate === 'BLOCK'.
   */
  const handleManualCapture = async () => {
    if (busyRef.current || state.busy) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      const msg = 'Camera frame is still warming up. Hold steady for a moment and try again.';
      dispatch({ type: 'CAPTURE_FAILED', reason: msg });
      showToast(msg, 'warning');
      return;
    }

    setRejectedStill(null);
    busyRef.current = true;
    dispatch({ type: 'CAPTURE_START' });

    try {
      // Grab current frame UNMIRRORED so landmark coords & yaw sign match live detection
      const stillCanvas = document.createElement('canvas');
      stillCanvas.width = video.videoWidth;
      stillCanvas.height = video.videoHeight;
      const ctx = stillCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to read camera frame buffer.');
      }
      ctx.drawImage(video, 0, 0, stillCanvas.width, stillCanvas.height);

      const liveSnapshot = latestLiveRef.current;
      const hasFreshLiveLandmarks =
        Boolean(liveSnapshot) &&
        liveSnapshot?.stepKey === currentStep.key &&
        Date.now() - liveSnapshot.ts <= 2000 &&
        liveSnapshot.landmarks.length >= 468;

      let quality: QualityCheckResult;
      let captureStatus: 'captured' | 'captured, landmarks missing' = 'captured';
      let note: string | undefined;

      // Always verify blendshapes + expression on the captured still first
      try {
        const detectedQuality = await withTimeout(
          analyzeFrameWithLandmarker(stillCanvas, currentStep.key as ScanAngleStep),
          CAPTURE_TIMEOUT_MS,
          'Face detection timed out after 4s.'
        );
        if (detectedQuality.landmarks && detectedQuality.landmarks.length >= 468) {
          quality = detectedQuality;
        } else if (hasFreshLiveLandmarks && liveSnapshot) {
          quality = evaluateLandmarksQuality(
            stillCanvas,
            liveSnapshot.landmarks,
            currentStep.key as ScanAngleStep,
            liveSnapshot.matrixData,
            liveSnapshot.blendshapes
          );
        } else {
          captureStatus = 'captured, landmarks missing';
          note = 'Face not detected on this photo, retake or continue with lower accuracy';
          quality = buildFallbackQuality(stillCanvas, currentStep.key as ScanAngleStep);
        }
      } catch {
        if (hasFreshLiveLandmarks && liveSnapshot) {
          quality = evaluateLandmarksQuality(
            stillCanvas,
            liveSnapshot.landmarks,
            currentStep.key as ScanAngleStep,
            liveSnapshot.matrixData,
            liveSnapshot.blendshapes
          );
        } else {
          captureStatus = 'captured, landmarks missing';
          note = 'Face not detected on this photo, retake or continue with lower accuracy';
          quality = buildFallbackQuality(stillCanvas, currentStep.key as ScanAngleStep);
        }
      }

      // Hard reject if the captured still failed neutral-expression gate
      if (quality.expressionGate === 'BLOCK') {
        const cueLabel = quality.expressionCue ? ` (${quality.expressionCue})` : '';
        const rejectReason = `Neutral face please: mouth closed, relax your forehead${cueLabel}`;
        const previewUrl = buildMeshPreviewUrl(stillCanvas, quality);
        if (!mountedRef.current) return;
        setRejectedStill({
          previewUrl,
          reason: rejectReason,
          expressionScore: quality.expressionScore,
          cue: quality.expressionCue,
          isMirrored: true,
        });
        dispatch({ type: 'CAPTURE_FAILED', reason: rejectReason });
        showToast(rejectReason, 'warning');
        return;
      }

      // Allow manual pose warnings (45° side wobble) to pass as WARN without overriding expression check
      if (quality.level === 'BLOCK') {
        quality = {
          ...quality,
          level: 'WARN',
          passed: true,
          warnDomains: Array.from(new Set([...quality.warnDomains, 'pose'])),
          primaryInstruction: quality.primaryInstruction || 'Captured with pose warning',
        };
      }

      const previewUrl = buildMeshPreviewUrl(stillCanvas, quality);
      const imageData = canvasToCompactDataUrl(stillCanvas);

      if (!mountedRef.current) return;
      dispatch({
        type: 'CAPTURE_SUCCESS',
        imageData,
        canvas: stillCanvas,
        landmarks: quality.landmarks,
        confidence:
          captureStatus === 'captured, landmarks missing'
            ? 'low'
            : quality.level === 'WARN'
            ? 'medium'
            : 'high',
        quality,
        previewUrl,
        captureStatus,
        isMirrored: true,
        note:
          note ??
          (quality.expressionGate === 'WARN'
            ? `Relax your face a little${quality.expressionCue ? ` — ${quality.expressionCue}` : ''}`
            : undefined),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const reason = err instanceof Error ? err.message : 'Capture failed. Please retry.';
      dispatch({ type: 'CAPTURE_FAILED', reason });
      showToast(reason, 'warning');
    } finally {
      busyRef.current = false;
    }
  };

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busyRef.current || state.busy) return;

    setRejectedStill(null);
    setCameraError(null);
    setShowHelpSheet(false);
    busyRef.current = true;
    dispatch({ type: 'CAPTURE_START' });

    const reader = new FileReader();
    reader.onerror = () => {
      busyRef.current = false;
      const reason = 'Could not read selected image file.';
      dispatch({ type: 'CAPTURE_FAILED', reason });
      showToast(reason, 'warning');
    };
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        busyRef.current = false;
        const reason = 'Unsupported image file. Choose a JPG or PNG photo.';
        dispatch({ type: 'CAPTURE_FAILED', reason });
        showToast(reason, 'warning');
      };
      img.onload = async () => {
        try {
          const maxDim = 960;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Unable to draw uploaded image.');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          let quality: QualityCheckResult;
          let captureStatus: 'captured' | 'captured, landmarks missing' = 'captured';
          let note: string | undefined;

          try {
            const detectedQuality = await withTimeout(
              analyzeFrameWithLandmarker(canvas, currentStep.key as ScanAngleStep),
              CAPTURE_TIMEOUT_MS,
              'Photo detection timed out after 4s.'
            );
            if (detectedQuality.landmarks && detectedQuality.landmarks.length >= 468) {
              quality = detectedQuality;
            } else {
              captureStatus = 'captured, landmarks missing';
              note = 'Face not detected on this photo, retake or continue with lower accuracy';
              quality = buildFallbackQuality(canvas, currentStep.key as ScanAngleStep);
            }
          } catch {
            captureStatus = 'captured, landmarks missing';
            note = 'Face not detected on this photo, retake or continue with lower accuracy';
            quality = buildFallbackQuality(canvas, currentStep.key as ScanAngleStep);
          }

          if (quality.expressionGate === 'BLOCK') {
            const cueLabel = quality.expressionCue ? ` (${quality.expressionCue})` : '';
            const rejectReason = `Neutral face please: mouth closed, relax your forehead${cueLabel}`;
            const previewUrl = buildMeshPreviewUrl(canvas, quality);
            if (!mountedRef.current) return;
            setRejectedStill({
              previewUrl,
              reason: rejectReason,
              expressionScore: quality.expressionScore,
              cue: quality.expressionCue,
              isMirrored: false,
            });
            dispatch({ type: 'CAPTURE_FAILED', reason: rejectReason });
            showToast(rejectReason, 'warning');
            return;
          }

          if (quality.level === 'BLOCK') {
            quality = {
              ...quality,
              level: 'WARN',
              passed: true,
              warnDomains: Array.from(new Set([...quality.warnDomains, 'pose'])),
              primaryInstruction: quality.primaryInstruction || 'Captured with pose warning',
            };
          }

          const previewUrl = buildMeshPreviewUrl(canvas, quality);
          const imageData = canvasToCompactDataUrl(canvas);
          if (!mountedRef.current) return;
          dispatch({
            type: 'CAPTURE_SUCCESS',
            imageData,
            canvas,
            landmarks: quality.landmarks,
            confidence:
              captureStatus === 'captured, landmarks missing'
                ? 'low'
                : quality.level === 'WARN'
                ? 'medium'
                : 'high',
            quality,
            previewUrl,
            captureStatus,
            isMirrored: false,
            note:
              note ??
              (quality.expressionGate === 'WARN'
                ? `Relax your face a little${quality.expressionCue ? ` — ${quality.expressionCue}` : ''}`
                : undefined),
          });
        } catch (err) {
          if (!mountedRef.current) return;
          const reason = err instanceof Error ? err.message : 'Unable to inspect uploaded image.';
          dispatch({ type: 'CAPTURE_FAILED', reason });
          showToast(reason, 'warning');
        } finally {
          busyRef.current = false;
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const runAnalysisPipeline = useCallback(async () => {
    stopCamera();
    try {
      let frontQuality: QualityCheckResult | null = null;
      const frontEntry = state.captures.front;

      if (frontEntry.status === 'accepted' && frontEntry.quality?.landmarks?.length) {
        frontQuality = frontEntry.quality;
      } else if (frontEntry.status === 'accepted' && frontEntry.canvas) {
        dispatch({ type: 'ANALYZE_PROGRESS', pct: 25, message: 'Verifying Front landmarks...' });
        frontQuality = await withTimeout(
          analyzeFrameWithLandmarker(frontEntry.canvas, 'front'),
          CAPTURE_TIMEOUT_MS,
          'Front landmark detection timed out. Retake Front or upload a clearer photo.'
        );
      } else if (augmentScan?.savedFrontSnapshot) {
        frontQuality = snapshotToQualityResult(augmentScan.savedFrontSnapshot);
      }

      if (!frontQuality || !frontQuality.landmarks || frontQuality.landmarks.length < 468) {
        throw new Error(
          'Front photo needs a detectable face to compute ratios. Tap Back to Camera and retake Front.'
        );
      }

      dispatch({ type: 'ANALYZE_PROGRESS', pct: 48, message: 'Measuring facial angles...' });

      const leftEntry = state.captures.left;
      const leftQuality =
        leftEntry.status === 'accepted' && leftEntry.quality?.landmarks?.length
          ? leftEntry.quality
          : augmentScan?.savedLeftSnapshot
          ? snapshotToQualityResult(augmentScan.savedLeftSnapshot)
          : null;

      const rightEntry = state.captures.right;
      const rightQuality =
        rightEntry.status === 'accepted' && rightEntry.quality?.landmarks?.length
          ? rightEntry.quality
          : augmentScan?.savedRightSnapshot
          ? snapshotToQualityResult(augmentScan.savedRightSnapshot)
          : null;

      dispatch({ type: 'ANALYZE_PROGRESS', pct: 78, message: 'Applying confidence-weighted averages...' });

      const result = computeFullScanResult({
        frontCanvas: frontEntry.canvas ?? null,
        frontQuality,
        frontSkinStatsOverride: !frontEntry.canvas ? augmentScan?.savedFrontSnapshot?.skinStats : undefined,
        leftCanvas: leftEntry.status === 'accepted' ? leftEntry.canvas ?? null : null,
        leftQuality,
        rightCanvas: rightEntry.status === 'accepted' ? rightEntry.canvas ?? null : null,
        rightQuality,
        saveThumbnails,
        preserveFrontThumbnail: !frontEntry.canvas ? augmentScan?.frontThumbnail : undefined,
        preserveLeftThumbnail: leftEntry.status !== 'accepted' ? augmentScan?.leftThumbnail : undefined,
        preserveRightThumbnail: rightEntry.status !== 'accepted' ? augmentScan?.rightThumbnail : undefined,
      });

      dispatch({ type: 'ANALYZE_PROGRESS', pct: 94, message: 'Saving measurements locally...' });

      let finalScanId: number;
      if (isAugmentMode && augmentScan?.id) {
        await withTimeout(
          db.scans.update(augmentScan.id, {
            ...result,
            id: augmentScan.id,
            date: augmentScan.date,
          }),
          CAPTURE_TIMEOUT_MS,
          'Saving updated report timed out.'
        );
        finalScanId = augmentScan.id;
      } else {
        finalScanId = Number(
          await withTimeout(db.scans.add(result), CAPTURE_TIMEOUT_MS, 'Saving report timed out.')
        );
        clearScannerDraft();
      }

      await db.profile.update('me', { detectedFaceShape: result.faceShape, updatedAt: Date.now() });
      await recalculateXpAndBadges().catch(() => {});

      if (!mountedRef.current) return;
      dispatch({ type: 'ANALYZE_DONE' });
      showToast(isAugmentMode ? 'Report updated with side photos' : 'Facial report generated');
      onScanSaved(finalScanId);
    } catch (err) {
      if (!mountedRef.current) return;
      const reason = err instanceof Error ? err.message : 'Photo analysis failed.';
      dispatch({ type: 'ANALYZE_FAILED', reason });
      showToast(reason, 'warning');
    }
  }, [augmentScan, isAugmentMode, onScanSaved, saveThumbnails, showToast, state.captures, stopCamera]);

  // Persist draft whenever an accepted capture is committed
  useEffect(() => {
    if (isAugmentMode || state.phase !== 'capture') return;
    if (
      state.captures.front.status === 'accepted' ||
      state.captures.left.status === 'accepted' ||
      state.captures.right.status === 'accepted'
    ) {
      saveScannerDraft(state.captures, state.stepIndex);
    }
  }, [isAugmentMode, state.captures, state.phase, state.stepIndex]);

  const handleAccept = () => {
    if (busyRef.current || state.busy || !state.pendingReview) return;
    dispatch({ type: 'ACCEPT', expectedStepIndex: state.stepIndex });
  };

  const handleRetake = () => {
    if (busyRef.current || state.busy) return;
    setRejectedStill(null);
    dispatch({ type: 'RETAKE' });
  };

  const handleSkip = () => {
    if (busyRef.current || state.busy) return;
    dispatch({ type: 'SKIP', expectedStepIndex: state.stepIndex });
  };

  const handleBack = () => {
    if (busyRef.current || state.busy) return;
    dispatch({ type: 'BACK', expectedStepIndex: state.stepIndex });
  };

  const handleFinish = () => {
    if (busyRef.current || state.busy) return;
    if (state.captures.front.status !== 'accepted' && !isAugmentMode) {
      showToast('Capture Front (0°) first before viewing your report.', 'warning');
      return;
    }
    dispatch({ type: 'FINISH', allowWithoutFront: isAugmentMode });
  };

  // Run analysis pipeline cleanly once reducer enters analyzing phase
  useEffect(() => {
    if (state.phase === 'analyzing' && !state.analyzeError && state.analyzePct === 12) {
      runAnalysisPipeline();
    }
  }, [state.phase, state.analyzeError, state.analyzePct, runAnalysisPipeline]);

  const handleExit = () => {
    if (!isAugmentMode) {
      saveScannerDraft(state.captures, state.stepIndex);
    }
    stopCamera();
    document.body.classList.remove('ascend-scroll-lock');
    onCancel();
  };

  const frontAccepted = state.captures.front.status === 'accepted' || isAugmentMode;
  const canJumpToStep = (idx: number): boolean => {
    if (state.phase === 'analyzing' || state.busy) return false;
    if (idx === 0) return true;
    return frontAccepted || state.captures[STEP_META[idx].key].status !== 'idle' || idx <= state.stepIndex;
  };

  const overlay = (
    <div className="fixed inset-0 z-50 bg-[#05080A] text-white flex flex-col">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        disabled={state.phase === 'analyzing' || state.busy}
        onChange={handleUploadPhoto}
        className="hidden"
      />

      {/* Top Bar + 3-Dot Progress Indicator (Front · Left · Right) */}
      <header className="relative z-20 shrink-0 bg-[#0B110E]/95 backdrop-blur-xl border-b border-emerald-500/15 px-3 py-2.5 space-y-2">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Exit scanner"
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.96] flex items-center justify-center shrink-0 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center min-w-0">
            <h1 className="font-display text-sm sm:text-base font-bold truncate">
              {state.phase === 'analyzing'
                ? 'Analyzing your photos'
                : state.finalReady
                ? 'Ready for Your Report'
                : isAugmentMode
                ? `Add Side Photos · ${currentStep.title}`
                : `Face Scanner · ${currentStep.title}`}
            </h1>
            <p className="text-[11px] text-slate-400 truncate flex items-center justify-center gap-1.5">
              <span>
                {draftRestored
                  ? 'Draft restored · 100% on-device'
                  : '100% on-device · Only Front is required'}
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={handleScanIdTap}
                className="font-mono-num text-slate-400 hover:text-slate-200 focus:outline-none select-none"
                title="Scan ID"
              >
                Scan ID: {sessionScanId}
              </button>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHelpSheet(true)}
            aria-label="Camera tips and upload help"
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.96] flex items-center justify-center shrink-0 transition"
          >
            <HelpCircle className="w-5 h-5 text-slate-300" />
          </button>
        </div>

        {/* Tappable Progress Dots: Front · Left · Right */}
        <div className="max-w-md mx-auto flex items-center justify-center gap-2">
          {STEP_META.map((s, idx) => {
            const entry = state.captures[s.key];
            const done = entry.status === 'accepted';
            const skipped = entry.status === 'skipped';
            const active = state.phase === 'capture' && !state.finalReady && idx === state.stepIndex;
            const clickable = canJumpToStep(idx);
            return (
              <React.Fragment key={s.key}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => dispatch({ type: 'GO_TO', step: idx })}
                  title={done ? `Go to ${s.shortTitle} (retake or view)` : s.shortTitle}
                  className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition active:scale-[0.97] ${
                    active
                      ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                      : done
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/25'
                      : skipped
                      ? 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/15'
                      : 'bg-white/[0.04] border-white/10 text-slate-400 disabled:opacity-50'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      active
                        ? 'bg-emerald-400 animate-pulse'
                        : done
                        ? 'bg-emerald-400'
                        : skipped
                        ? 'bg-amber-400'
                        : 'bg-slate-600'
                    }`}
                  />
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  <span>{s.shortTitle}</span>
                </button>
                {idx < STEP_META.length - 1 && (
                  <span className="w-4 h-px bg-white/15 shrink-0" aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      {state.phase === 'analyzing' ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-5">
          <div className="w-full max-w-md rounded-[28px] bg-[#0B120F] border border-emerald-500/25 p-6 space-y-5 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center mx-auto">
              {state.analyzeError ? (
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              ) : (
                <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
              )}
            </div>

            <div className="space-y-1.5">
              <h2 className="font-display text-lg font-bold">
                {state.analyzeError ? 'Analysis Interrupted' : 'Analyzing your photos'}
              </h2>
              <p className="text-xs text-slate-400">
                {state.analyzeError || state.analyzeMessage}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono-num text-emerald-300">
                <span>On-device landmark pipeline</span>
                <span>{state.analyzePct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${state.analyzePct}%` }}
                />
              </div>
            </div>

            {state.analyzeError && (
              <div className="flex flex-wrap gap-2 justify-center pt-1">
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'FINISH', allowWithoutFront: isAugmentMode })}
                  className="px-4 py-3 rounded-xl bg-emerald-500 active:scale-[0.98] text-[#03150E] text-xs font-bold min-h-[48px] flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Retry Analysis
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'ANALYZE_BACK_TO_CAMERA' })}
                  className="px-4 py-3 rounded-xl bg-white/10 active:scale-[0.98] text-xs font-semibold min-h-[48px]"
                >
                  Back to Camera
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col max-w-2xl w-full mx-auto p-2.5 sm:p-4 gap-2.5 overflow-y-auto overscroll-y-contain">
          {/* Guidance & Live Metrics Strip (hidden on Final Summary card) */}
          {!state.finalReady && (
            <div className="shrink-0 rounded-2xl bg-[#0B120F] border border-emerald-500/20 px-3.5 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-200 leading-snug">
                  {currentStep.instruction}
                </p>
                {currentStep.key === 'left' && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-400/35 text-[11px] font-bold text-sky-300">
                    Turn RIGHT <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
                {currentStep.key === 'right' && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-400/35 text-[11px] font-bold text-sky-300">
                    <ArrowLeft className="w-3.5 h-3.5" /> Turn LEFT
                  </span>
                )}
              </div>

              {(currentStep.key === 'left' || currentStep.key === 'right') && (
                <div className="space-y-1">
                  <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-400/35 border-x border-emerald-400"
                      style={
                        currentStep.key === 'left'
                          ? { left: '16%', width: '16%' }
                          : { left: '68%', width: '16%' }
                      }
                    />
                    <div
                      ref={yawMarkerRef}
                      className="absolute top-0 bottom-0 w-1.5 -ml-[3px] rounded-full bg-white shadow"
                      style={{ left: '50%' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono-num text-slate-400">
                    <span>Right turn 55°</span>
                    <span>0° Center</span>
                    <span>Left turn 55°</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5 text-[10.5px] font-mono-num">
                <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-center">
                  <span className="text-slate-400">YAW </span>
                  <span ref={yawBadgeRef} className="text-white font-bold">0°</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-center">
                  <span className="text-slate-400">ROLL </span>
                  <span ref={rollBadgeRef} className="text-white font-bold">0°</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-center">
                  <span className="text-slate-400">LIGHT </span>
                  <span ref={lightBadgeRef} className="text-white font-bold">0</span>
                </div>
              </div>
            </div>
          )}

          {/* Engine Load Error Banner */}
          {engineStatus.status === 'error' && (
            <div className="relative z-20 shrink-0 p-3 rounded-2xl bg-rose-950/90 border border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-rose-200">{engineStatus.error || 'Local Face Landmarker failed to load.'}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => initFaceLandmarker(true)}
                  className="px-3 py-2 rounded-xl bg-rose-500 text-white font-semibold min-h-[40px]"
                >
                  Retry Model
                </button>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white font-semibold min-h-[40px]"
                >
                  Use upload instead
                </button>
              </div>
            </div>
          )}

          {/* Camera Viewport / Preview Overlay / Final Ready Summary */}
          <div className="relative z-0 flex-1 min-h-[260px] rounded-[24px] overflow-hidden bg-black border border-emerald-500/20">
            {/* Persistent <video> & mesh <canvas> remain mounted so Retake/Next never drops camera stream */}
            {cameraActive && (
              <div
                className={
                  isReviewing || state.finalReady
                    ? 'absolute inset-0 opacity-0 pointer-events-none'
                    : 'absolute inset-0'
                }
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1] touch-none pointer-events-none"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
                />
                <svg
                  viewBox="0 0 300 380"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <circle
                    cx="150"
                    cy="185"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.14)"
                    strokeWidth="3.5"
                  />
                  <circle
                    ref={poseRingRef}
                    cx="150"
                    cy="185"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * 0.9}
                    transform="rotate(-90 150 185)"
                    style={{ transition: 'stroke-dashoffset 120ms linear, stroke 180ms ease' }}
                  />
                  {currentStep.key === 'front' && (
                    <ellipse
                      cx="150"
                      cy="185"
                      rx="76"
                      ry="98"
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.35)"
                      strokeWidth="1.25"
                      strokeDasharray="5 5"
                    />
                  )}
                </svg>
              </div>
            )}

            {/* Final Step Complete Summary Card */}
            {state.finalReady ? (
              <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-5 text-center gap-4 bg-[#070D0A]">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
                  <FileCheck2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-bold">Angles Ready</h2>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Tap &quot;See my report&quot; to compute your facial symmetry, proportions, and score.
                  </p>
                </div>

                <div className="w-full max-w-sm grid grid-cols-3 gap-2">
                  {STEP_META.map((s, idx) => {
                    const st = state.captures[s.key];
                    const isAccepted = st.status === 'accepted';
                    const missingLm = st.captureStatus === 'captured, landmarks missing';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => dispatch({ type: 'GO_TO', step: idx })}
                        className={`p-2.5 rounded-xl border text-left transition active:scale-[0.98] ${
                          isAccepted
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-white/[0.04] border-white/10'
                        }`}
                      >
                        <p className="text-xs font-bold text-white">{s.shortTitle}</p>
                        <p
                          className={`text-[10.5px] mt-0.5 ${
                            isAccepted
                              ? missingLm
                                ? 'text-amber-300'
                                : 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isAccepted ? (missingLm ? 'Lower acc.' : 'Captured') : 'Skipped'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : rejectedStill ? (
              <div className="relative z-10 w-full h-full bg-black">
                <img
                  src={rejectedStill.previewUrl}
                  alt={`Rejected ${currentStep.title} still`}
                  className={`w-full h-full object-cover pointer-events-none opacity-80 ${
                    rejectedStill.isMirrored ? 'scale-x-[-1]' : ''
                  }`}
                />
                <div className="absolute inset-x-3 bottom-3 p-3 rounded-2xl bg-rose-950/90 border border-rose-400/50 backdrop-blur-md text-xs space-y-1">
                  <p className="font-bold text-rose-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    Capture Rejected — Non-Neutral Expression
                  </p>
                  <p className="text-rose-100 leading-snug">{rejectedStill.reason}</p>
                </div>
              </div>
            ) : isReviewing && state.pendingReview?.previewUrl ? (
              <div className="relative z-10 w-full h-full bg-black">
                <img
                  src={state.pendingReview.previewUrl}
                  alt={`Captured ${currentStep.title} preview`}
                  className={`w-full h-full object-cover pointer-events-none ${
                    state.pendingReview.isMirrored ? 'scale-x-[-1]' : ''
                  }`}
                />
              </div>
            ) : !cameraActive ? (
              <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center">
                  <ScanFace className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm font-bold">
                  {cameraError ? 'Camera Permission Needed' : 'Starting Camera...'}
                </p>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  {cameraError || 'Allow camera access or upload a photo for this angle.'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold min-h-[48px] active:scale-[0.98]"
                  >
                    <Camera className="w-4 h-4 text-sky-400" /> Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-emerald-500 text-[#03150E] text-xs font-bold min-h-[48px] active:scale-[0.98]"
                  >
                    <Upload className="w-4 h-4" /> Use upload instead
                  </button>
                </div>
              </div>
            ) : null}

            {engineStatus.status === 'loading' && cameraActive && !isReviewing && !state.finalReady && (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 border border-white/15 text-[11px] flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-emerald-400" /> Loading local landmarks model...
              </div>
            )}
          </div>

          {/* Control Bar (higher z-index + safe area bottom padding so taps never miss) */}
          <div className="relative z-30 shrink-0 rounded-[24px] bg-[#0B120F] border border-emerald-500/20 p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5">
            {state.error && (
              <div className="pointer-events-none p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between gap-2 text-xs text-amber-200">
                <span>{state.error}</span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
                  className="pointer-events-auto px-3 py-1.5 rounded-lg bg-amber-400 text-black font-bold shrink-0 min-h-[34px]"
                >
                  Dismiss
                </button>
              </div>
            )}

            {state.finalReady ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={state.busy}
                  onClick={handleFinish}
                  className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#03150E] font-bold text-base min-h-[52px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" /> See my report
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={state.busy}
                    onClick={handleBack}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    disabled={state.busy}
                    onClick={() => dispatch({ type: 'RETAKE', stepKey: 'right' })}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" /> Retake Right
                  </button>
                </div>
              </div>
            ) : rejectedStill ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="font-semibold text-rose-300">
                    {rejectedStill.reason}
                  </span>
                  <span className="text-slate-400 font-mono-num text-[11px]">
                    Expr {rejectedStill.expressionScore.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRejectedStill(null);
                    dispatch({ type: 'CLEAR_ERROR' });
                  }}
                  className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 active:scale-[0.98] text-white text-xs font-bold min-h-[48px] flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" /> Retake with Neutral Face
                </button>
              </div>
            ) : isReviewing && state.pendingReview ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span
                    className={`font-semibold ${
                      state.pendingReview.captureStatus === 'captured, landmarks missing' ||
                      state.pendingReview.quality?.level === 'WARN'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                    }`}
                  >
                    {state.pendingReview.captureStatus === 'captured, landmarks missing'
                      ? 'Captured (lower accuracy — landmarks missing)'
                      : state.pendingReview.quality?.expressionGate === 'WARN'
                      ? `Relax your face a little${
                          state.pendingReview.quality.expressionCue
                            ? ` — ${state.pendingReview.quality.expressionCue}`
                            : ''
                        } (lower confidence)`
                      : state.pendingReview.quality?.level === 'WARN'
                      ? 'Captured with lower-accuracy note'
                      : 'Photo ready'}
                  </span>
                  {state.pendingReview.quality && (
                    <span className="text-slate-400 font-mono-num text-[11px]">
                      Yaw {Math.round(state.pendingReview.quality.yawDeg)}° · Expr{' '}
                      {(state.pendingReview.quality.expressionScore ?? 0).toFixed(2)} · Light{' '}
                      {Math.round(state.pendingReview.quality.brightness)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={state.busy}
                    onClick={handleRetake}
                    className="py-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button
                    type="button"
                    disabled={state.busy}
                    onClick={handleAccept}
                    className="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#03150E] text-xs font-bold min-h-[48px] flex items-center justify-center gap-1.5 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Use this photo
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p
                  ref={gateReasonRef}
                  className="text-sm sm:text-base font-semibold text-sky-200 text-center min-h-[24px]"
                >
                  {cameraActive ? 'Align your face inside the ring' : 'Enable camera or upload a photo'}
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    ref={shutterBtnRef}
                    type="button"
                    onClick={handleManualCapture}
                    disabled={!cameraActive || engineStatus.status !== 'ready' || state.busy}
                    className="flex-1 py-3.5 px-4 rounded-2xl bg-white/10 text-slate-300 font-semibold text-sm min-h-[48px] flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {state.busy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Capturing...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span ref={shutterLabelRef}>Capture Angle</span>
                      </>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {state.stepIndex > 0 && (
                      <button
                        type="button"
                        disabled={state.busy}
                        onClick={handleBack}
                        className="px-3.5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1"
                      >
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={state.busy}
                      onClick={() => uploadInputRef.current?.click()}
                      className="flex-1 sm:flex-initial px-3.5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1.5"
                    >
                      <Upload className="w-4 h-4 text-emerald-400" /> Upload photo
                    </button>

                    {currentStep.optional && (
                      <button
                        type="button"
                        disabled={state.busy}
                        onClick={handleSkip}
                        className="flex-1 sm:flex-initial px-3.5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-xs font-semibold min-h-[48px] flex items-center justify-center gap-1.5"
                      >
                        <SkipForward className="w-4 h-4" /> Skip for now
                      </button>
                    )}

                    {frontAccepted && state.stepIndex > 0 && (
                      <button
                        type="button"
                        disabled={state.busy}
                        onClick={handleFinish}
                        className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 active:scale-[0.98] text-emerald-300 text-xs font-bold min-h-[48px] flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Finish / Analyze
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Hidden Developer Test Panel (toggled by tapping Scan ID 5 times) */}
            {devPanelOpen && (
              <div className="pt-2.5 border-t border-emerald-500/25 space-y-2 text-[10.5px] font-mono-num">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider">
                    Dev Panel · {sessionScanId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDevPanelOpen(false)}
                    className="px-2 py-0.5 rounded bg-white/10 text-slate-300 hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>

                {devTelemetry ? (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <div className="px-2 py-1 rounded bg-black/50 border border-white/10">
                        <span className="text-slate-400">expr: </span>
                        <span
                          className={
                            devTelemetry.expressionGate === 'BLOCK'
                              ? 'text-rose-400 font-bold'
                              : devTelemetry.expressionGate === 'WARN'
                              ? 'text-amber-300 font-bold'
                              : 'text-emerald-400 font-bold'
                          }
                        >
                          {devTelemetry.expressionScore.toFixed(3)} ({devTelemetry.expressionGate})
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-black/50 border border-white/10">
                        <span className="text-slate-400">conf: </span>
                        <span className="text-sky-300 font-bold">
                          {Math.round(devTelemetry.scanConfidence * 100)}%
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-black/50 border border-white/10">
                        <span className="text-slate-400">pose: </span>
                        <span className="text-white">
                          Y{Math.round(devTelemetry.yawDeg)}° R{Math.round(devTelemetry.rollDeg)}° P
                          {Math.round(devTelemetry.pitchDeg)}°
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-black/50 border border-white/10">
                        <span className="text-slate-400">sharp/lum: </span>
                        <span className="text-white">
                          {devTelemetry.sharpness.toFixed(1)} / {Math.round(devTelemetry.brightness)}
                        </span>
                      </div>
                    </div>

                    {devTelemetry.expressionCue && (
                      <div className="px-2 py-1 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                        Active cue: {devTelemetry.expressionCue}
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                      {EXPRESSION_BLENDSHAPE_GROUPS.map((g) => {
                        const val = g.keys.reduce(
                          (mx, k) => Math.max(mx, devTelemetry.blendshapes?.[k] ?? 0),
                          0
                        );
                        return (
                          <div
                            key={g.id}
                            className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5 flex justify-between gap-1"
                          >
                            <span className="text-slate-400 truncate">{g.id}</span>
                            <span className={val > 0.2 ? 'text-amber-300 font-bold' : 'text-slate-200'}>
                              {val.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="px-2 py-1 rounded bg-black/40 border border-white/5 text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>faceW:{devTelemetry.faceWidthFrac.toFixed(2)}</span>
                      <span>
                        shots:F={state.captures.front.status},L={state.captures.left.status},R=
                        {state.captures.right.status}
                      </span>
                      <span>
                        liveLandmarks:{latestLiveRef.current?.landmarks.length ?? 0}
                      </span>
                    </div>

                    {devTelemetry.rawMetrics && (
                      <div className="px-2 py-1 rounded bg-black/50 border border-white/10 text-emerald-200 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>thirds:{devTelemetry.rawMetrics.thirds}%</span>
                        <span>fWHR:{devTelemetry.rawMetrics.fwhr}x</span>
                        <span>jaw/cheek:{devTelemetry.rawMetrics.jawToCheek}x</span>
                        <span>canthal:{devTelemetry.rawMetrics.canthalDeg}°</span>
                        <span>eyeSpace:{devTelemetry.rawMetrics.eyeSpacing}x</span>
                        <span>mouth/nose:{devTelemetry.rawMetrics.mouthToNose}x</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-400">Waiting for live face frame telemetry...</p>
                )}
              </div>
            )}

            {/* Temporary dev debug strip (?debug=1) */}
            {showDebugStrip && (
              <div className="pt-2 border-t border-white/10 text-[10px] font-mono-num text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                <span>idx:{state.stepIndex}</span>
                <span>step:{currentCapture.status}</span>
                <span>busy:{String(state.busy)}</span>
                <span>ready:{String(state.finalReady)}</span>
                <span>
                  shots:F={state.captures.front.status},L={state.captures.left.status},R={state.captures.right.status}
                </span>
                {state.error && <span className="text-amber-300">err:{state.error}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10s Stuck Detection / On-Demand Camera Help Sheet */}
      {showHelpSheet && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-md rounded-[26px] bg-[#0B120F] border border-emerald-500/30 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="font-display text-base font-bold">Quick Setup Tips</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  blockStartMsRef.current = null;
                  setShowHelpSheet(false);
                }}
                aria-label="Close tips"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                1. Keep the camera at eye level instead of tilting down or up.
              </li>
              <li className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                2. Face a bright window so light hits both cheeks evenly.
              </li>
              <li className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                3. Pull hair off your forehead and remove thick-rimmed glasses.
              </li>
              <li className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                4. Hold your phone at arm&apos;s length so your full face fits inside the ring.
              </li>
            </ul>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  blockStartMsRef.current = null;
                  setShowHelpSheet(false);
                }}
                className="py-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold min-h-[48px]"
              >
                Try Camera Again
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHelpSheet(false);
                  uploadInputRef.current?.click();
                }}
                className="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#03150E] text-xs font-bold min-h-[48px] flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> Use upload instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};
