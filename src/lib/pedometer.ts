export type PedometerStatus = 'idle' | 'active' | 'unsupported' | 'permission_denied';

export interface PedometerState {
  status: PedometerStatus;
  sessionSteps: number;
  lastStepAt: number | null;
}

type StepCallback = (deltaSteps: number) => void;
type StatusCallback = (state: PedometerState) => void;

const statusListeners = new Set<StatusCallback>();
let currentState: PedometerState = {
  status: 'idle',
  sessionSteps: 0,
  lastStepAt: null,
};

let motionHandler: ((ev: DeviceMotionEvent) => void) | null = null;
let gravityBaseline = 9.81;
let aboveThreshold = false;
let lastPeakMs = 0;

function emitStatus() {
  statusListeners.forEach((cb) => cb({ ...currentState }));
}

export function getPedometerState(): PedometerState {
  return { ...currentState };
}

export function subscribePedometerStatus(cb: StatusCallback): () => void {
  statusListeners.add(cb);
  cb({ ...currentState });
  return () => statusListeners.delete(cb);
}

export function isDeviceMotionSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

export function needsMotionPermission(): boolean {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false;
  const DME = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  return typeof DME.requestPermission === 'function';
}

export async function startBrowserPedometer(onStep: StepCallback): Promise<PedometerStatus> {
  if (!isDeviceMotionSupported()) {
    currentState = { ...currentState, status: 'unsupported' };
    emitStatus();
    return 'unsupported';
  }

  const DME = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  if (typeof DME.requestPermission === 'function') {
    try {
      const res = await DME.requestPermission();
      if (res !== 'granted') {
        currentState = { ...currentState, status: 'permission_denied' };
        emitStatus();
        return 'permission_denied';
      }
    } catch {
      currentState = { ...currentState, status: 'permission_denied' };
      emitStatus();
      return 'permission_denied';
    }
  }

  stopBrowserPedometer();

  gravityBaseline = 9.81;
  aboveThreshold = false;
  lastPeakMs = 0;

  motionHandler = (ev: DeviceMotionEvent) => {
    const acc = ev.accelerationIncludingGravity ?? ev.acceleration;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    const mag = Math.hypot(x, y, z);
    if (!Number.isFinite(mag) || mag === 0) return;

    // Low-pass gravity baseline & high-pass dynamic impulse
    gravityBaseline = gravityBaseline * 0.9 + mag * 0.1;
    const impulse = mag - gravityBaseline;

    const now = Date.now();
    // Walking cadence refractory period (280ms = ~214 steps/min max)
    if (!aboveThreshold && impulse > 1.35) {
      aboveThreshold = true;
      if (now - lastPeakMs >= 280) {
        lastPeakMs = now;
        currentState = {
          status: 'active',
          sessionSteps: currentState.sessionSteps + 1,
          lastStepAt: now,
        };
        onStep(1);
        emitStatus();
      }
    } else if (aboveThreshold && impulse < 0.55) {
      aboveThreshold = false;
    }
  };

  window.addEventListener('devicemotion', motionHandler);
  currentState = { ...currentState, status: 'active' };
  emitStatus();
  return 'active';
}

export function stopBrowserPedometer(): void {
  if (motionHandler && typeof window !== 'undefined') {
    window.removeEventListener('devicemotion', motionHandler);
    motionHandler = null;
  }
  if (currentState.status === 'active') {
    currentState = { ...currentState, status: 'idle' };
    emitStatus();
  }
}
