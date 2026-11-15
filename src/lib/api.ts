import type { AppSettings } from '../types';
import { recordErrorLog } from './errorLog';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string; status?: number; code?: string };

export interface ApiFetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  retryTransient?: boolean;
}

export function hasOnlineConsent(
  settings: Partial<AppSettings> | null | undefined,
  feature: 'food' | 'coach'
): boolean {
  if (!settings?.onlineConsentSeen) return false;
  return feature === 'food' ? Boolean(settings.onlineFoodEnabled) : Boolean(settings.onlineCoachEnabled);
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export async function apiRequest<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      error: 'You are offline. Online AI features need an internet connection.',
      code: 'OFFLINE',
    };
  }

  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxAttempts = options.retryTransient ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' && options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const snippet = (await response.text().catch(() => '')).slice(0, 120);
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          continue;
        }
        return {
          ok: false,
          status: response.status,
          error: `Unexpected server response (${response.status}).`,
          detail: snippet || contentType,
        };
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        data?: T;
        error?: string;
        detail?: string;
        code?: string;
      };

      if (!response.ok || payload.ok === false) {
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await new Promise((r) => setTimeout(r, 450));
          continue;
        }
        return {
          ok: false,
          status: response.status,
          code: payload.code,
          error: payload.error || `Request failed (${response.status}).`,
          detail: payload.detail,
        };
      }

      return {
        ok: true,
        data: (payload.data !== undefined ? payload.data : (payload as unknown as T)),
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (attempt < maxAttempts && !isAbort) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      const message = isAbort
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
        : err instanceof Error
        ? err.message
        : 'Network error.';
      recordErrorLog(`api:${path}`, message);
      return {
        ok: false,
        error: message,
        code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  return { ok: false, error: 'Request failed.' };
}

export interface ServerHealthStatus {
  ok: boolean;
  status: string;
  services?: {
    food: boolean;
    coach: boolean;
    geminiConfigured: boolean;
    pushConfigured: boolean;
    killSwitchActive: boolean;
  };
}

export async function checkApiHealth(): Promise<ApiResult<ServerHealthStatus>> {
  return apiRequest<ServerHealthStatus>('/api/health', { timeoutMs: 6000 });
}

export interface CoachApiSuggestion {
  type: 'task' | 'meal';
  title: string;
  protocolId?: string;
  calories?: number;
  proteinG?: number;
}

export interface CoachApiResponse {
  title: string;
  reply: string;
  bullets: string[];
  moreDetail: string;
  suggestions: CoachApiSuggestion[];
  escalateNote?: string;
}

export async function askOnlineCoach(payload: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  contextSummary?: string;
  isUnder18?: boolean;
}): Promise<ApiResult<CoachApiResponse>> {
  return apiRequest<CoachApiResponse>('/api/coach', {
    method: 'POST',
    body: payload,
    timeoutMs: 22_000,
    retryTransient: true,
  });
}
