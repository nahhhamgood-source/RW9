export interface LoggedErrorEntry {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  detail?: string;
}

const ERROR_LOG_KEY = 'ascend_error_log_v1';
const MAX_ERROR_LOG = 30;
let listenersSetup = false;

function sanitizeErrorText(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

export function getErrorLog(): LoggedErrorEntry[] {
  try {
    const raw = window.localStorage.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedErrorEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordErrorLog(source: string, error: unknown, detail?: string): void {
  try {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Unknown error';
    const nextEntry: LoggedErrorEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      source: sanitizeErrorText(source),
      message: sanitizeErrorText(msg),
      detail: detail ? sanitizeErrorText(detail) : undefined,
    };
    const existing = getErrorLog();
    const updated = [nextEntry, ...existing].slice(0, MAX_ERROR_LOG);
    window.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors inside error logger
  }
}

export function clearErrorLog(): void {
  try {
    window.localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // ignore
  }
}

export function installGlobalErrorListeners(): void {
  if (typeof window === 'undefined' || listenersSetup) return;
  listenersSetup = true;

  window.addEventListener('error', (event) => {
    const msg = event.message || 'Uncaught window error';
    // Ignore noisy cross-origin resize observer warnings
    if (/ResizeObserver loop/i.test(msg)) return;
    recordErrorLog(
      'window.error',
      msg,
      event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
    // Ignore expected abort cancellations
    if (/AbortError|aborted/i.test(msg)) return;
    recordErrorLog('unhandledrejection', reason);
  });
}
