import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { QualityCheckResult } from '../../lib/faceMetrics';

export type GuidedStepKey = 'front' | 'left' | 'right';

export type StepLifecycleStatus =
  | 'idle'
  | 'live'
  | 'capturing'
  | 'reviewing'
  | 'accepted'
  | 'skipped';

export type CaptureDataStatus =
  | 'idle'
  | 'captured'
  | 'captured, landmarks missing'
  | 'skipped';

export interface StepEntry {
  status: StepLifecycleStatus;
  captureStatus: CaptureDataStatus;
  image?: string;
  canvas?: HTMLCanvasElement;
  landmarks?: NormalizedLandmark[] | null;
  confidence?: 'high' | 'medium' | 'low';
  quality?: QualityCheckResult;
  previewUrl?: string;
  isMirrored?: boolean;
  note?: string;
}

export interface ScannerMachineState {
  stepIndex: number;
  finalReady: boolean;
  captures: {
    front: StepEntry;
    left: StepEntry;
    right: StepEntry;
    profile90?: StepEntry;
  };
  pendingReview: StepEntry | null;
  busy: boolean;
  phase: 'capture' | 'analyzing';
  error: string | null;
  analyzePct: number;
  analyzeMessage: string;
  analyzeError: string | null;
}

export type ScannerAction =
  | { type: 'CAMERA_LIVE' }
  | { type: 'CAPTURE_START' }
  | {
      type: 'CAPTURE_SUCCESS';
      imageData: string;
      canvas: HTMLCanvasElement;
      landmarks: NormalizedLandmark[] | null;
      confidence: 'high' | 'medium' | 'low';
      quality: QualityCheckResult;
      previewUrl: string;
      captureStatus: 'captured' | 'captured, landmarks missing';
      isMirrored?: boolean;
      note?: string;
    }
  | { type: 'CAPTURE_FAILED'; reason: string }
  | { type: 'ACCEPT'; expectedStepIndex?: number }
  | { type: 'RETAKE'; stepKey?: GuidedStepKey }
  | { type: 'SKIP'; expectedStepIndex?: number }
  | { type: 'BACK'; expectedStepIndex?: number }
  | { type: 'GO_TO'; step: number }
  | { type: 'FINISH'; allowWithoutFront?: boolean }
  | { type: 'ANALYZE_PROGRESS'; pct: number; message: string }
  | { type: 'ANALYZE_FAILED'; reason: string }
  | { type: 'ANALYZE_DONE' }
  | { type: 'ANALYZE_BACK_TO_CAMERA' }
  | { type: 'RESTORE_DRAFT'; captures: Partial<Record<GuidedStepKey, StepEntry>>; stepIndex: number }
  | { type: 'CLEAR_ERROR' };

export const STEP_META: Array<{
  key: GuidedStepKey;
  shortTitle: string;
  title: string;
  instruction: string;
  optional: boolean;
}> = [
  {
    key: 'front',
    shortTitle: 'Front',
    title: 'Front (0°)',
    instruction: 'Hold phone at eye level and look straight ahead.',
    optional: false,
  },
  {
    key: 'left',
    shortTitle: 'Left',
    title: 'Left Side (~45°)',
    instruction: 'Turn your head slightly RIGHT so your left jaw faces the camera.',
    optional: true,
  },
  {
    key: 'right',
    shortTitle: 'Right',
    title: 'Right Side (~45°)',
    instruction: 'Turn your head slightly LEFT so your right jaw faces the camera.',
    optional: true,
  },
];

const emptyStep = (): StepEntry => ({
  status: 'idle',
  captureStatus: 'idle',
});

export function createInitialScannerState(initialStepIndex = 0, prefillFront = false): ScannerMachineState {
  return {
    stepIndex: Math.max(0, Math.min(STEP_META.length - 1, initialStepIndex)),
    finalReady: false,
    captures: {
      front: prefillFront
        ? { status: 'accepted', captureStatus: 'captured', confidence: 'high' }
        : emptyStep(),
      left: emptyStep(),
      right: emptyStep(),
    },
    pendingReview: null,
    busy: false,
    phase: 'capture',
    error: null,
    analyzePct: 0,
    analyzeMessage: 'Preparing photo analysis...',
    analyzeError: null,
  };
}

