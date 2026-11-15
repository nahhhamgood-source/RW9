import type { IncomingMessage, ServerResponse } from 'node:http';

export interface VercelLikeRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

export interface VercelLikeResponse extends ServerResponse {
  status: (code: number) => VercelLikeResponse;
  json: (payload: unknown) => void;
}

const ipBuckets = new Map<string, number[]>();
const dailyTracker = {
  dateKey: new Date().toISOString().slice(0, 10),
  count: 0,
};

export function sendJson(
  res: VercelLikeResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(body);
    return;
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

export function redactSecrets(input: string, apiKey?: string): string {
  let out = String(input || '');
  if (apiKey) out = out.split(apiKey).join('[redacted]');
  return out
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

export function getClientIp(req: VercelLikeRequest): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff[0]) return xff[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function isKillSwitchActive(): boolean {
  const val = (process.env.DISABLE_AI_ENDPOINTS || '').trim().toLowerCase();
  return val === '1' || val === 'true' || val === 'yes';
}

export function checkSameOrigin(req: VercelLikeRequest): { ok: boolean; reason?: string } {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) {
    // Allow direct curl / same-origin calls lacking an Origin header
    return { ok: true };
  }
  try {
    const parsedOrigin = new URL(origin);
    const originHost = parsedOrigin.host.toLowerCase();
    const requestHost = host.toLowerCase();
    if (originHost === requestHost) return { ok: true };
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost) && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(requestHost)) {
      return { ok: true };
    }
    const extraAllowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extraAllowed.includes(parsedOrigin.origin.toLowerCase())) {
      return { ok: true };
    }
    return { ok: false, reason: `Cross-origin request from "${parsedOrigin.origin}" is blocked.` };
  } catch {
    return { ok: false, reason: 'Invalid Origin header.' };
  }
}

export function checkRateLimit(
  req: VercelLikeRequest,
  endpointKey: string,
  limitPerMinute = 20,
  dailyMax = 1500
): { ok: boolean; retryAfterSec?: number; reason?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyTracker.dateKey !== today) {
    dailyTracker.dateKey = today;
    dailyTracker.count = 0;
  }
  if (dailyTracker.count >= dailyMax) {
    return { ok: false, retryAfterSec: 3600, reason: 'Daily API safety cap reached.' };
  }

  const now = Date.now();
  const windowMs = 60_000;
  const bucketKey = `${endpointKey}:${getClientIp(req)}`;
  const prev = (ipBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  if (prev.length >= limitPerMinute) {
    const oldest = prev[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    ipBuckets.set(bucketKey, prev);
    return {
      ok: false,
      retryAfterSec,
      reason: `Too many requests. Wait ${retryAfterSec}s before trying again.`,
    };
  }
  prev.push(now);
  ipBuckets.set(bucketKey, prev);
  dailyTracker.count += 1;
  return { ok: true };
}

export async function readJsonBodyWithLimit<T = Record<string, unknown>>(
  req: VercelLikeRequest,
  maxBytes = 750_000
): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    const approxSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (approxSize > maxBytes) {
      throw new Error(`Request payload exceeds ${Math.round(maxBytes / 1024)} KB limit.`);
    }
    return req.body as T;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
      throw new Error(`Request payload exceeds ${Math.round(maxBytes / 1024)} KB limit.`);
    }
    return JSON.parse(req.body) as T;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Request payload exceeds ${Math.round(maxBytes / 1024)} KB limit.`);
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function enforcePostSecurity(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  endpointKey: string,
  options?: { limitPerMin?: number }
): boolean {
  const originCheck = checkSameOrigin(req);
  if (!originCheck.ok) {
    sendJson(res, 403, {
      ok: false,
      error: 'Cross-site request blocked.',
      detail: originCheck.reason,
    });
    return false;
  }

  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct && !ct.includes('application/json')) {
    sendJson(res, 415, {
      ok: false,
      error: 'Unsupported Content-Type. Expected application/json.',
    });
    return false;
  }

  if (isKillSwitchActive()) {
    sendJson(res, 503, {
      ok: false,
      code: 'KILL_SWITCH_ACTIVE',
      error: 'Online AI features are temporarily paused by the server administrator.',
      detail: 'Local tracking, face scanner, and offline coach remain available.',
    });
    return false;
  }

  const rate = checkRateLimit(req, endpointKey, options?.limitPerMin ?? 20);
  if (!rate.ok) {
    if (rate.retryAfterSec) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
    }
    sendJson(res, 429, {
      ok: false,
      error: rate.reason || 'Rate limit exceeded.',
    });
    return false;
  }

  return true;
}