export function scannerReducer(
  state: ScannerMachineState,
  action: ScannerAction
): ScannerMachineState {
  const currentKey = STEP_META[state.stepIndex].key;

  switch (action.type) {
    case 'CAMERA_LIVE': {
      if (state.phase !== 'capture' || state.pendingReview) return state;
      const cur = state.captures[currentKey];
      if (cur.status !== 'idle') return state;
      return {
        ...state,
        captures: {
          ...state.captures,
          [currentKey]: { ...cur, status: 'live' },
        },
      };
    }

    case 'CAPTURE_START': {
      if (state.busy || state.phase !== 'capture') return state;
      return {
        ...state,
        busy: true,
        error: null,
        captures: {
          ...state.captures,
          [currentKey]: {
            ...state.captures[currentKey],
            status: 'capturing',
          },
        },
      };
    }

    case 'CAPTURE_SUCCESS': {
      const reviewEntry: StepEntry = {
        status: 'reviewing',
        captureStatus: action.captureStatus,
        image: action.imageData,
        canvas: action.canvas,
        landmarks: action.landmarks,
        confidence: action.confidence,
        quality: action.quality,
        previewUrl: action.previewUrl,
        isMirrored: action.isMirrored,
        note: action.note,
      };
      return {
        ...state,
        busy: false,
        error: action.note ?? null,
        pendingReview: reviewEntry,
        finalReady: false,
        captures: {
          ...state.captures,
          [currentKey]: {
            ...state.captures[currentKey],
            status: 'reviewing',
          },
        },
      };
    }

    case 'CAPTURE_FAILED': {
      const cur = state.captures[currentKey];
      return {
        ...state,
        busy: false,
        error: action.reason,
        pendingReview: null,
        captures: {
          ...state.captures,
          [currentKey]: {
            ...cur,
            status: cur.captureStatus === 'captured' || cur.captureStatus === 'captured, landmarks missing'
              ? 'accepted'
              : 'live',
          },
        },
      };
    }

    case 'ACCEPT': {
      if (state.busy || !state.pendingReview) return state;
      if (action.expectedStepIndex !== undefined && action.expectedStepIndex !== state.stepIndex) {
        return state;
      }
      const accepted: StepEntry = {
        ...state.pendingReview,
        status: 'accepted',
      };
      const nextCaptures = {
        ...state.captures,
        [currentKey]: accepted,
      };
      const isLast = state.stepIndex >= STEP_META.length - 1;
      return {
        ...state,
        busy: false,
        error: null,
        pendingReview: null,
        captures: nextCaptures,
        stepIndex: isLast ? state.stepIndex : state.stepIndex + 1,
        finalReady: isLast,
      };
    }

    case 'RETAKE': {
      if (state.busy) return state;
      const idx = action.stepKey
        ? STEP_META.findIndex((s) => s.key === action.stepKey)
        : state.stepIndex;
      const safeIdx = idx >= 0 ? idx : state.stepIndex;
      const targetKey = STEP_META[safeIdx].key;
      return {
        ...state,
        stepIndex: safeIdx,
        finalReady: false,
        pendingReview: null,
        error: null,
        captures: {
          ...state.captures,
          [targetKey]: {
            status: 'live',
            captureStatus: 'idle',
          },
        },
      };
    }

    case 'SKIP': {
      if (state.busy) return state;
      if (action.expectedStepIndex !== undefined && action.expectedStepIndex !== state.stepIndex) {
        return state;
      }
      const nextCaptures = {
        ...state.captures,
        [currentKey]: {
          status: 'skipped' as const,
          captureStatus: 'skipped' as const,
        },
      };
      const isLast = state.stepIndex >= STEP_META.length - 1;
      return {
        ...state,
        busy: false,
        error: null,
        pendingReview: null,
        captures: nextCaptures,
        stepIndex: isLast ? state.stepIndex : state.stepIndex + 1,
        finalReady: isLast,
      };
    }

    case 'BACK': {
      if (state.busy) return state;
      if (action.expectedStepIndex !== undefined && action.expectedStepIndex !== state.stepIndex) {
        return state;
      }
      if (state.finalReady) {
        return {
          ...state,
          finalReady: false,
          pendingReview: null,
          error: null,
        };
      }
      if (state.pendingReview) {
        return {
          ...state,
          pendingReview: null,
          error: null,
          captures: {
            ...state.captures,
            [currentKey]: {
              ...state.captures[currentKey],
              status: 'live',
            },
          },
        };
      }
      if (state.stepIndex > 0) {
        return {
          ...state,
          stepIndex: state.stepIndex - 1,
          pendingReview: null,
          finalReady: false,
          error: null,
        };
      }
      return state;
    }

    case 'GO_TO': {
      if (state.busy || state.phase === 'analyzing') return state;
      const nextIdx = Math.max(0, Math.min(STEP_META.length - 1, action.step));
      return {
        ...state,
        stepIndex: nextIdx,
        finalReady: false,
        pendingReview: null,
        error: null,
      };
    }

    case 'FINISH': {
      if (state.busy) return state;
      const frontOk = state.captures.front.status === 'accepted' || Boolean(action.allowWithoutFront);
      if (!frontOk) {
        return {
          ...state,
          error: 'Capture Front (0°) first before viewing your report.',
        };
      }
      return {
        ...state,
        busy: true,
        phase: 'analyzing',
        analyzePct: 12,
        analyzeMessage: 'De-rotating and normalizing landmarks...',
        analyzeError: null,
        error: null,
      };
    }

    case 'ANALYZE_PROGRESS': {
      return {
        ...state,
        analyzePct: action.pct,
        analyzeMessage: action.message,
      };
    }

    case 'ANALYZE_FAILED': {
      return {
        ...state,
        busy: false,
        analyzeError: action.reason,
      };
    }

    case 'ANALYZE_DONE': {
      return {
        ...state,
        busy: false,
        analyzePct: 100,
      };
    }

    case 'ANALYZE_BACK_TO_CAMERA': {
      return {
        ...state,
        busy: false,
        phase: 'capture',
        analyzeError: null,
        finalReady: false,
      };
    }

    case 'RESTORE_DRAFT': {
      return {
        ...state,
        stepIndex: Math.max(0, Math.min(STEP_META.length - 1, action.stepIndex)),
        captures: {
          front: action.captures.front ?? state.captures.front,
          left: action.captures.left ?? state.captures.left,
          right: action.captures.right ?? state.captures.right,
        },
        pendingReview: null,
        finalReady: false,
      };
    }

    case 'CLEAR_ERROR': {
      return { ...state, error: null };
    }

    default:
      return state;
  }
}
